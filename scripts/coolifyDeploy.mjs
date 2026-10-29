#!/usr/bin/env node
/**
 * Deploy da imagem de produção no Coolify (docs/0011 §13). Usado pelo
 * workflow `.github/workflows/docker-image.yml` (push na master / disparo
 * manual) e por `.github/workflows/rollback-producao.yml`.
 *
 * Fluxo (modo `deploy` e `rollback`):
 *   1. confere a configuração (URL https, UUID, tag `producao-<sha completo>`);
 *   2. `deploy` apenas: recusa se o commit deixou de ser a ponta da master — uma
 *      execução antiga (re-run, fila) nunca substitui uma versão mais recente;
 *   3. GET da aplicação: confere que é a aplicação certa (imagem do GHCR do
 *      projeto, build pack `dockerimage`) e guarda a tag atual (para rollback);
 *   4. PATCH só de `docker_registry_image_tag`, com leitura de volta;
 *   5. POST /deploy?uuid=…&force=false;
 *   6. acompanha o deployment até terminar e, se `SITE_URL` existir,
 *      confere `version` em /api/health (informativo).
 * Modo `verify`: só os passos 1 e 3 (leitura). Não altera nada no Coolify.
 *
 * Segredos: o token só vai no cabeçalho Authorization. Nada de corpo de
 * resposta, cabeçalho ou token é impresso — só campos conhecidos e o `message`
 * de erro do Coolify, truncado e sem o token.
 */
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TAG_RE = /^producao-[0-9a-f]{40}$/;
const UUID_RE = /^[a-z0-9]{8,64}$/i;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const IMAGE_RE = /^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._-]+$/;

export const DEFAULTS = {
  requestTimeoutMs: 30_000,
  pollIntervalMs: 10_000,
  deployTimeoutMs: 15 * 60_000,
  maxPollErrors: 5,
  healthAttempts: 6,
  healthIntervalMs: 20_000,
};

const FAILED_STATUSES = new Set(["failed", "cancelled-by-user", "cancelled", "error"]);

/** Falha do deploy já descrita para o usuário (sem segredos). */
export class DeployError extends Error {
  constructor(message) {
    super(message);
    this.name = "DeployError";
  }
}

/** Erro HTTP da API do Coolify; `message` já vem saneada. */
export class CoolifyApiError extends DeployError {
  constructor(status, message) {
    super(`Coolify respondeu ${status}${message ? `: ${message}` : ""}`);
    this.name = "CoolifyApiError";
    this.status = status;
  }
}

/** `https://host[:porta]` sem barra final, sem `/api[/v1]`, sem credenciais. */
export function normalizeBaseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    throw new DeployError("COOLIFY_URL inválida.");
  }
  if (url.protocol !== "https:") {
    throw new DeployError("COOLIFY_URL deve usar https:// (o token seguiria em texto puro).");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new DeployError("COOLIFY_URL não deve ter credenciais, query ou fragmento.");
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/api(\/v1)?$/, "");
  return `${url.origin}${path}`;
}

/** Valida o ambiente. Lança `DeployError` sem ecoar nenhum valor secreto. */
export function resolveConfig(env) {
  const mode = (env.MODE ?? "deploy").trim();
  if (!["deploy", "rollback", "verify"].includes(mode)) {
    throw new DeployError(`MODE inválido: use deploy, rollback ou verify.`);
  }
  const token = (env.COOLIFY_TOKEN ?? "").trim();
  if (!token) throw new DeployError("COOLIFY_TOKEN ausente (secret da Environment producao).");
  const appUuid = (env.COOLIFY_APP_UUID ?? "").trim();
  if (!UUID_RE.test(appUuid)) throw new DeployError("COOLIFY_APP_UUID ausente ou inválido.");
  const baseUrl = normalizeBaseUrl(env.COOLIFY_URL);

  const imageName = (env.IMAGE_NAME ?? "").trim().toLowerCase();
  if (!IMAGE_RE.test(imageName)) throw new DeployError("IMAGE_NAME deve ser ghcr.io/<owner>/<imagem>.");
  const tag = (env.IMAGE_TAG ?? "").trim();
  if (!TAG_RE.test(tag)) throw new DeployError("IMAGE_TAG deve ser producao-<sha completo de 40 caracteres>.");
  const sha = tag.slice("producao-".length);
  if (env.EXPECTED_SHA && env.EXPECTED_SHA.trim() !== sha) {
    throw new DeployError("IMAGE_TAG não corresponde ao commit (EXPECTED_SHA).");
  }

  let healthUrl = null;
  if (env.SITE_URL?.trim()) {
    try {
      const site = new URL(env.SITE_URL.trim());
      if (site.protocol !== "https:") throw new Error("not https");
      healthUrl = new URL("/api/health", site.origin).toString();
    } catch {
      throw new DeployError("SITE_URL deve ser uma URL https válida.");
    }
  }

  let head = null;
  if (mode === "deploy") {
    const repo = (env.GITHUB_REPOSITORY ?? "").trim();
    if (!REPO_RE.test(repo)) throw new DeployError("GITHUB_REPOSITORY ausente (necessário para checar a ponta da master).");
    const ghToken = (env.GH_TOKEN ?? "").trim();
    if (!ghToken) throw new DeployError("GH_TOKEN ausente (necessário para checar a ponta da master).");
    head = { repo, token: ghToken, branch: (env.DEPLOY_BRANCH ?? "master").trim() || "master" };
  }

  return { mode, token, appUuid, baseUrl, imageName, tag, sha, healthUrl, head };
}

function scrub(text, secrets) {
  let out = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  for (const s of secrets) if (s) out = out.split(s).join("***");
  return out;
}

/** Cliente mínimo da API v1 do Coolify. Só GET é repetido pelo chamador. */
export function createCoolifyClient({ baseUrl, token, fetchImpl = fetch, timeoutMs = DEFAULTS.requestTimeoutMs }) {
  async function request(method, path, { query, body } = {}) {
    const url = new URL(`${baseUrl}/api/v1${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        redirect: "error", // nunca seguir redirecionamento com o token
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const reason = err?.name === "TimeoutError" ? "tempo esgotado" : "falha de rede";
      throw new DeployError(`Coolify inacessível em ${method} ${path} (${reason}).`);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = typeof data?.message === "string" ? scrub(data.message, [token]) : "";
      throw new CoolifyApiError(res.status, message);
    }
    return data;
  }
  return {
    getApplication: (uuid) => request("GET", `/applications/${uuid}`),
    setImageTag: (uuid, tag) => request("PATCH", `/applications/${uuid}`, { body: { docker_registry_image_tag: tag } }),
    startDeploy: (uuid) => request("POST", "/deploy", { query: { uuid, force: "false" } }),
    getDeployment: (deploymentUuid) => request("GET", `/deployments/${deploymentUuid}`),
  };
}

/**
 * Confere que a aplicação é a do projeto antes de qualquer escrita. Um campo
 * que o Coolify não devolve vira aviso; um campo diferente do esperado, erro.
 */
export function assertExpectedApplication(app, { imageName }) {
  const warnings = [];
  const name = typeof app?.docker_registry_image_name === "string" ? app.docker_registry_image_name.trim().toLowerCase() : null;
  if (name === null) {
    warnings.push("O Coolify não informou docker_registry_image_name; imagem da aplicação não conferida.");
  } else if (name !== imageName) {
    throw new DeployError("A aplicação do Coolify não usa a imagem esperada do GHCR; nada foi alterado.");
  }
  if (typeof app?.build_pack === "string" && app.build_pack !== "dockerimage") {
    throw new DeployError("A aplicação do Coolify não é do tipo Docker Image; nada foi alterado.");
  }
  const current = typeof app?.docker_registry_image_tag === "string" ? app.docker_registry_image_tag : null;
  return { currentTag: current, warnings };
}

/** `true` se `sha` ainda é a ponta de `branch`. Falha fechada se não der para saber. */
export async function isBranchHead({ repo, branch, sha, token, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`, {
      redirect: "error",
      signal: AbortSignal.timeout(DEFAULTS.requestTimeoutMs),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch {
    throw new DeployError("Não foi possível consultar a ponta da master no GitHub; deploy bloqueado.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || typeof data?.sha !== "string") {
    throw new DeployError(`Consulta da ponta da master falhou (HTTP ${res.status}); deploy bloqueado.`);
  }
  return { head: data.sha, isHead: data.sha === sha };
}

/** Espera o deployment sair de queued/in_progress. Devolve o status final. */
export async function waitForDeployment({
  client,
  deploymentUuid,
  sleep,
  now = Date.now,
  pollIntervalMs = DEFAULTS.pollIntervalMs,
  timeoutMs = DEFAULTS.deployTimeoutMs,
  maxPollErrors = DEFAULTS.maxPollErrors,
  onStatus = () => {},
}) {
  const deadline = now() + timeoutMs;
  let errors = 0;
  let last = null;
  for (;;) {
    try {
      const data = await client.getDeployment(deploymentUuid);
      errors = 0;
      const status = typeof data?.status === "string" ? data.status.toLowerCase() : "unknown";
      if (status !== last) onStatus(status);
      last = status;
      if (status === "finished") return "finished";
      if (FAILED_STATUSES.has(status)) return status;
    } catch (err) {
      if (!(err instanceof DeployError) || ++errors >= maxPollErrors) throw err;
    }
    if (now() >= deadline) {
      throw new DeployError(
        `Deploy iniciado, mas sem resultado após ${Math.round(timeoutMs / 60_000)} min (último status: ${last ?? "desconhecido"}). Confira no Coolify.`,
      );
    }
    await sleep(pollIntervalMs);
  }
}

/** Confere `version` em /api/health. Informativo: devolve true/false, nunca lança. */
export async function healthShowsVersion({
  url,
  sha,
  fetchImpl = fetch,
  sleep,
  attempts = DEFAULTS.healthAttempts,
  intervalMs = DEFAULTS.healthIntervalMs,
}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url, {
        redirect: "error",
        signal: AbortSignal.timeout(DEFAULTS.requestTimeoutMs),
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.version === sha) return true;
    } catch {
      // tenta de novo: o contêiner novo pode ainda estar assumindo o tráfego
    }
    if (i < attempts - 1) await sleep(intervalMs);
  }
  return false;
}

/**
 * Executa o modo pedido. Resultado: `deployed`, `superseded` (não é erro),
 * `verified`. Qualquer falha lança `DeployError`.
 */
export async function run(env, deps = {}) {
  const {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = Date.now,
    log = (line) => console.log(line),
    options = {},
  } = deps;
  const opts = { ...DEFAULTS, ...options };
  const cfg = resolveConfig(env);
  const client = createCoolifyClient({ baseUrl: cfg.baseUrl, token: cfg.token, fetchImpl, timeoutMs: opts.requestTimeoutMs });

  log(`Modo: ${cfg.mode} · imagem: ${cfg.imageName}:${cfg.tag}`);

  if (cfg.mode === "deploy") {
    const { head, isHead } = await isBranchHead({ ...cfg.head, sha: cfg.sha, fetchImpl });
    if (!isHead) {
      log(`::notice::Deploy ignorado: ${cfg.sha.slice(0, 7)} não é mais a ponta de ${cfg.head.branch} (${head.slice(0, 7)}). A execução do commit mais novo cuida do deploy.`);
      return { outcome: "superseded", sha: cfg.sha, head };
    }
  }

  const app = await client.getApplication(cfg.appUuid);
  const { currentTag, warnings } = assertExpectedApplication(app, { imageName: cfg.imageName });
  for (const w of warnings) log(`::warning::${w}`);
  log(`Tag atual no Coolify: ${currentTag ?? "(não informada)"}`);

  if (cfg.mode === "verify") {
    log("Verificação concluída: credenciais, UUID e imagem conferem. Nada foi alterado.");
    return { outcome: "verified", sha: cfg.sha, previousTag: currentTag, warnings };
  }

  if (currentTag === cfg.tag) {
    log("A aplicação já aponta para esta tag; o PATCH é desnecessário.");
  } else {
    await client.setImageTag(cfg.appUuid, cfg.tag);
    const after = await client.getApplication(cfg.appUuid);
    if (after?.docker_registry_image_tag !== cfg.tag) {
      throw new DeployError("O Coolify não gravou a nova tag; o deploy não foi iniciado.");
    }
    log(`Tag atualizada: ${currentTag ?? "(nenhuma)"} → ${cfg.tag}`);
  }

  const started = await client.startDeploy(cfg.appUuid);
  const deploymentUuid = started?.deployments?.find((d) => d?.resource_uuid === cfg.appUuid)?.deployment_uuid ?? started?.deployments?.[0]?.deployment_uuid;
  if (typeof deploymentUuid !== "string" || !deploymentUuid) {
    throw new DeployError("O Coolify não confirmou o início do deploy (resposta sem deployment_uuid).");
  }
  log(`Deploy iniciado: ${deploymentUuid}`);

  const status = await waitForDeployment({
    client,
    deploymentUuid,
    sleep,
    now,
    pollIntervalMs: opts.pollIntervalMs,
    timeoutMs: opts.deployTimeoutMs,
    maxPollErrors: opts.maxPollErrors,
    onStatus: (s) => log(`Status do deploy: ${s}`),
  });
  if (status !== "finished") {
    throw new DeployError(`Deploy terminou com status "${status}". A tag anterior era ${currentTag ?? "(desconhecida)"}.`);
  }

  let healthy = null;
  if (cfg.healthUrl) {
    healthy = await healthShowsVersion({ url: cfg.healthUrl, sha: cfg.sha, fetchImpl, sleep, attempts: opts.healthAttempts, intervalMs: opts.healthIntervalMs });
    log(
      healthy
        ? `/api/health informa a versão ${cfg.sha.slice(0, 7)}.`
        : "::warning::/api/health não informou a versão esperada no prazo (domínio ainda na Vercel? contêiner antigo?). O Coolify reportou o deploy como concluído.",
    );
  }

  return { outcome: "deployed", sha: cfg.sha, tag: cfg.tag, previousTag: currentTag, deploymentUuid, healthy, warnings };
}

function writeSummary(env, lines) {
  if (!env.GITHUB_STEP_SUMMARY) return;
  try {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  } catch {
    // o resumo é só conveniência
  }
}

export function summarize(result, env) {
  const img = `${env.IMAGE_NAME}:${env.IMAGE_TAG}`;
  if (result.outcome === "superseded") {
    return [
      "### Deploy ignorado (execução antiga)",
      "",
      `- Commit: \`${result.sha}\``,
      `- Ponta atual da master: \`${result.head}\``,
      "- O Coolify **não** foi alterado; o commit mais novo faz o seu próprio deploy.",
    ];
  }
  if (result.outcome === "verified") {
    return [
      "### Coolify verificado (nada foi alterado)",
      "",
      `- Tag atual: \`${result.previousTag ?? "n/d"}\``,
      `- Tag pretendida: \`${img}\``,
    ];
  }
  return [
    "### Deploy concluído no Coolify",
    "",
    `- SHA publicado: \`${result.sha}\``,
    `- Imagem: \`${img}\``,
    `- Tag anterior (rollback): \`${result.previousTag ?? "n/d"}\``,
    `- Deployment: \`${result.deploymentUuid}\``,
    `- /api/health com a versão: ${result.healthy === null ? "não verificado" : result.healthy ? "sim" : "**não confirmado**"}`,
    "",
    "Rollback: Actions → **Rollback produção** → informe a tag anterior acima.",
  ];
}

async function main() {
  try {
    const result = await run(process.env);
    writeSummary(process.env, summarize(result, process.env));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${result.outcome}\n`);
  } catch (err) {
    const message = err instanceof DeployError ? err.message : "Erro inesperado no script de deploy.";
    console.log(`::error::${message}`);
    writeSummary(process.env, ["### Deploy FALHOU", "", message]);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}

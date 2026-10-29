import { describe, it, expect } from "vitest";
import {
  CoolifyApiError,
  DeployError,
  assertExpectedApplication,
  normalizeBaseUrl,
  resolveConfig,
  run,
  summarize,
  waitForDeployment,
} from "../../scripts/coolifyDeploy.mjs";

/**
 * Deploy automático no Coolify (scripts/coolifyDeploy.mjs). A API é simulada:
 * nenhum teste fala com o Coolify, o GitHub ou a produção.
 */

const SHA = "0123456789abcdef0123456789abcdef01234567";
const NEWER = "fedcba9876543210fedcba9876543210fedcba98";
const OLD_TAG = `producao-${"b".repeat(40)}`;
const IMAGE = "ghcr.io/dono/antero-cartas";
const APP = "abcd1234efgh5678ijkl9012";
const TOKEN = "coolify-secret-token-9f8e7d";
const GH_TOKEN = "github-secret-token-1a2b3c";

const ENV = {
  MODE: "deploy",
  COOLIFY_URL: "https://coolify.example.com/",
  COOLIFY_APP_UUID: APP,
  COOLIFY_TOKEN: TOKEN,
  IMAGE_NAME: IMAGE,
  IMAGE_TAG: `producao-${SHA}`,
  EXPECTED_SHA: SHA,
  SITE_URL: "https://cartas.anterosistemas.com.br",
  GITHUB_REPOSITORY: "dono/antero-cartas",
  GH_TOKEN,
};

const FAST = { pollIntervalMs: 0, healthIntervalMs: 0, healthAttempts: 2, maxPollErrors: 3 };

interface Call {
  method: string;
  host: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

interface World {
  head?: string | "error";
  tag: string | null;
  imageName?: string | null;
  buildPack?: string;
  statuses?: string[];
  patchStatus?: number;
  patchPersists?: boolean;
  deployResponse?: unknown;
  deployStatus?: number;
  health?: { version: string | null } | "down";
}

/** Coolify + GitHub + site simulados; guarda cada chamada para as asserções. */
function createWorld(overrides: Partial<World> = {}) {
  const world: World = {
    head: SHA,
    tag: OLD_TAG,
    imageName: IMAGE,
    buildPack: "dockerimage",
    statuses: ["queued", "in_progress", "finished"],
    patchPersists: true,
    health: { version: SHA },
    ...overrides,
  };
  const calls: Call[] = [];
  let polls = 0;

  const fetchImpl = async (input: URL | string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input.toString());
    const call: Call = {
      method: init.method ?? "GET",
      host: url.host,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const json = (body: unknown, status = 200) => Response.json(body, { status });

    if (url.host === "api.github.com") {
      if (world.head === "error") return json({ message: "boom" }, 500);
      return json({ sha: world.head });
    }
    if (url.host === "cartas.anterosistemas.com.br") {
      if (world.health === "down") throw new TypeError("fetch failed");
      return json({ status: "ok", version: world.health?.version ?? null });
    }
    if (url.host !== "coolify.example.com") throw new Error(`host inesperado ${url.host}`);

    if (call.method === "GET" && url.pathname === `/api/v1/applications/${APP}`) {
      return json({
        uuid: APP,
        docker_registry_image_name: world.imageName ?? undefined,
        docker_registry_image_tag: world.tag,
        build_pack: world.buildPack,
        // o corpo real traz muito mais; nada disso pode vazar para o log
        custom_labels: "traefik.secret=nao-pode-vazar",
      });
    }
    if (call.method === "PATCH" && url.pathname === `/api/v1/applications/${APP}`) {
      if (world.patchStatus) return json({ message: `Unauthenticated com ${TOKEN}` }, world.patchStatus);
      if (world.patchPersists) world.tag = (call.body as { docker_registry_image_tag: string }).docker_registry_image_tag;
      return json({ uuid: APP });
    }
    if (call.method === "POST" && url.pathname === "/api/v1/deploy") {
      if (world.deployStatus) return json({ message: "erro" }, world.deployStatus);
      return json(
        world.deployResponse ?? {
          deployments: [{ message: "Deployment request queued.", resource_uuid: APP, deployment_uuid: "dep-123" }],
        },
      );
    }
    if (call.method === "GET" && url.pathname === "/api/v1/deployments/dep-123") {
      const list = world.statuses ?? ["finished"];
      const status = list[Math.min(polls++, list.length - 1)];
      return json({ deployment_uuid: "dep-123", status });
    }
    throw new Error(`rota inesperada ${call.method} ${url.pathname}`);
  };

  const logs: string[] = [];
  const deps = { fetchImpl, sleep: async () => {}, log: (l: string) => logs.push(l), options: FAST };
  const coolifyCalls = () => calls.filter((c) => c.host === "coolify.example.com");
  const writes = () => coolifyCalls().filter((c) => c.method !== "GET");
  return { world, calls, logs, deps, coolifyCalls, writes };
}

describe("fluxo feliz do deploy", () => {
  it("confere a ponta da master, troca SÓ a tag, inicia o deploy e espera terminar", async () => {
    const w = createWorld();
    const result = await run(ENV, w.deps);

    expect(result).toMatchObject({ outcome: "deployed", sha: SHA, previousTag: OLD_TAG, deploymentUuid: "dep-123", healthy: true });
    expect(w.world.tag).toBe(`producao-${SHA}`);

    const order = w.calls.map((c) => `${c.method} ${c.host}${c.path}`);
    expect(order.slice(0, 5)).toEqual([
      "GET api.github.com/repos/dono/antero-cartas/commits/master",
      `GET coolify.example.com/api/v1/applications/${APP}`,
      `PATCH coolify.example.com/api/v1/applications/${APP}`,
      `GET coolify.example.com/api/v1/applications/${APP}`, // leitura de volta
      "POST coolify.example.com/api/v1/deploy",
    ]);

    const [patch, post] = w.writes();
    expect(patch.body).toEqual({ docker_registry_image_tag: `producao-${SHA}` }); // nada além da tag
    expect(post.query).toEqual({ uuid: APP, force: "false" });
    expect(post.body).toBeUndefined();
    for (const c of w.coolifyCalls()) expect(c.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(w.calls[0].headers.authorization).toBe(`Bearer ${GH_TOKEN}`);
  });

  it("acompanha queued → in_progress → finished sem desistir cedo", async () => {
    const w = createWorld({ statuses: ["queued", "queued", "in_progress", "finished"] });
    await run(ENV, w.deps);
    expect(w.calls.filter((c) => c.path === "/api/v1/deployments/dep-123")).toHaveLength(4);
    expect(w.logs.filter((l) => l.startsWith("Status do deploy"))).toEqual([
      "Status do deploy: queued",
      "Status do deploy: in_progress",
      "Status do deploy: finished",
    ]);
  });

  it("não escreve a tag de novo se a aplicação já aponta para ela (re-run), mas reimplanta", async () => {
    const w = createWorld({ tag: `producao-${SHA}` });
    await run(ENV, w.deps);
    expect(w.writes().map((c) => c.method)).toEqual(["POST"]);
  });

  it("health sem a versão esperada é só aviso: o deploy continua concluído", async () => {
    const w = createWorld({ health: { version: "outra" } });
    const result = await run(ENV, w.deps);
    expect(result).toMatchObject({ outcome: "deployed", healthy: false });
    expect(w.logs.some((l) => l.startsWith("::warning::/api/health"))).toBe(true);
  });

  it("sem SITE_URL não consulta o health", async () => {
    const w = createWorld();
    const { SITE_URL: _omit, ...env } = ENV;
    void _omit;
    const result = await run(env, w.deps);
    expect(result).toMatchObject({ outcome: "deployed", healthy: null });
    expect(w.calls.some((c) => c.host === "cartas.anterosistemas.com.br")).toBe(false);
  });
});

describe("execução antiga nunca substitui a mais recente", () => {
  it("commit que não é mais a ponta da master: ignora, sem tocar no Coolify", async () => {
    const w = createWorld({ head: NEWER });
    const result = await run(ENV, w.deps);
    expect(result).toMatchObject({ outcome: "superseded", sha: SHA, head: NEWER });
    expect(w.coolifyCalls()).toHaveLength(0);
    expect(w.logs.join("\n")).toContain("::notice::Deploy ignorado");
  });

  it("não consegue saber a ponta da master: bloqueia (falha fechada)", async () => {
    const w = createWorld({ head: "error" });
    await expect(run(ENV, w.deps)).rejects.toThrow(/deploy bloqueado/);
    expect(w.coolifyCalls()).toHaveLength(0);
  });

  it("rollback não faz a checagem (a tag é antiga de propósito)", async () => {
    const w = createWorld({ tag: `producao-${NEWER}` });
    const env = { ...ENV, MODE: "rollback", IMAGE_TAG: OLD_TAG, EXPECTED_SHA: "" };
    const result = await run(env, w.deps);
    expect(result).toMatchObject({ outcome: "deployed", previousTag: `producao-${NEWER}` });
    expect(w.calls.some((c) => c.host === "api.github.com")).toBe(false);
    expect(w.writes()[0].body).toEqual({ docker_registry_image_tag: OLD_TAG });
  });
});

describe("falhas: o deploy não segue e o motivo é claro", () => {
  it("aplicação com outra imagem: recusa ANTES de qualquer escrita", async () => {
    const w = createWorld({ imageName: "ghcr.io/outro/projeto" });
    await expect(run(ENV, w.deps)).rejects.toThrow(/não usa a imagem esperada/);
    expect(w.writes()).toHaveLength(0);
  });

  it("aplicação que não é Docker Image: recusa ANTES de qualquer escrita", async () => {
    const w = createWorld({ buildPack: "nixpacks" });
    await expect(run(ENV, w.deps)).rejects.toThrow(/Docker Image/);
    expect(w.writes()).toHaveLength(0);
  });

  it("Coolify sem docker_registry_image_name: avisa, mas segue", async () => {
    const w = createWorld({ imageName: null });
    await run(ENV, w.deps);
    expect(w.logs.some((l) => l.startsWith("::warning::O Coolify não informou docker_registry_image_name"))).toBe(true);
    expect(w.writes()).toHaveLength(2);
  });

  it("PATCH recusado (401): erro sem vazar o token que veio na mensagem, sem POST", async () => {
    const w = createWorld({ patchStatus: 401 });
    const err = await run(ENV, w.deps).catch((e) => e);
    expect(err).toBeInstanceOf(CoolifyApiError);
    expect(err.status).toBe(401);
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).toContain("***");
    expect(w.writes().map((c) => c.method)).toEqual(["PATCH"]);
  });

  it("PATCH que não persiste a tag: não inicia o deploy", async () => {
    const w = createWorld({ patchPersists: false });
    await expect(run(ENV, w.deps)).rejects.toThrow(/não gravou a nova tag/);
    expect(w.writes().map((c) => c.method)).toEqual(["PATCH"]);
  });

  it("POST /deploy sem deployment_uuid: não declara sucesso", async () => {
    const w = createWorld({ deployResponse: { deployments: [] } });
    await expect(run(ENV, w.deps)).rejects.toThrow(/não confirmou o início do deploy/);
  });

  it("POST /deploy com erro HTTP", async () => {
    const w = createWorld({ deployStatus: 500 });
    await expect(run(ENV, w.deps)).rejects.toMatchObject({ name: "CoolifyApiError", status: 500 });
  });

  it("deployment 'failed': erro que informa a tag anterior para rollback", async () => {
    const w = createWorld({ statuses: ["in_progress", "failed"] });
    await expect(run(ENV, w.deps)).rejects.toThrow(new RegExp(`status "failed".*${OLD_TAG}`));
  });

  it("deployment cancelado também é falha", async () => {
    const w = createWorld({ statuses: ["cancelled-by-user"] });
    await expect(run(ENV, w.deps)).rejects.toThrow(/cancelled-by-user/);
  });

  it("Coolify inacessível: erro sem URL nem token", async () => {
    const deps = {
      ...createWorld().deps,
      fetchImpl: async () => {
        throw new TypeError(`fetch failed ${TOKEN}`);
      },
    };
    const err = await run({ ...ENV, MODE: "rollback", IMAGE_TAG: OLD_TAG, EXPECTED_SHA: "" }, deps).catch((e) => e);
    expect(err).toBeInstanceOf(DeployError);
    expect(err.message).toMatch(/inacessível/);
    expect(err.message).not.toContain(TOKEN);
  });
});

describe("waitForDeployment", () => {
  const fakeClient = (steps: Array<string | Error>) => {
    let i = 0;
    return {
      getDeployment: async () => {
        const s = steps[Math.min(i++, steps.length - 1)];
        if (s instanceof Error) throw s;
        return { status: s };
      },
    };
  };
  const base = { deploymentUuid: "d", sleep: async () => {}, pollIntervalMs: 0, maxPollErrors: 3 };

  it("tolera erros transitórios de leitura", async () => {
    const client = fakeClient([new DeployError("rede"), new DeployError("rede"), "in_progress", "finished"]);
    await expect(waitForDeployment({ ...base, client })).resolves.toBe("finished");
  });

  it("desiste depois de erros consecutivos demais", async () => {
    const client = fakeClient([new DeployError("rede")]);
    await expect(waitForDeployment({ ...base, client })).rejects.toThrow("rede");
  });

  it("prazo esgotado: erro explícito (deploy iniciado, resultado desconhecido)", async () => {
    let t = 0;
    const now = () => (t += 60_000);
    const client = fakeClient(["in_progress"]);
    await expect(waitForDeployment({ ...base, client, now, timeoutMs: 180_000 })).rejects.toThrow(
      /sem resultado após 3 min.*in_progress/,
    );
  });
});

describe("modo verify (só leitura)", () => {
  it("não escreve no Coolify nem consulta a master", async () => {
    const w = createWorld();
    const result = await run({ ...ENV, MODE: "verify" }, w.deps);
    expect(result).toMatchObject({ outcome: "verified", previousTag: OLD_TAG });
    expect(w.writes()).toHaveLength(0);
    expect(w.calls.some((c) => c.host === "api.github.com")).toBe(false);
  });
});

describe("segredos fora dos logs", () => {
  it("nenhuma linha de log nem o resumo contém tokens ou campos do corpo do Coolify", async () => {
    const w = createWorld();
    const result = await run(ENV, w.deps);
    const text = [...w.logs, ...summarize(result, ENV)].join("\n");
    for (const secret of [TOKEN, GH_TOKEN, "traefik.secret", "coolify.example.com"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain(SHA);
    expect(text).toContain(OLD_TAG); // tag anterior no resumo, para o rollback
  });
});

describe("resolveConfig", () => {
  it("aceita a configuração completa e deriva o sha da tag", () => {
    expect(resolveConfig(ENV)).toMatchObject({ mode: "deploy", sha: SHA, baseUrl: "https://coolify.example.com" });
  });

  it.each([
    ["sem token", { COOLIFY_TOKEN: "" }, /COOLIFY_TOKEN ausente/],
    ["UUID vazio", { COOLIFY_APP_UUID: "" }, /COOLIFY_APP_UUID/],
    ["UUID com caracteres perigosos", { COOLIFY_APP_UUID: "abc/../etc" }, /COOLIFY_APP_UUID/],
    ["URL em http", { COOLIFY_URL: "http://coolify.example.com" }, /https/],
    ["URL com credenciais", { COOLIFY_URL: "https://u:p@coolify.example.com" }, /credenciais/],
    ["URL inválida", { COOLIFY_URL: "não é url" }, /inválida/],
    ["tag de homologação", { IMAGE_TAG: `homologacao-${SHA}` }, /IMAGE_TAG/],
    ["tag com sha curto", { IMAGE_TAG: "producao-0123456" }, /IMAGE_TAG/],
    ["tag 'latest'", { IMAGE_TAG: "latest" }, /IMAGE_TAG/],
    ["tag de outro commit", { EXPECTED_SHA: NEWER }, /EXPECTED_SHA/],
    ["imagem fora do GHCR", { IMAGE_NAME: "docker.io/x/y" }, /IMAGE_NAME/],
    ["modo desconhecido", { MODE: "destroy" }, /MODE inválido/],
    ["deploy sem token do GitHub", { GH_TOKEN: "" }, /GH_TOKEN/],
    ["SITE_URL em http", { SITE_URL: "http://cartas.anterosistemas.com.br" }, /SITE_URL/],
  ])("recusa %s", (_name, patch, message) => {
    expect(() => resolveConfig({ ...ENV, ...patch })).toThrow(message);
  });

  it("a mensagem de erro nunca repete o token", () => {
    try {
      resolveConfig({ ...ENV, COOLIFY_URL: `http://${TOKEN}.example.com` });
    } catch (err) {
      expect((err as Error).message).not.toContain(TOKEN);
    }
  });
});

describe("normalizeBaseUrl", () => {
  it.each([
    ["https://coolify.example.com", "https://coolify.example.com"],
    ["https://coolify.example.com/", "https://coolify.example.com"],
    ["https://coolify.example.com/api/v1", "https://coolify.example.com"],
    ["https://coolify.example.com/api/v1/", "https://coolify.example.com"],
    ["https://coolify.example.com:8443/api", "https://coolify.example.com:8443"],
    [" https://painel.example.com/coolify/ ", "https://painel.example.com/coolify"],
  ])("%s → %s", (input, expected) => expect(normalizeBaseUrl(input)).toBe(expected));
});

describe("assertExpectedApplication", () => {
  it("compara a imagem sem diferenciar maiúsculas", () => {
    const r = assertExpectedApplication(
      { docker_registry_image_name: "GHCR.io/Dono/Antero-Cartas", docker_registry_image_tag: "x" },
      { imageName: IMAGE },
    );
    expect(r).toEqual({ currentTag: "x", warnings: [] });
  });
});

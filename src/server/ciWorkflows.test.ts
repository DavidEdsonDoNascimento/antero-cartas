import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { parse } from "yaml";

/**
 * Garantias estruturais do deploy automático (docs/0011 §13). Não executam o
 * GitHub Actions: leem os YAML e falham se alguém afrouxar uma regra de
 * segurança (deploy em PR, segredo no build, deploy sem passar pelos testes…).
 */

const root = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

/* eslint-disable @typescript-eslint/no-explicit-any */
const imageRaw = read(".github/workflows/docker-image.yml");
const image: any = parse(imageRaw);
const opsRaw = read(".github/workflows/coolify-producao.yml");
const ops: any = parse(opsRaw);

const stepNamed = (job: any, re: RegExp) => job.steps.find((s: any) => re.test(s.name ?? ""));
const stepUses = (job: any, prefix: string) => job.steps.find((s: any) => String(s.uses ?? "").startsWith(prefix));

describe("docker-image.yml — gatilhos", () => {
  it("analisa como YAML válido com os três jobs", () => {
    expect(Object.keys(image.jobs)).toEqual(["verificar", "imagem", "deploy"]);
  });

  it("dispara no push da master e manualmente; NUNCA em pull request", () => {
    expect(image.on.push.branches).toEqual(["master"]);
    expect(image.on.workflow_dispatch).toBeDefined();
    for (const trigger of ["pull_request", "pull_request_target", "schedule", "workflow_run", "release"]) {
      expect(image.on[trigger]).toBeUndefined();
    }
  });

  it("mantém as entradas manuais: ambiente, publicar e implantar (padrão: não)", () => {
    const inputs = image.on.workflow_dispatch.inputs;
    expect(inputs.ambiente.options).toEqual(["homologacao", "producao"]);
    expect(inputs.ambiente.default).toBe("homologacao");
    expect(inputs.publicar.default).toBe(false);
    expect(inputs.implantar.default).toBe(false);
  });

  it("a branch de homologação antiga não é mais gatilho", () => {
    expect(imageRaw).not.toContain("feat/coolify-hosting-preparation\n");
    expect(image.on.push.branches).not.toContain("feat/coolify-hosting-preparation");
  });
});

describe("docker-image.yml — encadeamento (falhou antes, não implanta)", () => {
  it("imagem depende de verificar; deploy depende de imagem", () => {
    expect(image.jobs.imagem.needs).toBe("verificar");
    expect(image.jobs.deploy.needs).toBe("imagem");
  });

  it("verificar roda lint, typecheck e a suíte com PostgreSQL 17", () => {
    const runs = image.jobs.verificar.steps.map((s: any) => s.run).filter(Boolean);
    expect(runs).toEqual(
      expect.arrayContaining(["pnpm lint", "pnpm typecheck", "pnpm test:integration:pg17"]),
    );
  });

  it("deploy só roda se tudo antes teve sucesso, publicou e foi autorizado", () => {
    const cond: string = image.jobs.deploy.if;
    expect(cond).toContain("success()");
    expect(cond).toContain("needs.imagem.outputs.deploy == 'true'");
    expect(cond).toContain("needs.imagem.outputs.publish == 'true'");
  });

  it("o passo de deploy não usa continue-on-error", () => {
    for (const job of Object.values<any>(image.jobs)) {
      expect(job["continue-on-error"]).toBeUndefined();
      for (const step of job.steps) expect(step["continue-on-error"]).toBeUndefined();
    }
  });
});

describe("docker-image.yml — publicação", () => {
  const meta = () => stepNamed(image.jobs.imagem, /decisões de publicar/);

  it("push publica e implanta sem depender de GHCR_PUBLISH; manual continua sob controle", () => {
    const script: string = meta().run;
    // push → publish=true e deploy=true, antes de qualquer menção à variável
    const pushBranch = script.slice(script.indexOf('if [ "$GITHUB_EVENT_NAME" = "push" ]'), script.indexOf("elif"));
    expect(pushBranch).toContain("publish=true");
    expect(pushBranch).toContain("deploy=true");
    expect(pushBranch).not.toContain("GHCR_PUBLISH");
    // manual → opção marcada E variável
    expect(script).toMatch(/elif \[ "\$PUBLICAR_INPUT" = "true" \] && \[ "\$GHCR_PUBLISH" = "true" \]/);
  });

  it("deploy manual: só producao, só da master, só publicando", () => {
    const script: string = meta().run;
    expect(script).toContain('[ "$AMBIENTE" = "producao" ] || fail');
    expect(script).toContain('[ "$GITHUB_REF" = "refs/heads/master" ] || fail');
    expect(script).toContain('[ "$publish" = "true" ] || fail');
  });

  it("a tag é <ambiente>-<sha completo> e nunca 'latest'", () => {
    expect(meta().run).toContain('echo "tag=${AMBIENTE}-${GITHUB_SHA}"');
    expect(imageRaw).not.toMatch(/:latest/);
  });

  it("não sobrescreve uma tag já publicada: o build só roda se ela não existir", () => {
    const existing = stepNamed(image.jobs.imagem, /Tag já publicada/);
    expect(existing.run).toContain("imagetools inspect");
    const build = stepUses(image.jobs.imagem, "docker/build-push-action");
    expect(build.if).toBe("steps.existing.outputs.exists != 'true'");
    expect(build.with.push).toContain("steps.meta.outputs.publish == 'true'");
  });

  it("login no GHCR só quando vai publicar, com o GITHUB_TOKEN", () => {
    const login = stepUses(image.jobs.imagem, "docker/login-action");
    expect(login.if).toBe("steps.meta.outputs.publish == 'true'");
    expect(login.with.password).toBe("${{ secrets.GITHUB_TOKEN }}");
  });

  it("os build args usam as variáveis da Environment e nenhum segredo", () => {
    const args: string = stepUses(image.jobs.imagem, "docker/build-push-action").with["build-args"];
    expect(args).toContain("APP_VERSION=${{ github.sha }}");
    expect(args).toContain("NEXT_PUBLIC_SITE_URL=${{ vars.NEXT_PUBLIC_SITE_URL }}");
    expect(args).not.toMatch(/secrets\./);
    expect(args).not.toMatch(/COOLIFY|DATABASE|ACCESS_TOKEN|WEBHOOK_SECRET|RESEND|API_KEY/);
  });

  it("produção continua com as barreiras de domínio, modo real e sem mock", () => {
    const check = stepNamed(image.jobs.imagem, /Conferir variáveis de build/);
    expect(check.run).toContain("cartas.anterosistemas.com.br");
    expect(check.run).toContain('"$PAYMENT_MODE" = "real"');
    expect(check.run).toContain("NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION");
  });

  it("no push, a Environment e o ambiente são sempre producao", () => {
    expect(image.jobs.imagem.environment).toContain("github.event_name == 'push' && 'producao'");
    expect(image.env.AMBIENTE).toContain("github.event_name == 'push' && 'producao'");
  });
});

describe("docker-image.yml — concorrência", () => {
  it("uma execução por ambiente, sem cancelar deploy em andamento", () => {
    expect(image.concurrency.group).toContain("docker-image-");
    expect(image.concurrency.group).toContain("github.event_name == 'push' && 'producao'");
    // Só build manual de homologação pode ser cancelado.
    expect(image.concurrency["cancel-in-progress"]).toBe(
      "${{ github.event_name == 'workflow_dispatch' && inputs.ambiente == 'homologacao' }}",
    );
  });

  it("o job deploy tem grupo próprio, igual ao do rollback, e nunca cancela", () => {
    expect(image.jobs.deploy.concurrency).toEqual({ group: "coolify-deploy-producao", "cancel-in-progress": false });
    expect(ops.jobs.coolify.concurrency).toEqual(image.jobs.deploy.concurrency);
  });
});

describe("docker-image.yml — job deploy", () => {
  const deploy = image.jobs.deploy;
  const step = () => stepNamed(deploy, /Coolify/);

  it("usa a Environment producao (secret COOLIFY_TOKEN só existe aqui)", () => {
    expect(deploy.environment.name).toBe("producao");
    expect(image.jobs.verificar.environment).toBeUndefined();
    expect(imageRaw.match(/secrets\.COOLIFY_TOKEN/g)).toHaveLength(1);
  });

  it("permissões mínimas: só leitura do repositório", () => {
    expect(deploy.permissions).toEqual({ contents: "read" });
  });

  it("chama o script versionado com variáveis/segredo da Environment", () => {
    expect(step().run).toBe("node scripts/coolifyDeploy.mjs");
    expect(step().env).toMatchObject({
      MODE: "deploy",
      COOLIFY_URL: "${{ vars.COOLIFY_URL }}",
      COOLIFY_APP_UUID: "${{ vars.COOLIFY_APP_UUID }}",
      COOLIFY_TOKEN: "${{ secrets.COOLIFY_TOKEN }}",
      IMAGE_TAG: "${{ needs.imagem.outputs.tag }}",
      EXPECTED_SHA: "${{ github.sha }}",
    });
  });

  it("o token nunca é interpolado em linha de comando (só via env)", () => {
    expect(imageRaw).not.toMatch(/run:.*COOLIFY_TOKEN/);
    expect(imageRaw).not.toMatch(/curl[^\n]*Authorization/i);
    expect(imageRaw).not.toMatch(/set -x|--debug/);
  });

  it("não constrói nada nem usa Docker na VPS: o deploy só fala com a API", () => {
    const text = JSON.stringify(deploy);
    expect(text).not.toMatch(/docker\/build-push-action|docker build|ssh /);
  });
});

describe("coolify-producao.yml — verificar e rollback", () => {
  const job = ops.jobs.coolify;

  it("só manual, só da master, só producao", () => {
    expect(Object.keys(ops.on)).toEqual(["workflow_dispatch"]);
    expect(job.if).toBe("github.ref == 'refs/heads/master'");
    expect(job.environment.name).toBe("producao");
  });

  it("rollback exige tag producao-<sha de 40 hex> e que ela exista no GHCR", () => {
    const alvo = stepNamed(job, /Imagem e tag/);
    expect(alvo.run).toContain("^producao-[0-9a-f]{40}$");
    const exists = stepNamed(job, /existe no GHCR/);
    expect(exists.if).toBe("inputs.acao == 'rollback'");
    expect(exists.run).toContain("docker manifest inspect");
  });

  it("ação padrão é verificar (somente leitura) e o script recebe o modo certo", () => {
    expect(ops.on.workflow_dispatch.inputs.acao.default).toBe("verificar");
    expect(stepNamed(job, /^Coolify$/).env.MODE).toBe("${{ inputs.acao == 'rollback' && 'rollback' || 'verify' }}");
  });

  it("não constrói imagem nem roda testes", () => {
    expect(JSON.stringify(job)).not.toMatch(/build-push-action|pnpm /);
  });
});

describe("ações de terceiros", () => {
  it("todas fixadas em versão maior (@vN), nenhuma em branch", () => {
    for (const raw of [imageRaw, opsRaw]) {
      const uses = [...raw.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
      expect(uses.length).toBeGreaterThan(0);
      for (const u of uses) expect(u).toMatch(/@v\d+$/);
    }
  });
});

describe("decisão de publicar/implantar — o script do workflow executado de verdade", () => {
  const script: string = stepNamed(image.jobs.imagem, /decisões de publicar/).run;
  const SHA = "0123456789abcdef0123456789abcdef01234567";

  function decide(env: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), "ci-meta-"));
    const out = join(dir, "output");
    writeFileSync(out, "");
    try {
      const r = spawnSync("bash", ["-e", "-c", script], {
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH ?? "",
          GITHUB_OUTPUT: out,
          GITHUB_REPOSITORY_OWNER: "DonoDoRepo",
          GITHUB_SHA: SHA,
          GITHUB_REF: "refs/heads/master",
          ...env,
        },
        encoding: "utf8",
      });
      const outputs = Object.fromEntries(
        readFileSync(out, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
      );
      return { code: r.status, stdout: r.stdout, outputs };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const push = { GITHUB_EVENT_NAME: "push", AMBIENTE: "producao" };
  const manual = (extra: Record<string, string>) => ({
    GITHUB_EVENT_NAME: "workflow_dispatch",
    AMBIENTE: "producao",
    PUBLICAR_INPUT: "false",
    IMPLANTAR_INPUT: "false",
    ...extra,
  });

  it("push na master: publica e implanta mesmo com GHCR_PUBLISH ausente ou false", () => {
    for (const GHCR_PUBLISH of ["", "false", "true"]) {
      const r = decide({ ...push, GHCR_PUBLISH });
      expect(r.code).toBe(0);
      expect(r.outputs).toMatchObject({
        image: "ghcr.io/donodorepo/antero-cartas",
        tag: `producao-${SHA}`,
        publish: "true",
        deploy: "true",
      });
    }
  });

  it("manual sem marcar publicar: só constrói", () => {
    expect(decide(manual({ GHCR_PUBLISH: "true" })).outputs).toMatchObject({ publish: "false", deploy: "false" });
  });

  it("manual marcando publicar mas sem GHCR_PUBLISH=true: não publica", () => {
    for (const GHCR_PUBLISH of ["", "false", "TRUE"]) {
      expect(decide(manual({ PUBLICAR_INPUT: "true", GHCR_PUBLISH })).outputs).toMatchObject({ publish: "false", deploy: "false" });
    }
  });

  it("manual com publicar + GHCR_PUBLISH=true: publica, sem implantar", () => {
    expect(decide(manual({ PUBLICAR_INPUT: "true", GHCR_PUBLISH: "true" })).outputs).toMatchObject({ publish: "true", deploy: "false" });
  });

  it("manual com publicar + implantar em producao na master: implanta", () => {
    const r = decide(manual({ PUBLICAR_INPUT: "true", IMPLANTAR_INPUT: "true", GHCR_PUBLISH: "true" }));
    expect(r.outputs).toMatchObject({ publish: "true", deploy: "true" });
  });

  it.each([
    ["implantar sem publicar", { PUBLICAR_INPUT: "false", IMPLANTAR_INPUT: "true", GHCR_PUBLISH: "true" }, /exige publicar/],
    ["implantar com GHCR_PUBLISH desligado", { PUBLICAR_INPUT: "true", IMPLANTAR_INPUT: "true", GHCR_PUBLISH: "false" }, /exige publicar/],
    ["implantar de outra branch", { PUBLICAR_INPUT: "true", IMPLANTAR_INPUT: "true", GHCR_PUBLISH: "true", GITHUB_REF: "refs/heads/fix/x" }, /só a partir da master/],
    ["implantar homologação", { AMBIENTE: "homologacao", PUBLICAR_INPUT: "true", IMPLANTAR_INPUT: "true", GHCR_PUBLISH: "true" }, /Só é possível implantar o ambiente producao/],
  ])("recusa (falha o job): %s", (_name, extra, message) => {
    const r = decide(manual(extra));
    expect(r.code).not.toBe(0);
    expect(r.stdout).toMatch(message);
    expect(r.outputs.deploy).toBeUndefined();
  });

  it("homologação manual publicada nunca implanta e usa a tag homologacao-<sha>", () => {
    const r = decide(manual({ AMBIENTE: "homologacao", PUBLICAR_INPUT: "true", GHCR_PUBLISH: "true" }));
    expect(r.outputs).toMatchObject({ tag: `homologacao-${SHA}`, publish: "true", deploy: "false" });
  });
});

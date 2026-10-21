import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Guarda estrutural do modo de manutenção (src/server/maintenance.ts).
 *
 * O teste de comportamento (maintenance.routes.test.ts) cobre as rotas que
 * existem hoje. Este cobre as que vierem depois: varre src/app, e
 *  - toda rota com POST/PUT/PATCH/DELETE precisa chamar
 *    `assertNotInMaintenance()` ou `maintenanceResponse()` em cada handler;
 *  - todo GET precisa estar na lista de leituras revisadas abaixo — um GET
 *    novo obriga alguém a confirmar que ele não escreve nada;
 *  - Server Actions ("use server") não podem existir sem a mesma revisão.
 */

const APP_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.resolve(APP_DIR, "..");

/** GETs revisados: só leem (banco, storage ou API externa sem efeito em dados). */
const REVIEWED_READ_ONLY_GET = new Set([
  "api/carts/[id]/route.ts", // rascunho para edição (leitura com token)
  "api/orders/[id]/route.ts", // status do pedido — documentado sem efeitos colaterais
  "api/media/[...path]/route.ts", // serve foto do storage local
  "api/youtube/search/route.ts", // busca externa; não grava nada
  "api/dev/emails/route.ts", // visualizador de e-mails mock (bloqueado em produção)
  "api/health/route.ts", // SELECT 1 + acesso ao diretório de fotos
]);

const MUTATING = ["POST", "PUT", "PATCH", "DELETE"] as const;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Corpo de cada `export async function METHOD(` até o próximo export (ou fim). */
function handlerBodies(source: string): Map<string, string> {
  const re = /export\s+(?:async\s+)?function\s+(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)\s*\(/g;
  const matches = [...source.matchAll(re)];
  const out = new Map<string, string>();
  matches.forEach((m, i) => {
    const start = m.index ?? 0;
    const end = matches[i + 1]?.index ?? source.length;
    out.set(m[1], source.slice(start, end));
  });
  return out;
}

const routeFiles = walk(APP_DIR)
  .filter((f) => path.basename(f) === "route.ts")
  .map((f) => path.relative(APP_DIR, f).split(path.sep).join("/"));

describe("modo de manutenção — cobertura das rotas", () => {
  it("encontra as rotas de API", () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  it.each(routeFiles)("%s", (rel) => {
    const source = readFileSync(path.join(APP_DIR, rel), "utf8");
    const bodies = handlerBodies(source);

    for (const method of MUTATING) {
      const body = bodies.get(method);
      if (!body) continue;
      expect(
        /assertNotInMaintenance\(\)|maintenanceResponse\(\)/.test(body),
        `${method} em ${rel} precisa checar o modo de manutenção`,
      ).toBe(true);
    }

    if (bodies.has("GET")) {
      expect(
        REVIEWED_READ_ONLY_GET.has(rel),
        `GET em ${rel} não foi revisado como somente leitura — revise e inclua na lista`,
      ).toBe(true);
    }
  });

  it("não existem Server Actions sem revisão de manutenção", () => {
    const offenders = walk(SRC_DIR)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${path.sep}generated${path.sep}`))
      .filter((f) => /^\s*["']use server["']/m.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

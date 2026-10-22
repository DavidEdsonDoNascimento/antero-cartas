import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A imagem Docker aplica migrations com um projeto mínimo à parte
 * (docker/migrate) para não carregar o node_modules inteiro do app. Este teste
 * garante que ele usa EXATAMENTE as mesmas versões do Prisma CLI, do pg e do
 * dotenv resolvidas no pnpm-lock.yaml da raiz — o mesmo motor de migration que
 * a Vercel usa hoje.
 */
const ROOT = path.resolve(__dirname, "../..");

function rootLockVersion(name: string): string {
  const lock = readFileSync(path.join(ROOT, "pnpm-lock.yaml"), "utf8");
  const importer = lock.slice(lock.indexOf("\n  .:\n"), lock.indexOf("\npackages:\n"));
  const m = importer.match(new RegExp(`\\n      ${name.replace("/", "\\/")}:\\n        specifier: [^\\n]+\\n        version: ([^\\s(]+)`));
  if (!m) throw new Error(`${name} não encontrado no importer da raiz`);
  return m[1];
}

describe("docker/migrate — versões alinhadas ao app", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "docker/migrate/package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    packageManager: string;
  };
  const rootPkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { packageManager: string };

  it.each(["prisma", "pg", "dotenv"])("%s igual ao pnpm-lock.yaml da raiz", (name) => {
    expect(pkg.dependencies[name]).toBe(rootLockVersion(name));
  });

  it("mesmo pnpm da raiz", () => {
    expect(pkg.packageManager).toBe(rootPkg.packageManager);
  });

  it("lockfile próprio presente e com as mesmas versões", () => {
    const lock = readFileSync(path.join(ROOT, "docker/migrate/pnpm-lock.yaml"), "utf8");
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      expect(lock).toContain(`\n  ${name}@${version}`);
    }
  });
});

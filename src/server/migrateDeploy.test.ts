import { describe, it, expect } from "vitest";
import { isSupabaseHost, resolveMigrationTarget } from "../../scripts/migrateDeploy.mjs";

/**
 * Regras puras do script de migration da hospedagem em contêiner
 * (scripts/migrateDeploy.mjs). A execução real contra PostgreSQL 17
 * descartável é coberta pelo roteiro de docs/0011 (seção de testes).
 */
describe("isSupabaseHost", () => {
  it.each([
    "db.abcdefghijklmnopqrst.supabase.co",
    "aws-0-sa-east-1.pooler.supabase.com",
    "AWS-1-US-EAST-1.POOLER.SUPABASE.COM",
  ])("reconhece %s", (h) => expect(isSupabaseHost(h)).toBe(true));

  it.each(["antero-cartas-db", "127.0.0.1", "postgres", "notsupabase.co.example.com", "supabase.co.evil.com"])(
    "não confunde %s",
    (h) => expect(isSupabaseHost(h)).toBe(false),
  );
});

describe("resolveMigrationTarget", () => {
  it("prefere DIRECT_URL e aceita PostgreSQL da rede interna", () => {
    const r = resolveMigrationTarget({
      DIRECT_URL: "postgresql://u:p@antero-cartas-db:5432/antero",
      DATABASE_URL: "postgresql://u:p@outro:5432/x",
    });
    expect(r).toMatchObject({ ok: true, host: "antero-cartas-db" });
  });

  it("cai para DATABASE_URL quando DIRECT_URL está vazia", () => {
    const r = resolveMigrationTarget({ DIRECT_URL: " ", DATABASE_URL: "postgres://u:p@db:5432/x" });
    expect(r).toMatchObject({ ok: true, host: "db" });
  });

  it("recusa sem URL", () => {
    expect(resolveMigrationTarget({})).toMatchObject({ ok: false });
  });

  it("recusa URL malformada ou de outro protocolo — sem ecoar o valor", () => {
    const bad = resolveMigrationTarget({ DATABASE_URL: "nao-e-url-segredo123" });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain("segredo123");
    expect(resolveMigrationTarget({ DATABASE_URL: "mysql://u:p@h/x" }).ok).toBe(false);
  });

  it("recusa o Supabase por padrão (produção atual não migra por aqui)", () => {
    const r = resolveMigrationTarget({
      DATABASE_URL: "postgresql://postgres.ref:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("senha");
  });

  it("só aceita o Supabase com liberação explícita", () => {
    const r = resolveMigrationTarget({
      DATABASE_URL: "postgresql://postgres.ref:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
      ALLOW_MIGRATE_ON_SUPABASE: "true",
    });
    expect(r.ok).toBe(true);
  });
});

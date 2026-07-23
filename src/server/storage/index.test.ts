import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getStorage, resetStorage } from "./index";

const ENV_KEYS = [
  "STORAGE_PROVIDER",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  resetStorage();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetStorage();
});

describe("getStorage", () => {
  it("usa disco local por padrão", () => {
    delete process.env.STORAGE_PROVIDER;
    expect(getStorage().getPublicUrl("carts/c1/a.jpg")).toBe("/api/media/carts/c1/a.jpg");
  });

  it("seleciona o Supabase Storage por STORAGE_PROVIDER", () => {
    process.env.STORAGE_PROVIDER = "supabase";
    process.env.SUPABASE_URL = "https://proj.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave";
    process.env.SUPABASE_STORAGE_BUCKET = "cart-media";

    expect(getStorage().getPublicUrl("carts/c1/a.jpg")).toBe(
      "https://proj.supabase.co/storage/v1/object/public/cart-media/carts/c1/a.jpg",
    );
  });

  it("falha cedo e com mensagem clara se a config do Supabase estiver incompleta", () => {
    process.env.STORAGE_PROVIDER = "supabase";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => getStorage()).toThrow(/SUPABASE_URL/);
  });

  it("rejeita provider desconhecido em vez de cair no local silenciosamente", () => {
    process.env.STORAGE_PROVIDER = "s3";
    expect(() => getStorage()).toThrow(/desconhecido/);
  });

  it("memoiza o provider entre chamadas", () => {
    delete process.env.STORAGE_PROVIDER;
    expect(getStorage()).toBe(getStorage());
  });
});

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { getMediaUrlStrategy, resolveMediaUrl } from "./mediaUrl";
import { resetStorage } from "./index";

const SUPABASE_URL_STORED =
  "https://proj.supabase.co/storage/v1/object/public/cart-media/carts/cmabc/0b1c2d3e-aaaa-bbbb-cccc-111122223333.jpg";
const KEY = "carts/cmabc/0b1c2d3e-aaaa-bbbb-cccc-111122223333.jpg";

beforeEach(() => resetStorage());
afterEach(() => {
  vi.unstubAllEnvs();
  resetStorage();
});

describe("getMediaUrlStrategy", () => {
  it("padrão é 'stored' (comportamento atual da produção)", () => {
    vi.stubEnv("MEDIA_URL_STRATEGY", undefined);
    expect(getMediaUrlStrategy()).toBe("stored");
  });
  it("só muda com 'storage_key' explícito", () => {
    vi.stubEnv("MEDIA_URL_STRATEGY", "qualquer");
    expect(getMediaUrlStrategy()).toBe("stored");
    vi.stubEnv("MEDIA_URL_STRATEGY", " STORAGE_KEY ");
    expect(getMediaUrlStrategy()).toBe("storage_key");
  });
});

describe("resolveMediaUrl", () => {
  it("stored: devolve CartMedia.url sem tocar no storage", () => {
    vi.stubEnv("MEDIA_URL_STRATEGY", "stored");
    vi.stubEnv("STORAGE_PROVIDER", "provider-inexistente"); // provaria que getStorage nem é chamado
    expect(resolveMediaUrl({ url: SUPABASE_URL_STORED, storageKey: KEY })).toBe(SUPABASE_URL_STORED);
  });

  it("storage_key + disco local: foto migrada do Supabase abre em /api/media", () => {
    vi.stubEnv("MEDIA_URL_STRATEGY", "storage_key");
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("STORAGE_PUBLIC_URL", "/api/media");
    expect(resolveMediaUrl({ url: SUPABASE_URL_STORED, storageKey: KEY })).toBe(`/api/media/${KEY}`);
  });

  it("storage_key + Supabase: reproduz a mesma URL gravada (compatível com a produção atual)", () => {
    vi.stubEnv("MEDIA_URL_STRATEGY", "storage_key");
    vi.stubEnv("STORAGE_PROVIDER", "supabase");
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-teste");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "cart-media");
    expect(resolveMediaUrl({ url: SUPABASE_URL_STORED, storageKey: KEY })).toBe(SUPABASE_URL_STORED);
  });

  it("chave legada/fora do padrão cai para a URL gravada (não derruba a cartinha)", () => {
    vi.stubEnv("MEDIA_URL_STRATEGY", "storage_key");
    vi.stubEnv("STORAGE_PROVIDER", "local");
    const legacy = { url: "/api/media/carts/old/x.jpg", storageKey: "../etc/passwd" };
    expect(resolveMediaUrl(legacy)).toBe(legacy.url);
  });

  it("falha do provider cai para a URL gravada", () => {
    vi.stubEnv("MEDIA_URL_STRATEGY", "storage_key");
    vi.stubEnv("STORAGE_PROVIDER", "supabase");
    vi.stubEnv("SUPABASE_URL", ""); // provider não inicializa
    expect(resolveMediaUrl({ url: SUPABASE_URL_STORED, storageKey: KEY })).toBe(SUPABASE_URL_STORED);
  });
});

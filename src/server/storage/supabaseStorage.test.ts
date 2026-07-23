import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseStorage } from "./supabaseStorage";
import { ApiError } from "@/server/errors";

const BASE = {
  url: "https://proj.supabase.co",
  serviceKey: "service-role-secret",
  bucket: "cart-media",
};
const KEY = "carts/cart_abc123/11111111-2222-3333-4444-555555555555.jpg";

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Fetch falso que grava as chamadas e devolve respostas na ordem informada. */
function stubFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return responses[Math.min(i++, responses.length - 1)];
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function storage(fetchImpl: typeof fetch) {
  return createSupabaseStorage({ ...BASE, fetchImpl });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSupabaseStorage — configuração", () => {
  it("exige SUPABASE_URL", () => {
    expect(() => createSupabaseStorage({ ...BASE, url: "" })).toThrow(/SUPABASE_URL/);
  });

  it("exige URL absoluta", () => {
    expect(() => createSupabaseStorage({ ...BASE, url: "proj.supabase.co" })).toThrow(
      /http/,
    );
  });

  it("exige a service role key", () => {
    expect(() => createSupabaseStorage({ ...BASE, serviceKey: "  " })).toThrow(
      /SERVICE_ROLE_KEY/,
    );
  });

  it("rejeita nome de bucket com barra (evita montar caminho arbitrário)", () => {
    expect(() => createSupabaseStorage({ ...BASE, bucket: "a/../b" })).toThrow(
      /BUCKET/,
    );
  });

  it("ignora barra final na URL do projeto", () => {
    const s = createSupabaseStorage({ ...BASE, url: "https://proj.supabase.co/" });
    expect(s.getPublicUrl(KEY)).toBe(
      `https://proj.supabase.co/storage/v1/object/public/cart-media/${KEY}`,
    );
  });
});

describe("getPublicUrl", () => {
  it("aponta para o caminho público do bucket", () => {
    const s = storage(stubFetch().impl);
    expect(s.getPublicUrl(KEY)).toBe(
      `https://proj.supabase.co/storage/v1/object/public/cart-media/${KEY}`,
    );
  });

  it("recusa chave fora do formato esperado", () => {
    const s = storage(stubFetch().impl);
    expect(() => s.getPublicUrl("../../etc/passwd")).toThrow(/Chave de storage/);
  });
});

describe("put", () => {
  it("envia o objeto com content-type, cache longo e credencial de servidor", async () => {
    const { impl, calls } = stubFetch(jsonResponse(200, { Key: `cart-media/${KEY}` }));
    const result = await storage(impl).put({
      key: KEY,
      body: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      contentType: "image/jpeg",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://proj.supabase.co/storage/v1/object/cart-media/${KEY}`,
    );
    expect(calls[0].init.method).toBe("POST");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("image/jpeg");
    expect(headers["cache-control"]).toContain("immutable");
    expect(headers.authorization).toBe("Bearer service-role-secret");

    expect(result).toEqual({
      key: KEY,
      url: `https://proj.supabase.co/storage/v1/object/public/cart-media/${KEY}`,
    });
  });

  it("rejeita chave inválida antes de qualquer requisição", async () => {
    const { impl, calls } = stubFetch(jsonResponse(200));
    await expect(
      storage(impl).put({
        key: "carts/cart_1/evil.svg",
        body: Buffer.from("x"),
        contentType: "image/svg+xml",
      }),
    ).rejects.toThrow(/Chave de storage/);
    expect(calls).toHaveLength(0);
  });

  it("converte falha do Storage em erro de servidor sem vazar detalhe", async () => {
    const { impl } = stubFetch(jsonResponse(400, { message: "Bucket not found" }));
    const err = await storage(impl)
      .put({ key: KEY, body: Buffer.from("x"), contentType: "image/jpeg" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).not.toContain("Bucket not found");
  });
});

describe("delete", () => {
  it("remove o objeto pela API autenticada", async () => {
    const { impl, calls } = stubFetch(jsonResponse(200, { message: "Successfully deleted" }));
    await storage(impl).delete(KEY);

    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toBe(
      `https://proj.supabase.co/storage/v1/object/cart-media/${KEY}`,
    );
  });

  it("é idempotente: objeto ausente (404) não é erro", async () => {
    const { impl } = stubFetch(jsonResponse(404, { message: "Object not found" }));
    await expect(storage(impl).delete(KEY)).resolves.toBeUndefined();
  });

  it("propaga falha real como erro de servidor", async () => {
    const { impl } = stubFetch(jsonResponse(500, { message: "boom" }));
    await expect(storage(impl).delete(KEY)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("read", () => {
  it("devolve corpo e content-type do objeto", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { impl } = stubFetch(
      new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    const file = await storage(impl).read(KEY);

    expect(file?.contentType).toBe("image/jpeg");
    expect(Array.from(file!.body)).toEqual([1, 2, 3]);
  });

  it("devolve null quando o objeto não existe", async () => {
    const { impl } = stubFetch(jsonResponse(404, { message: "Object not found" }));
    await expect(storage(impl).read(KEY)).resolves.toBeNull();
  });
});

describe("segredos", () => {
  it("a service role key nunca aparece na URL pública", () => {
    const s = storage(stubFetch().impl);
    expect(s.getPublicUrl(KEY)).not.toContain(BASE.serviceKey);
  });
});

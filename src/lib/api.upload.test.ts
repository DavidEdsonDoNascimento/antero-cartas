/**
 * Envio da foto: o prazo cobre a resposta inteira, não só os cabeçalhos, e o
 * `uploadId` vai junto para o servidor poder deduplicar o reenvio.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadPhoto, RequestTimeoutError } from "@/lib/api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("uploadPhoto", () => {
  it("corpo da resposta que para no meio → RequestTimeoutError (não fica pendurado)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => ({
        ok: true,
        status: 201,
        // Só termina se o AbortController do prazo disparar.
        json: () =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      })),
    );
    const result = uploadPhoto("cart-1", "tok", new Blob(["x"], { type: "image/jpeg" }));
    const assertion = expect(result).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
  });

  it("envia uploadId e dimensões no multipart", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ cart: {} }) }));
    vi.stubGlobal("fetch", fetchMock);
    await uploadPhoto("cart-1", "tok", new Blob(["x"], { type: "image/jpeg" }), { width: 800, height: 600 }, "id-1");
    const body = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(body.get("uploadId")).toBe("id-1");
    expect(body.get("width")).toBe("800");
  });
});

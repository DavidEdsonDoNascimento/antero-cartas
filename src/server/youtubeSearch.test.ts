import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { searchMusic, SearchError, clearSearchCache } from "@/server/youtubeSearch";

/** Response falsa mínima para injetar no fetch. */
function fakeRes(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "no_throw";
  } catch (e) {
    return e instanceof SearchError ? e.code : "not_search_error";
  }
}

const ENV_KEYS = [
  "YOUTUBE_SEARCH_MODE",
  "YOUTUBE_SEARCH_ENABLED",
  "YOUTUBE_API_KEY",
  "YOUTUBE_SEARCH_MAX_RESULTS",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  clearSearchCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("modo mock", () => {
  it("retorna resultados de demonstração sem chave", async () => {
    process.env.YOUTUBE_SEARCH_MODE = "mock";
    const out = await searchMusic("perfect");
    expect(out.mode).toBe("mock");
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results[0].videoId).toMatch(/^[a-zA-Z0-9_-]{11}$/);
  });
});

describe("modo disabled", () => {
  it("lança search_disabled", async () => {
    process.env.YOUTUBE_SEARCH_MODE = "disabled";
    expect(await codeOf(searchMusic("qualquer"))).toBe("search_disabled");
  });
  it("YOUTUBE_SEARCH_ENABLED=false força disabled", async () => {
    process.env.YOUTUBE_SEARCH_MODE = "real";
    process.env.YOUTUBE_SEARCH_ENABLED = "false";
    expect(await codeOf(searchMusic("qualquer"))).toBe("search_disabled");
  });
});

describe("modo real", () => {
  it("sem chave lança missing_key", async () => {
    process.env.YOUTUBE_SEARCH_MODE = "real";
    expect(await codeOf(searchMusic("perfect"))).toBe("missing_key");
  });

  it("transforma a resposta e faz cache (fetch chamado uma vez)", async () => {
    process.env.YOUTUBE_SEARCH_MODE = "real";
    process.env.YOUTUBE_API_KEY = "test-key";
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return fakeRes(200, {
        items: [
          {
            id: { videoId: "2Vv-BfVoq4g" },
            snippet: { title: "Perfect", channelTitle: "Ed Sheeran", thumbnails: {} },
          },
        ],
      });
    }) as unknown as typeof fetch;

    const a = await searchMusic("perfect ed sheeran", { fetchImpl });
    const b = await searchMusic("perfect ed sheeran", { fetchImpl });
    expect(a.results).toHaveLength(1);
    expect(a.results[0].videoId).toBe("2Vv-BfVoq4g");
    expect(b.results).toHaveLength(1);
    expect(calls).toBe(1); // segunda veio do cache
  });

  it("resposta vazia retorna lista vazia", async () => {
    process.env.YOUTUBE_SEARCH_MODE = "real";
    process.env.YOUTUBE_API_KEY = "test-key";
    const fetchImpl = (async () => fakeRes(200, { items: [] })) as unknown as typeof fetch;
    const out = await searchMusic("termo raro", { fetchImpl });
    expect(out.results).toEqual([]);
  });

  it("403 com quotaExceeded lança quota_exceeded", async () => {
    process.env.YOUTUBE_SEARCH_MODE = "real";
    process.env.YOUTUBE_API_KEY = "test-key";
    const fetchImpl = (async () =>
      fakeRes(403, { error: { errors: [{ reason: "quotaExceeded" }] } })) as unknown as typeof fetch;
    expect(await codeOf(searchMusic("perfect", { fetchImpl }))).toBe("quota_exceeded");
  });

  it("AbortError do fetch vira timeout", async () => {
    process.env.YOUTUBE_SEARCH_MODE = "real";
    process.env.YOUTUBE_API_KEY = "test-key";
    const fetchImpl = (async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }) as unknown as typeof fetch;
    expect(await codeOf(searchMusic("perfect", { fetchImpl }))).toBe("timeout");
  });

  it("erro de rede genérico vira upstream_error", async () => {
    process.env.YOUTUBE_SEARCH_MODE = "real";
    process.env.YOUTUBE_API_KEY = "test-key";
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await codeOf(searchMusic("perfect", { fetchImpl }))).toBe("upstream_error");
  });
});

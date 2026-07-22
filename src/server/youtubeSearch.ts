/**
 * Serviço de busca de música — SOMENTE servidor.
 * Lê a chave e o modo de variáveis de ambiente sem prefixo NEXT_PUBLIC_,
 * portanto nunca vai para o bundle do cliente.
 *
 * Modos: "mock" | "real" | "disabled".
 * Cache em memória por termo normalizado (best-effort, por instância).
 */

import { transformYouTubeItems, type MusicSearchResult } from "@/lib/music";
import { filterMockMusic } from "@/content/mockMusic";

export type SearchMode = "mock" | "real" | "disabled";

export type SearchErrorCode =
  | "search_disabled"
  | "missing_key"
  | "quota_exceeded"
  | "upstream_error"
  | "timeout";

export class SearchError extends Error {
  constructor(
    public code: SearchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SearchError";
  }
}

interface ServerConfig {
  mode: SearchMode;
  maxResults: number;
  cacheTtlMs: number;
  timeoutMs: number;
  apiKey: string | null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function serverConfig(): ServerConfig {
  const enabled = (process.env.YOUTUBE_SEARCH_ENABLED ?? "true") !== "false";
  let mode = (process.env.YOUTUBE_SEARCH_MODE ?? "mock") as SearchMode;
  if (!enabled) mode = "disabled";
  if (mode !== "mock" && mode !== "real" && mode !== "disabled") mode = "mock";
  return {
    mode,
    maxResults: clamp(Number(process.env.YOUTUBE_SEARCH_MAX_RESULTS) || 6, 1, 8),
    cacheTtlMs: (Number(process.env.YOUTUBE_SEARCH_CACHE_TTL_SECONDS) || 3600) * 1000,
    timeoutMs: 8000,
    apiKey: process.env.YOUTUBE_API_KEY?.trim() || null,
  };
}

// --- Cache em memória (por instância) ---------------------------------------
interface CacheEntry {
  at: number;
  results: MusicSearchResult[];
}
const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 200;

function cacheKey(term: string, max: number): string {
  return `${max}:${term.toLowerCase()}`;
}
function getCached(key: string, ttlMs: number): MusicSearchResult[] | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > ttlMs) {
    cache.delete(key);
    return null;
  }
  return e.results;
}
function setCached(key: string, results: MusicSearchResult[]): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), results });
}
/** Utilitário de teste: limpa o cache em memória. */
export function clearSearchCache(): void {
  cache.clear();
}

export interface SearchOptions {
  signal?: AbortSignal;
  /** Injeção de fetch para testes. */
  fetchImpl?: typeof fetch;
}

export interface SearchOutcome {
  mode: SearchMode;
  results: MusicSearchResult[];
}

/**
 * Executa a busca conforme o modo configurado.
 * O termo já deve vir validado/normalizado pela rota.
 */
export async function searchMusic(
  term: string,
  opts: SearchOptions = {},
): Promise<SearchOutcome> {
  const cfg = serverConfig();

  if (cfg.mode === "disabled") {
    throw new SearchError("search_disabled", "A busca de música está desativada.");
  }

  if (cfg.mode === "mock") {
    return { mode: "mock", results: filterMockMusic(term, cfg.maxResults) };
  }

  // mode === "real"
  if (!cfg.apiKey) {
    throw new SearchError(
      "missing_key",
      "YOUTUBE_API_KEY ausente. Configure a chave ou use o modo mock.",
    );
  }

  const key = cacheKey(term, cfg.maxResults);
  const cached = getCached(key, cfg.cacheTtlMs);
  if (cached) return { mode: "real", results: cached };

  const results = await fetchFromYouTube(term, cfg, opts);
  setCached(key, results);
  return { mode: "real", results };
}

async function fetchFromYouTube(
  term: string,
  cfg: ServerConfig,
  opts: SearchOptions,
): Promise<MusicSearchResult[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", term);
  url.searchParams.set("maxResults", String(cfg.maxResults));
  url.searchParams.set("regionCode", "BR");
  url.searchParams.set("relevanceLanguage", "pt");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("videoSyndicated", "true");
  url.searchParams.set("key", cfg.apiKey!);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), { signal: controller.signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new SearchError("timeout", "Tempo de busca esgotado.");
    }
    throw new SearchError("upstream_error", "Não foi possível consultar o YouTube.");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 403) {
    const reason = await readErrorReason(res);
    if (reason.includes("quota")) {
      throw new SearchError("quota_exceeded", "Cota da API do YouTube excedida.");
    }
    throw new SearchError("upstream_error", "Acesso negado pela API do YouTube.");
  }
  if (!res.ok) {
    throw new SearchError("upstream_error", "Resposta inválida do YouTube.");
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new SearchError("upstream_error", "Resposta inválida do YouTube.");
  }
  const items = (data as { items?: unknown }).items;
  return transformYouTubeItems(items).slice(0, cfg.maxResults);
}

/** Lê o motivo do erro 403 sem registrar dados sensíveis. */
async function readErrorReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { errors?: Array<{ reason?: string }>; message?: string };
    };
    return (
      body.error?.errors?.map((e) => e.reason ?? "").join(" ").toLowerCase() ??
      body.error?.message?.toLowerCase() ??
      ""
    );
  } catch {
    return "";
  }
}

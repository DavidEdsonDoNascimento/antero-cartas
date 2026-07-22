import { validateSearchTerm } from "@/lib/music";
import { createInMemoryRateLimiter } from "@/lib/rateLimit";
import { searchMusic, SearchError, type SearchErrorCode } from "@/server/youtubeSearch";

export const dynamic = "force-dynamic";

/** Limitador leve por instância (best-effort — ver lib/rateLimit.ts). */
const limiter = createInMemoryRateLimiter(30, 60_000);

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

function errorStatus(code: SearchErrorCode): number {
  switch (code) {
    case "missing_key":
      return 500;
    case "quota_exceeded":
      return 429;
    case "timeout":
      return 504;
    default:
      return 502;
  }
}

const PUBLIC_MESSAGES: Record<SearchErrorCode, string> = {
  search_disabled: "A busca de música está desativada.",
  missing_key: "Busca real indisponível: configure a chave da API (ou use o modo mock).",
  quota_exceeded: "Limite de buscas atingido no momento. Tente novamente mais tarde.",
  timeout: "A busca demorou demais. Tente novamente.",
  upstream_error: "Não foi possível buscar agora. Tente novamente ou cole o link do YouTube.",
};

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "local";
}

export async function GET(req: Request): Promise<Response> {
  const gate = limiter.check(clientKey(req));
  if (!gate.allowed) {
    return json(
      { error: { code: "rate_limited", message: "Muitas buscas. Aguarde um instante." } },
      429,
      { "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)) },
    );
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const v = validateSearchTerm(q);
  if (!v.ok) {
    return json(
      { error: { code: "invalid_query", message: "Digite ao menos 3 caracteres." } },
      400,
    );
  }

  try {
    const outcome = await searchMusic(v.term);
    return json({ mode: outcome.mode, results: outcome.results });
  } catch (err) {
    if (err instanceof SearchError) {
      // "disabled" não é falha: responde 200 para o cliente cair no colar link.
      if (err.code === "search_disabled") {
        return json({ mode: "disabled", results: [] });
      }
      return json(
        { error: { code: err.code, message: PUBLIC_MESSAGES[err.code] } },
        errorStatus(err.code),
      );
    }
    // Nunca vaza detalhes internos nem a chave.
    return json(
      { error: { code: "internal_error", message: "Erro interno. Tente novamente." } },
      500,
    );
  }
}

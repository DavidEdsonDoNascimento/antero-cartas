/**
 * Erros de API com código estável e status HTTP. As rotas convertem em
 * respostas JSON consistentes, sem vazar detalhes internos.
 */
export type ApiErrorCode =
  | "invalid"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "forbidden_state"
  | "limit_reached"
  | "mock_disabled"
  | "rate_limited"
  | "server";

const STATUS: Record<ApiErrorCode, number> = {
  invalid: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  forbidden_state: 409,
  limit_reached: 409,
  mock_disabled: 403,
  rate_limited: 429,
  server: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
  }
}

export function jsonError(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status },
    );
  }
  // Nunca expõe stack/detalhes internos.
  return Response.json(
    { error: { code: "server", message: "Erro interno. Tente novamente." } },
    { status: 500 },
  );
}

export function jsonOk(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

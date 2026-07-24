/**
 * Cliente HTTP tipado para o backend (Fase 2). Roda no navegador.
 * Não importa nada de `@/server/*` (evita puxar Prisma/Node para o bundle
 * do cliente) — os tipos de resposta são espelhados aqui estruturalmente.
 */

import type { Cart } from "@/lib/types";

const EDIT_TOKEN_HEADER = "x-cart-edit-token";

export class ApiClientError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

/** Requisição abortada por `timeoutMs` — distinta de uma falha de rede comum. */
export class RequestTimeoutError extends Error {
  constructor() {
    super("Tempo esgotado ao consultar o servidor.");
    this.name = "RequestTimeoutError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string | null; timeoutMs?: number } = {},
): Promise<T> {
  const { token, headers, timeoutMs, ...rest } = init;
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      signal: controller?.signal,
      headers: {
        ...(headers ?? {}),
        ...(token ? { [EDIT_TOKEN_HEADER]: token } : {}),
      },
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw new RequestTimeoutError();
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error?.code ?? "unknown";
    const message = data?.error?.message ?? "Erro inesperado. Tente novamente.";
    throw new ApiClientError(code, message, res.status);
  }
  if (data === null) {
    throw new ApiClientError("invalid_response", "Resposta inválida do servidor.", res.status);
  }
  return data as T;
}

// --- Rascunho ----------------------------------------------------------------

export type CartPatch = Partial<{
  recipientType: Cart["recipientType"];
  recipientName: string;
  occasion: string | null;
  title: string;
  message: string;
  senderName: string;
  signature: string;
  theme: Cart["theme"];
  music: Cart["music"];
  relationshipStartDate: string | null;
  showRelationshipCounter: boolean;
  planType: Cart["planType"];
}>;

export function createDraft(initial?: CartPatch): Promise<{ cart: Cart; editToken: string }> {
  return request("/api/carts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(initial ?? {}),
  });
}

export function fetchCart(cartId: string, token: string): Promise<{ cart: Cart }> {
  return request(`/api/carts/${cartId}`, { token });
}

export function patchCart(
  cartId: string,
  token: string,
  patch: CartPatch,
): Promise<{ cart: Cart }> {
  return request(`/api/carts/${cartId}`, {
    method: "PATCH",
    token,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

// --- Fotos ---------------------------------------------------------------------

export function uploadPhoto(
  cartId: string,
  token: string,
  blob: Blob,
  dims?: { width: number; height: number },
): Promise<{ cart: Cart }> {
  const form = new FormData();
  form.append("file", blob, "photo.jpg");
  if (dims) {
    form.append("width", String(dims.width));
    form.append("height", String(dims.height));
  }
  return request(`/api/carts/${cartId}/media`, { method: "POST", token, body: form });
}

export function removePhoto(
  cartId: string,
  token: string,
  mediaId: string,
): Promise<{ cart: Cart }> {
  return request(`/api/carts/${cartId}/media/${mediaId}`, { method: "DELETE", token });
}

export function reorderPhotos(
  cartId: string,
  token: string,
  order: string[],
): Promise<{ cart: Cart }> {
  return request(`/api/carts/${cartId}/media/reorder`, {
    method: "POST",
    token,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order }),
  });
}

// --- Pedido / pagamento mock ----------------------------------------------------

export interface OrderSummary {
  id: string;
  cartId: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "EXPIRED" | "CANCELLED";
  planType: "LIMITED" | "PERMANENT";
  amount: number;
  currency: string;
  paidAt: string | null;
  createdAt: string;
}

export interface OrderResult {
  order: OrderSummary;
  cart: Cart | null;
  publicUrl: string | null;
  qrCodeDataUrl: string | null;
}

export interface CreateOrderInput {
  cartId: string;
  planType: Cart["planType"];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  acceptTerms: true;
}

export function createOrder(
  token: string,
  input: CreateOrderInput,
): Promise<{ order: OrderSummary }> {
  return request("/api/orders", {
    method: "POST",
    token,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Timeout curto: esta chamada é repetida via polling, não deve travar a UI. */
const ORDER_POLL_TIMEOUT_MS = 8000;

export function getOrderResult(orderId: string): Promise<OrderResult> {
  return request(`/api/orders/${orderId}`, { timeoutMs: ORDER_POLL_TIMEOUT_MS });
}

export function mockConfirm(
  orderId: string,
  action: "success" | "fail" | "expire" = "success",
): Promise<OrderResult> {
  return request(`/api/orders/${orderId}/mock-confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

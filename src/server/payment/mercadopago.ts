import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentStatus,
} from "./PaymentProvider";
import { mapMercadoPagoStatus } from "./mercadoPagoStatus";

/**
 * Provedor de pagamento real (Mercado Pago), atrás da mesma interface
 * `PaymentProvider` do mock (task 013). Sem SDK — chamadas REST via `fetch`,
 * mesma disciplina de dependências já usada para Supabase Storage (D40) e
 * busca do YouTube: a superfície usada (criar/consultar pagamento) é pequena
 * e estável, e o SDK oficial traria bem mais do que o necessário no servidor.
 *
 * Tokenização de cartão continua exigindo o SDK **do navegador** do Mercado
 * Pago (carregado via tag <script>, não como dependência do projeto) — não
 * há como o servidor tokenizar um cartão com segurança sem o SDK deles; ver
 * `src/components/checkout/CardPaymentPanel.tsx`.
 */
const API_BASE = "https://api.mercadopago.com";

export interface MercadoPagoOptions {
  accessToken?: string;
  siteUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ResolvedConfig {
  accessToken: string;
  siteUrl: string;
  fetchImpl: typeof fetch;
}

function resolveConfig(opts: MercadoPagoOptions): ResolvedConfig {
  const accessToken = (opts.accessToken ?? process.env.MERCADOPAGO_ACCESS_TOKEN)?.trim();
  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurada.");
  }
  const siteUrl = (opts.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL)?.trim();
  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL não configurada.");
  }
  return { accessToken, siteUrl, fetchImpl: opts.fetchImpl ?? fetch };
}

interface MpPaymentResponse {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  /** Ex.: "visa", "master", "pix" — identifica o meio, não o tipo. */
  payment_method_id?: string;
  /** Ex.: "credit_card", "debit_card", "bank_transfer" — desambigua cartão de Pix. */
  payment_type_id?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
  date_of_expiration?: string;
}

interface MpErrorResponse {
  message?: string;
  cause?: Array<{ code?: string; description?: string }>;
}

/**
 * O Mercado Pago respondeu recusando a própria requisição (4xx): requisição
 * malformada, token do cartão inválido/expirado, credencial recusada, limite
 * de taxa. **Nenhum pagamento foi criado** — a resposta é determinística.
 *
 * A distinção importa no caminho do dinheiro: uma falha ambígua (timeout,
 * conexão perdida, 5xx) pode ter criado a cobrança, e por isso obriga a
 * preservar a reserva e a chave de idempotência. Uma recusa 4xx não criou
 * nada, então segurar o pedido seria só prejudicar o comprador, que precisa
 * poder corrigir o cartão e tentar de novo na hora.
 */
export class MercadoPagoRequestRejectedError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "MercadoPagoRequestRejectedError";
    this.status = status;
  }
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  return { first: parts[0] ?? fullName, last: parts.slice(1).join(" ") || parts[0] || fullName };
}

function buildPayer(payer: CreatePaymentInput["payer"]): Record<string, unknown> | undefined {
  if (!payer) return undefined;
  const { first, last } = splitName(payer.name);
  return {
    email: payer.email,
    first_name: first,
    last_name: last,
    ...(payer.document ? { identification: { type: "CPF", number: payer.document } } : {}),
  };
}

async function callMercadoPago(
  cfg: ResolvedConfig,
  path: string,
  init: RequestInit,
): Promise<MpPaymentResponse> {
  const res = await cfg.fetchImpl(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as MpPaymentResponse & MpErrorResponse;
  if (!res.ok) {
    const reason = data.message ?? data.cause?.[0]?.description ?? `HTTP ${res.status}`;
    const message = `Mercado Pago recusou a requisição: ${reason}`;
    // 4xx: o provedor rejeitou a requisição e não criou pagamento nenhum.
    // 5xx e falha de rede (que nem chegam aqui, o `fetch` lança) continuam
    // ambíguos e viram Error comum — ver MercadoPagoRequestRejectedError.
    if (res.status >= 400 && res.status < 500) {
      throw new MercadoPagoRequestRejectedError(message, res.status);
    }
    throw new Error(message);
  }
  return data;
}

function toPaymentStatus(mpStatus: string, mpStatusDetail?: string | null): PaymentStatus {
  const internal = mapMercadoPagoStatus(mpStatus, mpStatusDetail);
  switch (internal) {
    case "PAID":
      return "paid";
    case "EXPIRED":
      return "expired";
    case "PENDING":
      return "pending";
    default:
      // FAILED, CANCELLED, REFUNDED, CHARGED_BACK: todos "resolvidos, sem
      // pagamento válido em vigor" do ponto de vista deste tipo simplificado.
      return "failed";
  }
}

export function createMercadoPagoProvider(options: MercadoPagoOptions = {}): PaymentProvider {
  return {
    name: "mercadopago",

    async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
      const cfg = resolveConfig(options);
      const payer = buildPayer(input.payer);
      const common = {
        transaction_amount: input.amount / 100,
        description: input.description ?? "Antero Cartas",
        external_reference: input.orderId,
        notification_url: `${cfg.siteUrl.replace(/\/$/, "")}/api/webhooks/mercadopago`,
        payer,
      };

      if (input.method === "PIX") {
        // Nunca gera a chave aqui: uma chave nova a cada chamada anularia a
        // proteção justamente no caso que ela existe para cobrir (reapresentar
        // uma operação cujo resultado não conhecemos). Ela é decidida e
        // persistida em `claimOrReusePixAttempt` antes desta chamada; ausência
        // é bug de chamador, não algo para contornar em silêncio.
        if (!input.idempotencyKey) {
          throw new Error("Criação de Pix exige idempotencyKey persistida pelo serviço.");
        }
        const data = await callMercadoPago(cfg, "/v1/payments", {
          method: "POST",
          headers: { "X-Idempotency-Key": input.idempotencyKey },
          body: JSON.stringify({ ...common, payment_method_id: "pix" }),
        });
        return {
          providerPaymentId: String(data.id),
          status: toPaymentStatus(data.status, data.status_detail),
          statusDetail: data.status_detail,
          pix: {
            qrCode: data.point_of_interaction?.transaction_data?.qr_code ?? "",
            qrCodeBase64: data.point_of_interaction?.transaction_data?.qr_code_base64 ?? "",
            expiresAt: data.date_of_expiration ?? null,
          },
        };
      }

      if (input.method === "CARD") {
        if (!input.card) throw new Error("Dados do cartão ausentes.");
        // Mesma regra do Pix: a chave é decidida e persistida pelo serviço
        // ANTES desta chamada. Gerar uma aqui dentro era o bug — uma chave
        // nova por chamada não protege nada. No cartão a chave é da
        // TENTATIVA (vinculada ao token), não do pedido: uma recusa é
        // desfecho legítimo e a próxima tentativa nasce com chave nova.
        if (!input.idempotencyKey) {
          throw new Error("Criação de pagamento com cartão exige idempotencyKey persistida pelo serviço.");
        }
        const data = await callMercadoPago(cfg, "/v1/payments", {
          method: "POST",
          headers: { "X-Idempotency-Key": input.idempotencyKey },
          body: JSON.stringify({
            ...common,
            token: input.card.token,
            installments: input.card.installments,
            payment_method_id: input.card.paymentMethodId,
            issuer_id: input.card.issuerId,
          }),
        });
        return {
          providerPaymentId: String(data.id),
          status: toPaymentStatus(data.status, data.status_detail),
          statusDetail: data.status_detail,
        };
      }

      throw new Error(`Método de pagamento não suportado pelo Mercado Pago: ${input.method}`);
    },

    async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus> {
      const cfg = resolveConfig(options);
      const data = await callMercadoPago(cfg, `/v1/payments/${providerPaymentId}`, {
        method: "GET",
      });
      return toPaymentStatus(data.status, data.status_detail);
    },
  };
}

/**
 * Retrato confiável de um pagamento — só o que veio de uma consulta direta
 * à API do Mercado Pago (nunca do corpo do webhook, que é usado somente
 * para descobrir QUAL pagamento consultar). `transactionAmount`/`currencyId`
 * permitem ao chamador validar valor e moeda contra o pedido antes de
 * aprovar qualquer coisa (task 013, seção 9); `paymentMethodId`/
 * `paymentTypeId` permitem distinguir Pix de cartão sem adivinhar pelo
 * `status`.
 */
export interface MercadoPagoPaymentSnapshot {
  /** Sempre igual ao id solicitado — `fetchMercadoPagoPayment` garante isso. */
  providerPaymentId: string;
  status: string;
  statusDetail: string | null;
  externalReference: string | null;
  /** Em reais (como a API devolve), não em centavos — cru, sem conversão. */
  transactionAmount: number | null;
  currencyId: string | null;
  paymentMethodId: string | null;
  paymentTypeId: string | null;
}

/**
 * Busca o pagamento completo no Mercado Pago a partir do `data.id` recebido
 * no webhook — a notificação em si só traz o id, nunca o estado (task 013,
 * seção 9: "consulta ao provedor quando necessária").
 *
 * Valida que o `id` devolvido pela API é exatamente o id solicitado: uma
 * resposta com outro id (bug do provedor, proxy mal configurado, resposta
 * cacheada errada) nunca deve ser tratada como se fosse o pagamento pedido —
 * lança em vez de devolver um retrato que não corresponde ao que foi
 * consultado.
 */
export async function fetchMercadoPagoPayment(
  providerPaymentId: string,
  options: MercadoPagoOptions = {},
): Promise<MercadoPagoPaymentSnapshot> {
  const cfg = resolveConfig(options);
  const data = await callMercadoPago(cfg, `/v1/payments/${providerPaymentId}`, { method: "GET" });

  const returnedId = String(data.id);
  if (returnedId !== providerPaymentId) {
    throw new Error(
      "Mercado Pago devolveu um pagamento com id diferente do solicitado " +
        `(pedido ${providerPaymentId}, devolvido ${returnedId}).`,
    );
  }

  return {
    providerPaymentId: returnedId,
    status: data.status,
    statusDetail: data.status_detail ?? null,
    externalReference: data.external_reference ?? null,
    transactionAmount: typeof data.transaction_amount === "number" ? data.transaction_amount : null,
    currencyId: data.currency_id ?? null,
    paymentMethodId: data.payment_method_id ?? null,
    paymentTypeId: data.payment_type_id ?? null,
  };
}

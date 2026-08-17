import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { ApiError } from "@/server/errors";
import { getPlan } from "@/config/plans";
import { site } from "@/config/site";
import { buildPublicCartUrl } from "@/lib/publicUrl";
import { publishCartWithClient } from "@/server/cartService";
import { dbToDomainCart, type DbCartRow } from "@/lib/cartMapping";
import {
  getPaymentProvider,
  isMockConfirmationAllowed,
  type InternalOrderStatus,
  type PaymentStatus,
  type PixPaymentData,
} from "@/server/payment";
import { mapMercadoPagoStatus, shouldApplyTransition } from "@/server/payment/mercadoPagoStatus";
import { MercadoPagoRequestRejectedError } from "@/server/payment/mercadopago";
import { getEmailProvider } from "@/server/email";
import { generateQrDataUrl } from "@/server/qrcode";
import { verifyEditToken } from "@/lib/editToken";
import type { CreateOrderInput } from "@/server/schemas";
import type { Cart } from "@/lib/types";

const cartInclude = { media: { orderBy: { position: "asc" as const } } };

export interface OrderSummary {
  id: string;
  cartId: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "EXPIRED" | "CANCELLED" | "CHARGED_BACK";
  planType: "LIMITED" | "PERMANENT";
  amount: number;
  currency: string;
  paidAt: string | null;
  createdAt: string;
}

function toSummary(o: {
  id: string;
  cartId: string;
  status: string;
  planType: string;
  amount: number;
  currency: string;
  paidAt: Date | null;
  createdAt: Date;
}): OrderSummary {
  return {
    id: o.id,
    cartId: o.cartId,
    status: o.status as OrderSummary["status"],
    planType: o.planType as OrderSummary["planType"],
    amount: o.amount,
    currency: o.currency,
    paidAt: o.paidAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  };
}

// --- Criação de pedido -------------------------------------------------------

/**
 * Cria um pedido para a carta. Idempotente: se já existir um pedido PENDING
 * para esta carta, reaproveita em vez de criar outro (evita duplicidade em
 * duplo clique / atualização da página de checkout).
 */
export async function createOrder(
  token: string | null,
  input: CreateOrderInput,
): Promise<OrderSummary> {
  if (!token) throw new ApiError("unauthorized", "Token de edição ausente.");

  const cart = await prisma.cart.findUnique({
    where: { id: input.cartId },
    include: cartInclude,
  });
  if (!cart) throw new ApiError("not_found", "Rascunho não encontrado.");
  if (!verifyEditToken(token, cart.editTokenHash)) {
    throw new ApiError("unauthorized", "Token de edição inválido.");
  }
  if (cart.status !== "DRAFT" && cart.status !== "AWAITING_PAYMENT") {
    throw new ApiError("forbidden_state", "Esta carta já foi processada.");
  }
  const contentOk = cart.title.trim() && cart.message.trim() && cart.senderName.trim() && cart.recipientType;
  if (!contentOk) {
    throw new ApiError("conflict", "Complete a cartinha antes de ir para o pagamento.");
  }

  const existingPending = await prisma.order.findFirst({
    where: { cartId: cart.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (existingPending && existingPending.planType === input.planType) {
    return toSummary(existingPending);
  }

  // Preço é sempre calculado no servidor — nunca confiar no navegador.
  const plan = getPlan(input.planType);
  const provider = getPaymentProvider();

  const order = await prisma.$transaction(async (tx) => {
    await tx.cart.update({
      where: { id: cart.id },
      data: { planType: input.planType, status: "AWAITING_PAYMENT" },
    });
    const created = await tx.order.create({
      data: {
        cartId: cart.id,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone || null,
        planType: input.planType,
        amount: plan.priceCents,
        currency: "BRL",
        paymentMethod: "MOCK",
        provider: provider.name,
        status: "PENDING",
      },
    });
    return created;
  });

  // Só o provider mock cria o "pagamento" já na criação do pedido — o
  // método (MOCK) é fixo e não depende de escolha do comprador. Com o
  // provider real, o comprador ainda vai escolher Pix ou cartão na tela de
  // checkout; a criação do pagamento de verdade acontece em
  // createPixPaymentAttempt/createCardPaymentAttempt, não aqui.
  if (provider.name === "mock") {
    const payment = await provider.createPayment({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      method: "MOCK",
    });
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { providerPaymentId: payment.providerPaymentId },
    });
    return toSummary(updated);
  }

  return toSummary(order);
}

// --- Tentativas de pagamento real (Pix / cartão) -----------------------------

const RETRYABLE_STATUSES = ["PENDING", "FAILED", "CANCELLED", "EXPIRED"] as const;

function isRetryable(status: string): boolean {
  return (RETRYABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Janela em que uma reserva de criação de Pix (`Order.pixClaimedAt`) é
 * considerada "em andamento". Depois disso sem a reserva ter sido liberada
 * — processo morreu no meio da chamada ao provedor: timeout de função
 * serverless, queda de conexão — uma nova tentativa pode assumir a reserva
 * em vez de ficar bloqueada para sempre. Generosa o bastante para cobrir a
 * latência real de uma chamada ao Mercado Pago (segundos), curta o bastante
 * para não deixar o comprador esperando muito se o processo anterior
 * realmente morreu.
 */
const PIX_CLAIM_STALE_MS = 30_000;

/**
 * Encerramento de uma tentativa de cartão que o provedor já resolveu.
 * `expectedKey` é a chave com que ESTA tentativa reivindicou: ela entra no
 * `where` como compare-and-swap para que uma tentativa superada nunca
 * sobrescreva o `providerPaymentId` de outra.
 */
interface CardAttemptResolution {
  expectedKey: string;
  /**
   * Só `PENDING` ou `FAILED`. Uma recusa é definitiva e o provedor já a
   * informou de forma síncrona, então registrá-la aqui é o que devolve o
   * pedido ao comprador para tentar outro cartão. Aprovação **nunca** é
   * aplicada aqui: quem publica a carta é o webhook (task 013, seção 9), e
   * marcar PAID neste ponto faria `shouldApplyTransition` descartar o webhook
   * depois — a carta nunca seria publicada.
   */
  resolvedStatus: "PENDING" | "FAILED";
}

/**
 * Registra a tentativa de pagamento no pedido sem nunca regredir um estado já
 * resolvido.
 *
 * O webhook pode chegar **durante** a chamada ao provedor — cartão é aprovado
 * de forma síncrona pelo Mercado Pago e a notificação sai quase junto com a
 * resposta. Uma escrita incondicional de `status: "PENDING"` aqui desfaria a
 * aprovação e deixaria a carta publicada presa a um pedido "pendente".
 *
 * A guarda é o mesmo `updateMany` condicional de `finalizeOrderAsPaid`: uma
 * única instrução, atômica de verdade (não um read-then-write, que a
 * isolação padrão do Postgres não protegeria). Se ela não pega o pedido, o
 * estado decidido pelo webhook prevalece e só a referência da cobrança é
 * gravada — sem ela o suporte perderia o vínculo com o pagamento.
 */
async function recordPaymentAttempt(
  orderId: string,
  paymentMethod: "PIX" | "CARD",
  providerName: string,
  providerPaymentId: string,
  pix?: PixPaymentData,
  card?: CardAttemptResolution,
): Promise<void> {
  const attempt = {
    paymentMethod,
    provider: providerName,
    providerPaymentId,
    // Libera a reserva de criação de Pix (se houver uma) — a tentativa já
    // está resolvida, com ou sem sucesso na hora de gravar.
    pixClaimedAt: null,
    ...(pix
      ? {
          pixQrCode: pix.qrCode,
          pixQrCodeBase64: pix.qrCodeBase64,
          pixExpiresAt: pix.expiresAt ? new Date(pix.expiresAt) : null,
          // Único ponto que descarta a chave de idempotência: aqui a tentativa
          // terminou de forma DEFINITIVA (o provedor respondeu e temos o Pix
          // gravado). Qualquer outro desfecho é ambíguo e precisa preservá-la.
          pixIdempotencyKey: null,
        }
      : {}),
    ...(card
      ? {
          // Tentativa de cartão resolvida: libera a reserva e descarta a
          // chave junto com a impressão do token. A próxima tentativa é uma
          // operação nova (outro cartão, outro token) e precisa de chave nova.
          cardClaimedAt: null,
          cardIdempotencyKey: null,
          cardTokenFingerprint: null,
        }
      : {}),
  };

  // CAS da tentativa de cartão: se outra tentativa já rotacionou a chave,
  // esta aqui está superada e não pode escrever nada.
  const cardGuard = card ? { cardIdempotencyKey: card.expectedKey } : {};

  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: { in: [...RETRYABLE_STATUSES] }, ...cardGuard },
    data: { ...attempt, status: card?.resolvedStatus ?? "PENDING" },
  });
  if (claimed.count > 0) return;

  const recorded = await prisma.order.updateMany({
    where: { id: orderId, providerPaymentId: null, ...cardGuard },
    data: attempt,
  });
  if (recorded.count > 0 || !card) return;

  // Nenhuma das duas escritas pegou uma tentativa de cartão: ou o webhook já
  // resolveu o pedido com OUTRA cobrança, ou a chave rotacionou. Recusar a
  // sobrescrita é o comportamento correto, mas a cobrança que acabamos de
  // criar não pode sumir — o log é o que permite reconciliá-la (o
  // `PaymentEvent` do webhook dela também guarda o mesmo id).
  console.error("[pagamento] cobrança de cartão criada sem vínculo com o pedido", {
    orderId,
    providerPaymentId,
    motivo: "tentativa superada por outra (compare-and-swap da chave falhou)",
  });
}

/**
 * Carrega o pedido autorizando pela mesma trilha de sempre (token de edição
 * do rascunho — não existe login) e garante que ele ainda pode receber uma
 * tentativa de pagamento. PAID/REFUNDED/CHARGED_BACK nunca são reabertos.
 */
async function loadRetryableOrder(orderId: string, token: string | null) {
  if (!token) throw new ApiError("unauthorized", "Token de edição ausente.");
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { cart: true } });
  if (!order) throw new ApiError("not_found", "Pedido não encontrado.");
  if (!verifyEditToken(token, order.cart.editTokenHash)) {
    throw new ApiError("unauthorized", "Token de edição inválido.");
  }
  if (!isRetryable(order.status)) {
    throw new ApiError(
      "forbidden_state",
      "Este pedido já foi concluído e não pode ser pago novamente.",
    );
  }
  return order;
}

export interface PixAttemptResult {
  order: OrderSummary;
  pix: PixPaymentData;
}

type PixClaim =
  | { kind: "claimed"; idempotencyKey: string }
  | { kind: "reuse"; result: PixAttemptResult };

/** Pix já registrado no pedido, pronto para ser reaproveitado como está. */
type ReusableOrder = { pixQrCode: string; pixQrCodeBase64: string };

function reusablePix(order: {
  paymentMethod: string;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
}): order is typeof order & ReusableOrder {
  return order.paymentMethod === "PIX" && !!order.pixQrCode && order.pixQrCodeBase64 !== null;
}

/**
 * Reivindica atomicamente o direito de criar um Pix para o pedido, ou
 * devolve um Pix já válido para reaproveitar. Nunca deixa duas chamadas —
 * Strict Mode (dev), duplo clique, retry de rede, requisição genuinamente
 * concorrente — criarem dois pagamentos independentes no provedor: só quem
 * consegue mover `pixClaimedAt` de nulo (ou expirado) para agora segue em
 * frente para chamar o Mercado Pago (task 013; incidente de 2026-08-07 —
 * pedido cmsixlhc000032ydptvluv4zu recebeu dois PIX reais de uma única ação
 * do usuário).
 *
 * Devolve junto a `X-Idempotency-Key` a ser enviada ao provedor, **já
 * persistida**: uma tentativa ainda não resolvida reaproveita exatamente a
 * chave que gravou antes de chamar o provedor, para que reapresentar uma
 * operação de resultado desconhecido devolva o mesmo pagamento em vez de
 * criar um segundo. Chave nova só nasce quando não há tentativa em aberto.
 *
 * Guarda dedicada, não reaproveita `providerPaymentId`: essa coluna também
 * precisa continuar aceitando troca de método (ex.: cartão recusado, cliente
 * tenta Pix em seguida) sem que esta reivindicação atrapalhe.
 */
async function claimOrReusePixAttempt(orderId: string): Promise<PixClaim> {
  // Duas voltas no máximo. Ler a chave e reivindicar são duas instruções, e
  // entre elas outra requisição pode ter gravado a sua — o compare-and-swap
  // em `pixIdempotencyKey` detecta isso e a segunda volta relê o estado já
  // com a chave da outra tentativa. Sem esse CAS, uma reivindicação poderia
  // sobrescrever a chave de uma operação cujo resultado é desconhecido, que
  // é exatamente o que precisamos nunca perder.
  for (let round = 0; round < 2; round++) {
    const before = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    if (!isRetryable(before.status)) {
      throw new ApiError(
        "forbidden_state",
        "Este pedido já foi concluído e não pode ser pago novamente.",
      );
    }
    if (reusablePix(before)) {
      return {
        kind: "reuse",
        result: {
          order: toSummary(before),
          pix: {
            qrCode: before.pixQrCode,
            qrCodeBase64: before.pixQrCodeBase64,
            expiresAt: before.pixExpiresAt?.toISOString() ?? null,
          },
        },
      };
    }

    const now = new Date();
    const staleBefore = new Date(now.getTime() - PIX_CLAIM_STALE_MS);
    // Chave de uma tentativa anterior ainda não resolvida é reaproveitada tal
    // e qual; só na ausência dela nasce uma nova.
    const idempotencyKey = before.pixIdempotencyKey ?? randomUUID();

    const claimed = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: { in: [...RETRYABLE_STATUSES] },
        // Só reivindica se não houver Pix válido já registrado para
        // reaproveitar — sem esta condição, uma chamada sequencial DEPOIS de
        // uma tentativa já concluída (que limpa pixClaimedAt de volta para
        // nulo em recordPaymentAttempt) reivindicaria de novo em vez de cair
        // no reaproveitamento acima.
        pixQrCode: null,
        pixIdempotencyKey: before.pixIdempotencyKey,
        OR: [{ pixClaimedAt: null }, { pixClaimedAt: { lt: staleBefore } }],
      },
      data: { pixClaimedAt: now, pixIdempotencyKey: idempotencyKey },
    });
    if (claimed.count > 0) return { kind: "claimed", idempotencyKey };
  }

  // Reserva de outra chamada ainda viva e nenhum Pix para reaproveitar: ela
  // está no meio da criação. Recusa em vez de arriscar uma segunda cobrança.
  throw new ApiError(
    "conflict",
    "Já existe uma criação de Pix em andamento para este pedido. Aguarde alguns instantes e tente novamente.",
  );
}

/**
 * Cria (ou recria, se a tentativa anterior expirou/falhou) um pagamento Pix
 * para o pedido. Idempotente por construção via `claimOrReusePixAttempt`:
 * chamadas concorrentes ou repetidas para o mesmo pedido nunca criam duas
 * cobranças independentes no Mercado Pago — a segunda reaproveita o mesmo
 * QR Code da primeira, nunca um novo.
 *
 * O corpo enviado ao provedor é montado só a partir de campos imutáveis do
 * pedido (id, amount, currency, dados do comprador — nenhum deles é
 * reescrito depois da criação do pedido) mais constantes. Por isso reenviar
 * a mesma `idempotencyKey` sempre reapresenta a MESMA operação, nunca uma
 * cobrança de valor ou pagador diferente sob uma chave reaproveitada.
 */
export async function createPixPaymentAttempt(
  orderId: string,
  token: string | null,
): Promise<PixAttemptResult> {
  const order = await loadRetryableOrder(orderId, token);

  const claim = await claimOrReusePixAttempt(order.id);
  if (claim.kind === "reuse") return claim.result;

  const provider = getPaymentProvider();
  try {
    const result = await provider.createPayment({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      method: "PIX",
      payer: {
        name: order.customerName,
        email: order.customerEmail,
        document: order.customerDocument ?? undefined,
      },
      idempotencyKey: claim.idempotencyKey,
    });
    if (!result.pix) {
      throw new ApiError("server", "O provedor de pagamento não retornou os dados do Pix.");
    }

    await recordPaymentAttempt(order.id, "PIX", provider.name, result.providerPaymentId, result.pix);
    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    return { order: toSummary(updated), pix: result.pix };
  } catch (err) {
    // Libera só a RESERVA, para que um retry não precise esperar
    // PIX_CLAIM_STALE_MS. `pixIdempotencyKey` é deliberadamente preservada:
    // toda falha que chega aqui é ambígua (timeout, conexão encerrada, 5xx,
    // resposta sem os dados do Pix) — o Mercado Pago pode ter criado a
    // cobrança mesmo assim. Só reenviando a MESMA chave o retry recupera
    // aquele pagamento em vez de criar um segundo. A chave só é descartada
    // em recordPaymentAttempt, quando a tentativa se resolve de fato.
    await prisma.order.updateMany({ where: { id: order.id }, data: { pixClaimedAt: null } });
    throw err;
  }
}

export interface CardAttemptInput {
  token: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
}

/**
 * Janela em que uma reserva de cobrança de cartão é considerada "em
 * andamento". Mais generosa que a do Pix (30 s) de propósito: no cartão a
 * reserva também cobre a janela ambígua depois de uma falha, e precisa durar
 * o bastante para o webhook do Mercado Pago chegar e resolver o pedido antes
 * de o comprador conseguir cobrar num cartão diferente. Curta o bastante para
 * não prender ninguém caso a cobrança nunca tenha sido criada.
 */
const CARD_CLAIM_STALE_MS = 90_000;

/**
 * Impressão do token do cartão. Nunca guardamos o token (ele vale uma vez, é
 * dado de pagamento e não tem por que existir no nosso banco) — só um SHA-256
 * dele, que responde à única pergunta que o serviço precisa fazer: "esta
 * requisição é a mesma tentativa de novo, ou uma tentativa nova?".
 */
function cardTokenFingerprint(cardToken: string): string {
  return createHash("sha256").update(cardToken).digest("hex");
}

/**
 * Reivindica atomicamente o direito de criar UMA cobrança de cartão para o
 * pedido, devolvendo a chave de idempotência a usar.
 *
 * O ciclo do cartão não é o do Pix. No Pix a cobrança é uma só e pode ser
 * reapresentada indefinidamente com a mesma chave. No cartão, uma recusa é um
 * desfecho legítimo e o comprador tem o direito de tentar outro cartão — o
 * que é uma operação DIFERENTE, com token diferente, e que exige chave nova.
 * Por isso a chave aqui pertence à tentativa (identificada pela impressão do
 * token), não ao pedido.
 *
 * As três recusas possíveis, todas 409:
 * - pedido já concluído (PAID/REFUNDED/CHARGED_BACK);
 * - já existe cobrança de cartão viva aguardando confirmação;
 * - já existe uma tentativa em andamento (reserva ainda válida).
 */
async function claimCardAttempt(orderId: string, cardToken: string): Promise<string> {
  const fingerprint = cardTokenFingerprint(cardToken);
  const emAndamento = new ApiError(
    "conflict",
    "Já existe uma tentativa de pagamento com cartão em andamento para este pedido. " +
      "Aguarde a confirmação antes de tentar de novo.",
  );

  // Duas voltas, mesmo motivo do Pix: ler e reivindicar são duas instruções,
  // e o compare-and-swap na chave detecta outra tentativa que tenha entrado
  // no meio — nunca sobrescrevemos a chave de uma operação cujo resultado
  // ainda não conhecemos.
  for (let round = 0; round < 2; round++) {
    const before = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    if (!isRetryable(before.status)) {
      throw new ApiError(
        "forbidden_state",
        "Este pedido já foi concluído e não pode ser pago novamente.",
      );
    }

    // Cobrança de cartão já registrada e ainda não resolvida: o dinheiro pode
    // estar a caminho. Uma segunda cobrança aqui é exatamente o defeito que
    // esta reserva existe para impedir.
    if (before.paymentMethod === "CARD" && before.providerPaymentId && before.status === "PENDING") {
      throw new ApiError(
        "conflict",
        "Já existe um pagamento com cartão em processamento para este pedido. " +
          "Aguarde a confirmação — não é preciso pagar de novo.",
      );
    }

    const now = new Date();
    const staleBefore = new Date(now.getTime() - CARD_CLAIM_STALE_MS);
    if (before.cardClaimedAt && before.cardClaimedAt >= staleBefore) throw emAndamento;

    // Mesmo token ⇒ mesma operação reapresentada ⇒ mesma chave (o provedor
    // devolve a cobrança original em vez de criar outra). Token diferente ⇒
    // tentativa nova ⇒ chave nova.
    const mesmaTentativa = before.cardIdempotencyKey !== null && before.cardTokenFingerprint === fingerprint;
    const idempotencyKey = mesmaTentativa ? before.cardIdempotencyKey! : randomUUID();

    const claimed = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: { in: [...RETRYABLE_STATUSES] },
        providerPaymentId: before.providerPaymentId,
        cardIdempotencyKey: before.cardIdempotencyKey,
        OR: [{ cardClaimedAt: null }, { cardClaimedAt: { lt: staleBefore } }],
      },
      data: {
        cardClaimedAt: now,
        cardIdempotencyKey: idempotencyKey,
        cardTokenFingerprint: fingerprint,
      },
    });
    if (claimed.count > 0) return idempotencyKey;
  }

  throw emAndamento;
}

export interface CardAttemptResult {
  order: OrderSummary;
  /**
   * Resposta imediata do provedor — só para feedback de UX (ex.: "recusado,
   * tente outro cartão"). NUNCA é o gatilho de publicação: a carta só é
   * publicada quando o webhook confirmar (task 013, seção 9).
   */
  status: PaymentStatus;
  statusDetail?: string;
}

/**
 * Cria um pagamento de cartão a partir de um token gerado no navegador
 * (Payment Brick) — o número do cartão nunca passa por este servidor. Pode
 * ser chamada de novo para o mesmo pedido com um cartão diferente enquanto
 * o pedido não estiver PAID/REFUNDED/CHARGED_BACK.
 */
export async function createCardPaymentAttempt(
  orderId: string,
  token: string | null,
  card: CardAttemptInput,
): Promise<CardAttemptResult> {
  const order = await loadRetryableOrder(orderId, token);
  const idempotencyKey = await claimCardAttempt(order.id, card.token);

  const provider = getPaymentProvider();
  try {
    const result = await provider.createPayment({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      method: "CARD",
      payer: {
        name: order.customerName,
        email: order.customerEmail,
        document: order.customerDocument ?? undefined,
      },
      card,
      idempotencyKey,
    });

    // Aprovação NUNCA é aplicada aqui — só o webhook publica a carta. Recusa
    // é aplicada porque o provedor já a resolveu de forma definitiva e sem
    // isso o comprador ficaria preso atrás da guarda de cobrança viva.
    await recordPaymentAttempt(order.id, "CARD", provider.name, result.providerPaymentId, undefined, {
      expectedKey: idempotencyKey,
      resolvedStatus: result.status === "failed" ? "FAILED" : "PENDING",
    });
    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    return { order: toSummary(updated), status: result.status, statusDetail: result.statusDetail };
  } catch (err) {
    if (err instanceof MercadoPagoRequestRejectedError) {
      // 4xx: o Mercado Pago recusou a requisição e não criou cobrança
      // nenhuma. Liberar tudo devolve o pedido ao comprador na hora, para
      // corrigir o cartão — segurar seria prejudicá-lo sem ganho de segurança.
      await prisma.order.updateMany({
        where: { id: order.id, cardIdempotencyKey: idempotencyKey },
        data: { cardClaimedAt: null, cardIdempotencyKey: null, cardTokenFingerprint: null },
      });
      throw err;
    }

    // Falha AMBÍGUA (timeout, conexão perdida, 5xx, processo morto): o
    // Mercado Pago pode ter criado a cobrança. Aqui está a diferença
    // deliberada em relação ao Pix, que libera a reserva no catch: no Pix
    // reapresentar a mesma chave recupera a MESMA cobrança, então liberar é
    // inofensivo. No cartão o navegador gera um token novo a cada submissão,
    // então a próxima tentativa seria uma operação diferente — e cobraria de
    // novo. Manter a reserva viva é o que segura essa janela até o webhook
    // resolver o pedido; passado CARD_CLAIM_STALE_MS ela expira sozinha para
    // não prender o comprador para sempre.
    throw err;
  }
}

export async function getOrderStatus(orderId: string): Promise<OrderSummary> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ApiError("not_found", "Pedido não encontrado.");
  return toSummary(order);
}

/**
 * Resultado completo do pedido (somente leitura, sem efeitos colaterais).
 * Quando PAID, inclui a carta, o link público e o QR Code — usado pela
 * página de sucesso para exibir o resultado sem repetir a confirmação.
 */
export async function getOrderResult(orderId: string): Promise<MockConfirmResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ApiError("not_found", "Pedido não encontrado.");
  return buildResultFromExisting(order);
}

// --- Confirmação mock (idempotente) -----------------------------------------

export type MockConfirmAction = "success" | "fail" | "expire";

export interface MockConfirmResult {
  order: OrderSummary;
  cart: Cart | null;
  publicUrl: string | null;
  qrCodeDataUrl: string | null;
}

/**
 * Confirma (ou simula falha/expiração) o pagamento mock.
 * Idempotente: chamadas repetidas para um pedido já resolvido retornam o
 * mesmo resultado, sem duplicar publicação, slug ou e-mail.
 */
export async function mockConfirmOrder(
  orderId: string,
  action: MockConfirmAction,
): Promise<MockConfirmResult> {
  if (!isMockConfirmationAllowed()) {
    throw new ApiError(
      "mock_disabled",
      "Confirmação mock desativada. Configure PAYMENT_MODE=mock e ALLOW_MOCK_PAYMENT_CONFIRMATION=true.",
    );
  }

  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) throw new ApiError("not_found", "Pedido não encontrado.");

  // Já resolvido: devolve o estado atual sem repetir efeitos colaterais.
  if (existing.status !== "PENDING") {
    return buildResultFromExisting(existing);
  }

  if (action !== "success") {
    const nextStatus = action === "fail" ? "FAILED" : "EXPIRED";
    const res = await prisma.order.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: { status: nextStatus },
    });
    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    void res;
    return { order: toSummary(finalOrder), cart: null, publicUrl: null, qrCodeDataUrl: null };
  }

  // Guard atômico: só um caller vence a corrida (updateMany condicional).
  const claimed = await finalizeOrderAsPaid(existing);
  if (!claimed) {
    // Outra requisição confirmou entre a leitura e a escrita: idempotente.
    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    return buildResultFromExisting(finalOrder);
  }

  const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return { order: toSummary(finalOrder), ...claimed };
}

/**
 * Núcleo idempotente de "aprovar um pagamento": claim atômico (só quem
 * efetivamente tira o pedido de PENDING publica), publicação transacional e
 * outbox de e-mail único. Reusado por `mockConfirmOrder` (Fase 2) e pelo
 * webhook do Mercado Pago (task 013) — o **único** outro lugar que pode
 * marcar um pedido como pago é a confirmação mock, que já tem seu próprio
 * guard de `PAYMENT_MODE`/`ALLOW_MOCK_PAYMENT_CONFIRMATION`.
 *
 * Devolve `false` se outra chamada concorrente já resolveu o pedido — nada é
 * republicado nem reenviado.
 */
async function finalizeOrderAsPaid(order: {
  id: string;
  cartId: string;
  customerName: string;
  customerEmail: string;
}): Promise<false | { cart: Cart; publicUrl: string; qrCodeDataUrl: string | null }> {
  const now = new Date();
  const claim = await prisma.order.updateMany({
    where: { id: order.id, status: "PENDING" },
    data: { status: "PAID", paidAt: now },
  });
  if (claim.count === 0) return false;

  const publishedRow = await prisma.$transaction((tx) =>
    publishCartWithClient(tx, order.cartId, now),
  );
  const cart = dbToDomainCart(publishedRow as unknown as DbCartRow);
  const publicUrl = buildPublicCartUrl(cart.slug!);
  const qrCodeDataUrl = await generateQrDataUrl(publicUrl);

  await deliverPublishedEmail(
    order.id,
    order.customerName,
    order.customerEmail,
    cart,
    publicUrl,
    qrCodeDataUrl,
  );

  return { cart, publicUrl, qrCodeDataUrl };
}

// --- Webhook do Mercado Pago (task 013, seção 9) -----------------------------

export interface MercadoPagoWebhookInput {
  provider: string;
  /** Id da notificação em si (não o id do pagamento) — chave de idempotência. */
  providerEventId: string;
  providerPaymentId: string;
  externalReference: string | null;
  status: string;
  statusDetail: string | null;
  type: string;
}

export type WebhookOutcome =
  | { kind: "duplicate" }
  | { kind: "unknown_order" }
  | { kind: "stale_attempt" }
  | { kind: "no_transition" }
  | { kind: "applied"; internalStatus: InternalOrderStatus };

/**
 * Aplica uma notificação de webhook já com assinatura validada (a validação
 * roda na rota, antes de chamar esta função). É a **única** fonte de verdade
 * para aprovar um pagamento — nunca o retorno do navegador, query string,
 * redirecionamento ou polling do front.
 *
 * Ordem das checagens, cada uma cobrindo um caso da seção 9 da task 013:
 * 1. idempotência — `PaymentEvent` único por (provider, providerEventId);
 *    inserir de novo o mesmo evento falha e vira "duplicate" sem reprocessar;
 * 2. pedido desconhecido — `external_reference` não bate com nenhum pedido;
 * 3. tentativa superada — o pagamento da notificação não é o mais recente
 *    registrado no pedido (ex.: 2ª tentativa de cartão já está em andamento);
 * 4. fora de ordem — a transição não é permitida a partir do estado atual
 *    (`shouldApplyTransition`), ex.: notificação atrasada de "pending"
 *    chegando depois de o pedido já ter sido aprovado.
 */
export async function applyMercadoPagoWebhook(
  input: MercadoPagoWebhookInput,
): Promise<WebhookOutcome> {
  const order = input.externalReference
    ? await prisma.order.findUnique({ where: { id: input.externalReference } })
    : null;

  const eventKey = { provider: input.provider, providerEventId: input.providerEventId };

  // Reserva do evento. A dedup acontece em duas etapas de propósito: a linha
  // marca "esta notificação chegou", e `processedAt` marca "e foi aplicada".
  // Um evento reservado sem `processedAt` é resto de um processo que morreu no
  // meio (timeout de função serverless, queda de conexão) — o reenvio do
  // Mercado Pago precisa poder terminar o serviço. Tratar a mera existência da
  // linha como duplicado deixaria o pagamento confirmado no provedor e a carta
  // nunca publicada, sem chance de retry.
  const existing = await prisma.paymentEvent.findUnique({
    where: { provider_providerEventId: eventKey },
  });
  if (existing?.processedAt) return { kind: "duplicate" };

  if (!existing) {
    try {
      await prisma.paymentEvent.create({
        data: {
          ...eventKey,
          orderId: order?.id ?? null,
          type: input.type,
          providerPaymentId: input.providerPaymentId,
          rawStatus: input.status,
        },
      });
    } catch {
      // Outra entrega da mesma notificação venceu a corrida e está aplicando
      // agora: sair sem tocar em nada é o comportamento seguro.
      return { kind: "duplicate" };
    }
  }

  const outcome = await resolveWebhookOutcome(order, input);

  // Só aqui o evento vira definitivamente concluído. Qualquer exceção acima
  // deixa `processedAt` nulo e mantém o reenvio processável.
  await prisma.paymentEvent.update({
    where: { provider_providerEventId: eventKey },
    data: { processedAt: new Date(), orderId: order?.id ?? null },
  });

  return outcome;
}

type WebhookOrder = NonNullable<Awaited<ReturnType<typeof prisma.order.findUnique>>>;

/**
 * Decide e aplica o efeito de uma notificação já reservada. Separada de
 * `applyMercadoPagoWebhook` para que a marcação de "evento concluído" fique
 * num único ponto, depois de todo efeito colateral ter dado certo.
 */
async function resolveWebhookOutcome(
  order: WebhookOrder | null,
  input: MercadoPagoWebhookInput,
): Promise<WebhookOutcome> {
  if (!order) return { kind: "unknown_order" };

  if (order.providerPaymentId && order.providerPaymentId !== input.providerPaymentId) {
    return { kind: "stale_attempt" };
  }

  const nextStatus = mapMercadoPagoStatus(input.status, input.statusDetail);
  if (!shouldApplyTransition(order.status as InternalOrderStatus, nextStatus)) {
    return { kind: "no_transition" };
  }

  if (nextStatus === "PAID") {
    await finalizeOrderAsPaid(order);
  } else {
    // Mesmo guard otimista do claim de pagamento: só aplica se o estado
    // ainda for o que líamos há pouco (evita corrida com outro processo).
    await prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: nextStatus },
    });
  }

  return { kind: "applied", internalStatus: nextStatus };
}

async function buildResultFromExisting(existing: {
  id: string;
  cartId: string;
  status: string;
}): Promise<MockConfirmResult> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: existing.id } });
  if (order.status !== "PAID") {
    return { order: toSummary(order), cart: null, publicUrl: null, qrCodeDataUrl: null };
  }
  const cartRow = await prisma.cart.findUnique({
    where: { id: existing.cartId },
    include: cartInclude,
  });
  const cart = cartRow ? dbToDomainCart(cartRow as unknown as DbCartRow) : null;
  const publicUrl = cart?.slug ? buildPublicCartUrl(cart.slug) : null;
  const qrCodeDataUrl = publicUrl ? await generateQrDataUrl(publicUrl) : null;
  return { order: toSummary(order), cart, publicUrl, qrCodeDataUrl };
}

/**
 * Registra e "envia" (mock) o e-mail de carta publicada, usando EmailDelivery
 * como outbox: a unicidade [orderId, type] garante um único envio mesmo sob
 * confirmações concorrentes.
 */
async function deliverPublishedEmail(
  orderId: string,
  customerName: string,
  customerEmail: string,
  cart: Cart,
  publicUrl: string,
  qrCodeDataUrl: string | null,
): Promise<void> {
  const type = "cart_published";
  try {
    await prisma.emailDelivery.create({
      data: { orderId, type, recipient: customerEmail, status: "PENDING", payload: "" },
    });
  } catch {
    return; // já existe (unique constraint) — outra chamada já está cuidando disso.
  }

  const provider = getEmailProvider();
  const planLabel = cart.planType === "PERMANENT" ? "Para Sempre" : "Essencial";
  try {
    const rendered = await provider.sendCartPublished({
      to: customerEmail,
      customerName,
      cartTitle: cart.title || site.name,
      publicUrl,
      qrCodeDataUrl,
      planLabel,
      expiresAt: cart.expiresAt,
    });
    await prisma.emailDelivery.update({
      where: { orderId_type: { orderId, type } },
      data: {
        status: "SENT",
        payload: JSON.stringify(rendered),
        attempts: { increment: 1 },
        sentAt: new Date(),
      },
    });
  } catch {
    await prisma.emailDelivery.update({
      where: { orderId_type: { orderId, type } },
      data: { status: "FAILED", attempts: { increment: 1 } },
    });
  }
}

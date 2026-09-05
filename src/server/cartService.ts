import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/** Cliente Prisma ou cliente de transação — mesma API para os dois. */
type Db = typeof prisma | Prisma.TransactionClient;
import { generateEditToken, hashEditToken, verifyEditToken } from "@/lib/editToken";
import { generateSlug } from "@/lib/slug";
import { computeExpiresAt, isExpired } from "@/lib/expiry";
import { dbToDomainCart, type DbCartRow } from "@/lib/cartMapping";
import { MAX_CART_PHOTOS, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { ALLOWED_IMAGE_MIME, extensionForMime, sniffImageMime } from "@/lib/imageMagic";
import { getStorage } from "@/server/storage";
import { ApiError } from "@/server/errors";
import type { DraftUpdateInput } from "@/server/schemas";
import { clampFraming, type PhotoFraming } from "@/lib/photoFraming";
import type { Cart, PlanType } from "@/lib/types";

const EDITABLE_STATUSES = new Set(["DRAFT", "AWAITING_PAYMENT"]);
const cartInclude = { media: { orderBy: { position: "asc" as const } } };

// --- Leitura / autorização -------------------------------------------------

async function loadRow(cartId: string): Promise<DbCartRow> {
  const row = await prisma.cart.findUnique({ where: { id: cartId }, include: cartInclude });
  if (!row) throw new ApiError("not_found", "Rascunho não encontrado.");
  return row as unknown as DbCartRow;
}

async function loadRowWithToken(
  cartId: string,
  token: string | null,
): Promise<DbCartRow & { editTokenHash: string }> {
  if (!token) throw new ApiError("unauthorized", "Token de edição ausente.");
  const row = await prisma.cart.findUnique({ where: { id: cartId }, include: cartInclude });
  if (!row) throw new ApiError("not_found", "Rascunho não encontrado.");
  if (!verifyEditToken(token, row.editTokenHash)) {
    throw new ApiError("unauthorized", "Token de edição inválido.");
  }
  return row as unknown as DbCartRow & { editTokenHash: string };
}

function requireEditable(status: string): void {
  if (!EDITABLE_STATUSES.has(status)) {
    throw new ApiError("forbidden_state", "Esta carta não pode mais ser editada.");
  }
}

// --- Criação / atualização do rascunho -------------------------------------

export async function createDraft(
  initial?: DraftUpdateInput,
): Promise<{ cart: Cart; editToken: string }> {
  const editToken = generateEditToken();
  const data = { editTokenHash: hashEditToken(editToken), ...buildUpdateData(initial ?? {}) };
  const row = await prisma.cart.create({ data, include: cartInclude });
  return { cart: dbToDomainCart(row as unknown as DbCartRow), editToken };
}

export async function getCartForEdit(cartId: string, token: string | null): Promise<Cart> {
  const row = await loadRowWithToken(cartId, token);
  return dbToDomainCart(row);
}

export async function updateDraft(
  cartId: string,
  token: string | null,
  input: DraftUpdateInput,
): Promise<Cart> {
  const row = await loadRowWithToken(cartId, token);
  requireEditable(row.status);
  const updated = await prisma.cart.update({
    where: { id: cartId },
    data: buildUpdateData(input),
    include: cartInclude,
  });
  return dbToDomainCart(updated as unknown as DbCartRow);
}

/** Monta o objeto de atualização apenas com as chaves realmente enviadas. */
function buildUpdateData(input: DraftUpdateInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const simple = [
    "recipientType",
    "recipientName",
    "occasion",
    "title",
    "message",
    "senderName",
    "signature",
    "theme",
    "showRelationshipCounter",
    "planType",
  ] as const;
  for (const key of simple) {
    if (key in input) data[key] = input[key];
  }
  if ("relationshipStartDate" in input) {
    data.relationshipStartDate = input.relationshipStartDate
      ? new Date(input.relationshipStartDate)
      : null;
  }
  if ("music" in input) {
    const m = input.music;
    if (!m) {
      Object.assign(data, {
        musicVideoId: null,
        musicUrl: null,
        musicTitle: null,
        musicChannelTitle: null,
        musicThumbnailUrl: null,
        musicSource: null,
      });
    } else {
      Object.assign(data, {
        musicVideoId: m.videoId,
        musicUrl: m.youtubeUrl,
        musicTitle: m.title ?? null,
        musicChannelTitle: m.channelTitle ?? null,
        musicThumbnailUrl: m.thumbnailUrl ?? null,
        musicSource: m.source === "search" ? "SEARCH" : "MANUAL",
      });
    }
  }
  return data;
}

// --- Mídia -----------------------------------------------------------------

export async function addMedia(
  cartId: string,
  token: string | null,
  file: { body: Buffer; declaredType: string; width?: number; height?: number },
): Promise<Cart> {
  const row = await loadRowWithToken(cartId, token);
  requireEditable(row.status);

  if (file.body.byteLength > MAX_UPLOAD_BYTES) {
    throw new ApiError("invalid", "Imagem muito grande.");
  }
  const realMime = sniffImageMime(file.body);
  if (!realMime || !ALLOWED_IMAGE_MIME.has(realMime)) {
    throw new ApiError("invalid", "Arquivo não é uma imagem válida (JPG, PNG ou WEBP).");
  }

  const count = await prisma.cartMedia.count({ where: { cartId } });
  if (count >= MAX_CART_PHOTOS) {
    throw new ApiError("limit_reached", `Máximo de ${MAX_CART_PHOTOS} fotos.`);
  }

  const key = `carts/${cartId}/${randomUUID()}.${extensionForMime(realMime)}`;
  const { url } = await getStorage().put({ key, body: file.body, contentType: realMime });

  await prisma.cartMedia.create({
    data: {
      cartId,
      type: "photo",
      url,
      storageKey: key,
      mimeType: realMime,
      sizeBytes: file.body.byteLength,
      width: clampDim(file.width),
      height: clampDim(file.height),
      position: count,
    },
  });

  return dbToDomainCart(await loadRow(cartId));
}

function clampDim(n: number | undefined): number | null {
  return typeof n === "number" && n > 0 && n <= 10000 ? Math.round(n) : null;
}

export async function removeMedia(
  cartId: string,
  token: string | null,
  mediaId: string,
): Promise<Cart> {
  const row = await loadRowWithToken(cartId, token);
  requireEditable(row.status);

  const media = await prisma.cartMedia.findFirst({ where: { id: mediaId, cartId } });
  if (!media) throw new ApiError("not_found", "Foto não encontrada.");

  // Remove no banco (e renumera) e depois no storage (best-effort).
  await prisma.$transaction(async (tx) => {
    await tx.cartMedia.delete({ where: { id: mediaId } });
    const rest = await tx.cartMedia.findMany({
      where: { cartId },
      orderBy: { position: "asc" },
    });
    await Promise.all(
      rest.map((m, i) =>
        m.position === i
          ? Promise.resolve()
          : tx.cartMedia.update({ where: { id: m.id }, data: { position: i } }),
      ),
    );
  });
  // Best-effort de verdade: o banco já é a fonte da verdade e a foto saiu da
  // carta. Com storage remoto uma falha de rede aqui deixaria o usuário com
  // erro 500 numa remoção que, do ponto de vista dele, já aconteceu. No pior
  // caso sobra um objeto órfão no bucket.
  try {
    await getStorage().delete(media.storageKey);
  } catch (err) {
    console.error(`[storage] falha ao remover ${media.storageKey}:`, err);
  }

  return dbToDomainCart(await loadRow(cartId));
}

/**
 * Grava (ou limpa, com `null`) o enquadramento de UMA foto.
 *
 * Autorização: exatamente a mesma do resto da edição do rascunho — token de
 * edição válido (`loadRowWithToken`) e carta ainda editável. Além disso a
 * foto é buscada com `cartId` no filtro, então o id de uma foto de OUTRO
 * rascunho não é encontrado e vira 404: um token válido não dá acesso às
 * fotos de outra carta.
 *
 * Só metadados mudam aqui. O arquivo no storage nunca é reescrito, e o
 * enquadramento fica preso ao id da foto — reordenar ou trocar a capa
 * (`reorderMedia`, que só escreve `position`) não o afeta.
 */
export async function updateMediaFraming(
  cartId: string,
  token: string | null,
  mediaId: string,
  framing: PhotoFraming | null,
): Promise<Cart> {
  const row = await loadRowWithToken(cartId, token);
  requireEditable(row.status);

  const media = await prisma.cartMedia.findFirst({
    where: { id: mediaId, cartId },
    select: { id: true },
  });
  if (!media) throw new ApiError("not_found", "Foto não encontrada.");

  // Reaplica o clamp do domínio mesmo depois do Zod: é o schema que recusa o
  // que está fora de faixa, e é aqui que o valor gravado fica canônico
  // (arredondado), sem depender de quem chamou.
  const value = framing ? clampFraming(framing) : null;
  await prisma.cartMedia.update({
    where: { id: mediaId },
    data: {
      focalX: value?.x ?? null,
      focalY: value?.y ?? null,
      zoom: value?.zoom ?? null,
    },
  });

  return dbToDomainCart(await loadRow(cartId));
}

export async function reorderMedia(
  cartId: string,
  token: string | null,
  order: string[],
): Promise<Cart> {
  const row = await loadRowWithToken(cartId, token);
  requireEditable(row.status);

  const existing = new Set(row.media.map((m) => m.id));
  if (order.length !== existing.size || !order.every((id) => existing.has(id))) {
    throw new ApiError("invalid", "Ordem de fotos inválida.");
  }

  await prisma.$transaction(
    order.map((id, i) =>
      prisma.cartMedia.update({ where: { id }, data: { position: i } }),
    ),
  );
  return dbToDomainCart(await loadRow(cartId));
}

// --- Publicação ------------------------------------------------------------

/** Requisitos mínimos para publicar. Lança conflito se incompleta. */
export function assertPublishable(row: DbCartRow): void {
  const ok =
    row.title.trim() &&
    row.message.trim() &&
    row.senderName.trim() &&
    row.recipientType &&
    row.planType;
  if (!ok) throw new ApiError("conflict", "Cartinha incompleta para publicação.");
}

async function uniqueSlug(db: Db): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = generateSlug(); // >=128 bits de entropia (ver lib/slug.ts)
    const exists = await db.cart.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  throw new ApiError("server", "Não foi possível gerar um link único.");
}

/**
 * Publica a carta (idempotente). Chamada dentro da transação de confirmação
 * de pagamento (orderService), recebendo `tx` para que pedido+publicação
 * sejam atômicos. Aceita também o client normal fora de transação.
 *
 * `planType` é o plano do **pedido efetivamente pago** (`Order.planType`),
 * nunca `Cart.planType` lido do banco: a Cart é editável em
 * `AWAITING_PAYMENT` (o comprador pode voltar e trocar de plano com uma
 * cobrança já aberta), então `Cart.planType` pode divergir do que foi
 * realmente cobrado no pedido que está sendo finalizado. O pedido pago é o
 * contrato — é dele que vem a duração, e a Cart é reconciliada com esse
 * valor na mesma escrita (auditoria de 2026-08-30: duração entregue não
 * seguia o plano pago).
 */
export async function publishCartWithClient(
  db: Db,
  cartId: string,
  paidAt: Date,
  planType: PlanType,
): Promise<DbCartRow> {
  const row = (await db.cart.findUnique({
    where: { id: cartId },
    include: cartInclude,
  })) as unknown as DbCartRow | null;
  if (!row) throw new ApiError("not_found", "Rascunho não encontrado.");

  if (row.status === "PUBLISHED" && row.slug) return row; // idempotente
  assertPublishable(row);

  const slug = row.slug ?? (await uniqueSlug(db));
  const expiresAt = computeExpiresAt(planType, paidAt);

  await db.cart.update({
    where: { id: cartId },
    data: { status: "PUBLISHED", slug, publishedAt: paidAt, expiresAt, planType },
  });
  return (await db.cart.findUnique({
    where: { id: cartId },
    include: cartInclude,
  })) as unknown as DbCartRow;
}

/** Publica fora de uma transação (uso avulso/testes). */
export async function publishCart(cartId: string, paidAt: Date, planType: PlanType): Promise<DbCartRow> {
  return publishCartWithClient(prisma, cartId, paidAt, planType);
}

// --- Rota pública ----------------------------------------------------------

export type PublicCartResult =
  | { state: "ok"; cart: Cart }
  | { state: "not_found" }
  | { state: "expired" };

/**
 * Estornada (`REFUNDED`) ou contestada (`CHARGED_BACK`): o link continua
 * existindo, mas o acesso público precisa parar — sem isso, uma carta
 * estornada fica acessível para sempre (achado de auditoria, task 013
 * seção 9). O mesmo `"not_found"` de uma cartinha inexistente é devolvido
 * de propósito: o status financeiro do pedido nunca é público.
 *
 * `Order` é `Cart[]` (várias tentativas de pagamento podem existir para o
 * mesmo rascunho — retry após recusa, plano trocado etc.), então a Order
 * relevante não é "a primeira", é a mais recente que chegou a um estado
 * pós-aprovação. `PAID`/`REFUNDED`/`CHARGED_BACK` são os únicos estados
 * alcançáveis por uma Order depois de aprovada (`shouldApplyTransition` em
 * `mercadoPagoStatus.ts` nunca aplica outra transição a partir de `PAID`) —
 * por isso filtrar só por esses três já isola exatamente a tentativa que
 * publicou (ou tentou reverter) esta carta, sem precisar casar por
 * `paidAt`/`publishedAt` (que são timestamps gerados de forma independente
 * e não coincidem byte a byte — conferido contra `prisma/seed.ts`).
 *
 * Cartas de demonstração/seed publicadas diretamente no banco
 * (`prisma/seed.ts`, ex. `seed-expirada`) não têm Order nenhuma — a busca
 * abaixo não encontra nada e o acesso é preservado, de propósito: não há
 * pagamento nenhum para revogar.
 */
async function findReversedOrderStatus(cartId: string): Promise<"REFUNDED" | "CHARGED_BACK" | null> {
  const order = await prisma.order.findFirst({
    where: { cartId, status: { in: ["PAID", "REFUNDED", "CHARGED_BACK"] } },
    orderBy: { paidAt: "desc" },
    select: { status: true },
  });
  return order && order.status !== "PAID" ? (order.status as "REFUNDED" | "CHARGED_BACK") : null;
}

export async function getPublicCart(slug: string): Promise<PublicCartResult> {
  const row = await prisma.cart.findUnique({ where: { slug }, include: cartInclude });
  if (!row || row.status !== "PUBLISHED") return { state: "not_found" };
  if (isExpired(row.expiresAt)) return { state: "expired" };
  if (await findReversedOrderStatus(row.id)) return { state: "not_found" };
  return { state: "ok", cart: dbToDomainCart(row as unknown as DbCartRow) };
}

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
import type { Cart } from "@/lib/types";

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
 */
export async function publishCartWithClient(
  db: Db,
  cartId: string,
  paidAt: Date,
): Promise<DbCartRow> {
  const row = (await db.cart.findUnique({
    where: { id: cartId },
    include: cartInclude,
  })) as unknown as DbCartRow | null;
  if (!row) throw new ApiError("not_found", "Rascunho não encontrado.");

  if (row.status === "PUBLISHED" && row.slug) return row; // idempotente
  assertPublishable(row);

  const slug = row.slug ?? (await uniqueSlug(db));
  const expiresAt = computeExpiresAt(row.planType as "LIMITED" | "PERMANENT", paidAt);

  await db.cart.update({
    where: { id: cartId },
    data: { status: "PUBLISHED", slug, publishedAt: paidAt, expiresAt },
  });
  return (await db.cart.findUnique({
    where: { id: cartId },
    include: cartInclude,
  })) as unknown as DbCartRow;
}

/** Publica fora de uma transação (uso avulso/testes). */
export async function publishCart(cartId: string, paidAt: Date): Promise<DbCartRow> {
  return publishCartWithClient(prisma, cartId, paidAt);
}

// --- Rota pública ----------------------------------------------------------

export type PublicCartResult =
  | { state: "ok"; cart: Cart }
  | { state: "not_found" }
  | { state: "expired" };

export async function getPublicCart(slug: string): Promise<PublicCartResult> {
  const row = await prisma.cart.findUnique({ where: { slug }, include: cartInclude });
  if (!row || row.status !== "PUBLISHED") return { state: "not_found" };
  if (isExpired(row.expiresAt)) return { state: "expired" };
  return { state: "ok", cart: dbToDomainCart(row as unknown as DbCartRow) };
}

/**
 * Leitura da prévia pública `/presente/{publicId}`.
 *
 * A única porta de dados da página pública e da rota da foto. Regras:
 * - consulta com `select` explícito: nunca `include`, nunca a linha inteira;
 * - lê `message` só para extrair o trecho DENTRO deste módulo
 *   (`buildPublicPreviewDTO`); o texto completo nunca é devolvido;
 * - nunca seleciona remetente, assinatura, título, slug, datas pessoais, dados
 *   da música além de "tem ou não tem", nem as outras fotos;
 * - mesma validade de `/c/`: publicada, não expirada, sem estorno nem
 *   contestação. Fora disso é "não encontrada", sem distinguir o motivo.
 *
 * Nada aqui escreve no banco, exceto `ensurePublicIdForSlug`, que é chamada
 * por um POST (cartas publicadas antes da 2.0) e nunca por uma leitura.
 */
import { prisma } from "@/lib/db";
import { isExpired } from "@/lib/expiry";
import { generateSlug } from "@/lib/slug";
import {
  buildPublicPreviewDTO,
  isPublicIdFormat,
  SHARE_PREVIEW_VERSION,
  type PublicPreviewDTO,
} from "@/lib/publicPreview";
import { findReversedOrderStatus } from "@/server/cartService";
import { ApiError } from "@/server/errors";
import { getStorage } from "@/server/storage";
import { STORAGE_KEY_RE } from "@/server/storage/StorageProvider";

export type PublicPreviewResult = { state: "ok"; preview: PublicPreviewDTO } | { state: "not_found" };

/** Campos indispensáveis. `id` só serve para a checagem de estorno e não sai daqui. */
const PREVIEW_SELECT = {
  id: true,
  status: true,
  expiresAt: true,
  publicId: true,
  presentation: true,
  presentationOptions: true,
  theme: true,
  sharePreviewVersion: true,
  recipientName: true,
  message: true,
  musicVideoId: true,
  media: {
    orderBy: { position: "asc" as const },
    take: 1,
    select: { width: true, height: true, focalX: true, focalY: true, zoom: true },
  },
} as const;

async function isAvailable(row: { id: string; status: string; expiresAt: Date | null }): Promise<boolean> {
  if (row.status !== "PUBLISHED") return false;
  if (isExpired(row.expiresAt)) return false;
  return !(await findReversedOrderStatus(row.id));
}

export async function getPublicPreview(publicId: string): Promise<PublicPreviewResult> {
  if (!isPublicIdFormat(publicId)) return { state: "not_found" };
  const row = await prisma.cart.findUnique({ where: { publicId }, select: PREVIEW_SELECT });
  if (!row || !row.publicId || !(await isAvailable(row))) return { state: "not_found" };

  const photo = row.media[0] ?? null;
  return {
    state: "ok",
    preview: buildPublicPreviewDTO({
      publicId: row.publicId,
      presentation: row.presentation,
      presentationOptions: row.presentationOptions,
      theme: row.theme,
      sharePreviewVersion: row.sharePreviewVersion,
      recipientName: row.recipientName,
      message: row.message,
      firstPhoto: photo,
      hasMusic: Boolean(row.musicVideoId),
    }),
  };
}

/**
 * Bytes da primeira foto, só para a rota `/presente/{id}/foto`. A chave de
 * storage é lida aqui e não sai deste módulo (nem em cabeçalho).
 * Carta antiga (sem aviso de prévia) nunca tem foto pública.
 */
export async function readPublicPhoto(
  publicId: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (!isPublicIdFormat(publicId)) return null;
  const row = await prisma.cart.findUnique({
    where: { publicId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      sharePreviewVersion: true,
      media: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { storageKey: true },
      },
    },
  });
  if (!row || row.sharePreviewVersion !== SHARE_PREVIEW_VERSION) return null;
  if (!(await isAvailable(row))) return null;
  const key = row.media[0]?.storageKey;
  if (!key || !STORAGE_KEY_RE.test(key)) return null;
  return getStorage().read(key);
}

/**
 * `publicId` de uma carta publicada antes da 2.0, criado na primeira vez que
 * alguém pede para compartilhar. Idempotente e seguro sob concorrência: a
 * escrita só pega a linha enquanto `publicId` ainda é nulo; quem perde a
 * corrida relê e devolve o valor do vencedor. Quem chama já tem o slug, que
 * abre a carta inteira: o id da prévia não dá a ele nada novo.
 */
export async function ensurePublicIdForSlug(slug: string): Promise<string> {
  const row = await prisma.cart.findUnique({
    where: { slug },
    select: { id: true, status: true, expiresAt: true, publicId: true },
  });
  if (!row || !(await isAvailable(row))) {
    throw new ApiError("not_found", "Cartinha não encontrada.");
  }
  if (row.publicId) return row.publicId;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateSlug();
    try {
      const { count } = await prisma.cart.updateMany({
        where: { id: row.id, publicId: null },
        data: { publicId: candidate },
      });
      if (count === 1) return candidate;
      const current = await prisma.cart.findUnique({ where: { id: row.id }, select: { publicId: true } });
      if (current?.publicId) return current.publicId;
    } catch (err) {
      // Colisão no índice único (≈2^-130): sorteia de novo.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw new ApiError("server", "Não foi possível gerar o link de compartilhamento.");
}

import type { Cart, CartMedia, SelectedMusic } from "@/lib/types";
import { youTubeWatchUrl } from "@/lib/youtube";

/**
 * Converte a linha do banco (campos de música achatados, datas Date) no
 * objeto de domínio `Cart` usado pela UI. O resultado NÃO contém editTokenHash,
 * pedido, nem dados do comprador — serve como DTO público seguro.
 */

export interface DbMediaRow {
  id: string;
  cartId: string;
  type: string;
  url: string;
  storageKey: string;
  position: number;
  createdAt: Date;
}

export interface DbCartRow {
  id: string;
  slug: string | null;
  status: string;
  recipientType: string | null;
  recipientName: string;
  occasion: string | null;
  title: string;
  message: string;
  senderName: string;
  signature: string;
  theme: string;
  musicVideoId: string | null;
  musicUrl: string | null;
  musicTitle: string | null;
  musicChannelTitle: string | null;
  musicThumbnailUrl: string | null;
  musicSource: string | null;
  relationshipStartDate: Date | null;
  showRelationshipCounter: boolean;
  planType: string | null;
  expiresAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  media: DbMediaRow[];
}

function toMusic(row: DbCartRow): SelectedMusic | null {
  if (!row.musicVideoId) return null;
  return {
    videoId: row.musicVideoId,
    youtubeUrl: row.musicUrl ?? youTubeWatchUrl(row.musicVideoId),
    title: row.musicTitle ?? undefined,
    channelTitle: row.musicChannelTitle ?? undefined,
    thumbnailUrl: row.musicThumbnailUrl ?? undefined,
    source: row.musicSource === "SEARCH" ? "search" : "manual",
  };
}

export function dbToDomainCart(row: DbCartRow): Cart {
  const media: CartMedia[] = [...row.media]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      id: m.id,
      cartId: m.cartId,
      type: "photo",
      url: m.url,
      storageKey: m.storageKey,
      position: m.position,
      createdAt: m.createdAt.toISOString(),
    }));

  return {
    id: row.id,
    slug: row.slug,
    status: row.status as Cart["status"],
    recipientType: (row.recipientType as Cart["recipientType"]) ?? null,
    recipientName: row.recipientName,
    occasion: row.occasion,
    title: row.title,
    message: row.message,
    senderName: row.senderName,
    signature: row.signature,
    theme: row.theme as Cart["theme"],
    music: toMusic(row),
    relationshipStartDate: row.relationshipStartDate?.toISOString() ?? null,
    showRelationshipCounter: row.showRelationshipCounter,
    planType: (row.planType as Cart["planType"]) ?? null,
    media,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

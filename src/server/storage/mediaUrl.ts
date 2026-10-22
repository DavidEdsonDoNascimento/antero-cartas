import { getStorage } from "./index";
import { STORAGE_KEY_RE } from "./StorageProvider";

/**
 * De onde vem a URL pública de uma foto (`CartMedia`) — `MEDIA_URL_STRATEGY`.
 *
 * - `stored` (padrão): usa `CartMedia.url` exatamente como foi gravada no
 *   upload. É o comportamento de sempre e o que a produção atual (Vercel +
 *   Supabase Storage) continua usando até o cutover.
 * - `storage_key`: deriva a URL de `CartMedia.storageKey` pelo
 *   `StorageProvider` ativo. Depois da migração, as fotos copiadas do bucket
 *   para o volume passam a abrir em `/api/media/<chave>` sem nenhum UPDATE em
 *   massa na coluna `url` — e uma troca futura de storage também não exige.
 *
 * Qualquer chave fora do padrão `carts/{id}/{uuid}.{ext}` (registros legados de
 * teste) ou falha do provider cai para a URL gravada: uma foto ruim nunca
 * derruba a renderização da cartinha inteira.
 */
export type MediaUrlStrategy = "stored" | "storage_key";

export function getMediaUrlStrategy(): MediaUrlStrategy {
  return (process.env.MEDIA_URL_STRATEGY ?? "").trim().toLowerCase() === "storage_key"
    ? "storage_key"
    : "stored";
}

export function resolveMediaUrl(media: { url: string; storageKey: string }): string {
  if (getMediaUrlStrategy() === "stored") return media.url;
  if (!STORAGE_KEY_RE.test(media.storageKey)) return media.url;
  try {
    return getStorage().getPublicUrl(media.storageKey);
  } catch {
    return media.url;
  }
}

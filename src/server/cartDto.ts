import { dbToDomainCart, type DbCartRow } from "@/lib/cartMapping";
import { resolveMediaUrl } from "@/server/storage/mediaUrl";
import type { Cart } from "@/lib/types";

/**
 * Único ponto do servidor que converte a linha do banco no DTO `Cart`,
 * aplicando a estratégia de URL das fotos (`MEDIA_URL_STRATEGY`). Com o padrão
 * (`stored`), o resultado é idêntico a `dbToDomainCart(row)`.
 */
export function toDomainCart(row: DbCartRow): Cart {
  return dbToDomainCart(row, { resolveMediaUrl });
}

import { ensurePublicIdForSlug } from "@/server/publicPreviewService";
import { jsonError, jsonOk, ApiError } from "@/server/errors";
import { createInMemoryRateLimiter, clientKey } from "@/lib/rateLimit";
import { assertNotInMaintenance } from "@/server/maintenance";
import { buildPublicGiftUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

/**
 * Link da prévia pública de uma carta publicada ANTES da 2.0 (as novas já
 * nascem com ele, na publicação). Chamado pela folha "Compartilhar que ganhei"
 * de `/c/{slug}` quando a carta ainda não tem `publicId`.
 *
 * POST, e não GET: cria o identificador. Robôs de prévia e pré-carregamento
 * fazem GET e não podem disparar escrita. Idempotente: chamar de novo devolve o
 * mesmo link. Quem chama já tem o slug (que abre a carta inteira), então não há
 * nada novo a proteger além do abuso, contido pelo limite de taxa.
 */
const limiter = createInMemoryRateLimiter(20, 60_000);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    assertNotInMaintenance();
    if (!limiter.check(clientKey(req)).allowed) {
      throw new ApiError("rate_limited", "Muitos pedidos em pouco tempo. Aguarde um instante.");
    }
    const { slug } = await params;
    if (!/^[a-km-np-z2-9]{20,40}$/.test(slug)) {
      throw new ApiError("not_found", "Cartinha não encontrada.");
    }
    const publicId = await ensurePublicIdForSlug(slug);
    return jsonOk({ url: buildPublicGiftUrl(publicId) });
  } catch (err) {
    return jsonError(err);
  }
}

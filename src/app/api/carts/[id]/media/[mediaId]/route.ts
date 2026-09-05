import { removeMedia, updateMediaFraming } from "@/server/cartService";
import { mediaFramingSchema } from "@/server/schemas";
import { jsonError, jsonOk, ApiError } from "@/server/errors";
import { readEditToken } from "@/server/editTokenHeader";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
): Promise<Response> {
  try {
    const { id, mediaId } = await params;
    const cart = await removeMedia(id, readEditToken(req), mediaId);
    return jsonOk({ cart });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Ajuste de enquadramento da foto (ponto focal + zoom). Só metadados: o
 * arquivo enviado permanece intacto. Mesma autorização do resto da edição do
 * rascunho — o token de edição no cabeçalho, conferido em `updateMediaFraming`.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
): Promise<Response> {
  try {
    const { id, mediaId } = await params;
    const raw = await req.json().catch(() => {
      throw new ApiError("invalid", "Corpo da requisição inválido.");
    });
    const parsed = mediaFramingSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError("invalid", "Enquadramento inválido.");

    const cart = await updateMediaFraming(id, readEditToken(req), mediaId, parsed.data.framing);
    return jsonOk({ cart });
  } catch (err) {
    return jsonError(err);
  }
}

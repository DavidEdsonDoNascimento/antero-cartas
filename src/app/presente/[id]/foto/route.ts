import { readPublicPhoto } from "@/server/publicPreviewService";
import { sanitizePublicPhoto } from "@/server/publicPhoto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Primeira foto da prévia pública. Não usa `/api/media`: aquela URL contém a
 * chave de storage (`carts/{cartId}/…`) e fica em cache por um ano, mesmo
 * depois de a carta expirar. Aqui:
 * - o identificador é validado e a carta precisa estar publicada, válida e sem
 *   estorno (mesma regra da página);
 * - só a primeira foto, e só de carta criada com o aviso de prévia;
 * - a imagem é recodificada sem metadados (EXIF/GPS);
 * - cache curto e privado, `noindex` e `nosniff`; 404 uniforme em qualquer falha.
 */
const NOT_FOUND = () =>
  new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const file = await readPublicPhoto(id).catch(() => null);
  if (!file) return NOT_FOUND();

  let body: Buffer;
  try {
    body = await sanitizePublicPhoto(file.body);
  } catch {
    return NOT_FOUND();
  }

  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(body.byteLength),
      "cache-control": "private, max-age=600",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      "content-disposition": "inline",
    },
  });
}

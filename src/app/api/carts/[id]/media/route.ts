import { addMedia } from "@/server/cartService";
import { jsonError, jsonOk, ApiError } from "@/server/errors";
import { readEditToken } from "@/server/editTokenHeader";

export const dynamic = "force-dynamic";

/**
 * Upload de foto via multipart/form-data, passando pelo servidor Next.
 * Justificativa (Fase 2): sem infraestrutura S3 configurada neste ambiente;
 * mantém o produto 100% executável localmente. Limitações: tamanho de payload
 * e tempo de execução da rota ficam sujeitos ao runtime do Next/hospedagem —
 * ver docs/0004 (Decisions) para a troca futura por URL assinada em produção.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const token = readEditToken(req);

    const form = await req.formData().catch(() => {
      throw new ApiError("invalid", "Envie a foto como multipart/form-data.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError("invalid", "Campo 'file' ausente.");
    }
    const widthField = form.get("width");
    const heightField = form.get("height");

    const body = Buffer.from(await file.arrayBuffer());
    const cart = await addMedia(id, token, {
      body,
      declaredType: file.type,
      width: widthField ? Number(widthField) : undefined,
      height: heightField ? Number(heightField) : undefined,
    });
    return jsonOk({ cart }, 201);
  } catch (err) {
    return jsonError(err);
  }
}

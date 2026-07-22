import { reorderMedia } from "@/server/cartService";
import { reorderSchema } from "@/server/schemas";
import { jsonError, jsonOk, ApiError } from "@/server/errors";
import { readEditToken } from "@/server/editTokenHeader";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const raw = await req.json().catch(() => {
      throw new ApiError("invalid", "Corpo da requisição inválido.");
    });
    const parsed = reorderSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError("invalid", "Ordem inválida.");

    const cart = await reorderMedia(id, readEditToken(req), parsed.data.order);
    return jsonOk({ cart });
  } catch (err) {
    return jsonError(err);
  }
}

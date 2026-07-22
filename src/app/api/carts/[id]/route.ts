import { getCartForEdit, updateDraft } from "@/server/cartService";
import { draftUpdateSchema } from "@/server/schemas";
import { jsonError, jsonOk, ApiError } from "@/server/errors";
import { readEditToken } from "@/server/editTokenHeader";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const cart = await getCartForEdit(id, readEditToken(req));
    return jsonOk({ cart });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const raw = await req.json().catch(() => {
      throw new ApiError("invalid", "Corpo da requisição inválido.");
    });
    const parsed = draftUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError("invalid", "Dados inválidos: " + parsed.error.issues[0]?.message);
    }
    const cart = await updateDraft(id, readEditToken(req), parsed.data);
    return jsonOk({ cart });
  } catch (err) {
    return jsonError(err);
  }
}

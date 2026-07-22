import { createDraft } from "@/server/cartService";
import { draftUpdateSchema } from "@/server/schemas";
import { jsonError, jsonOk } from "@/server/errors";

export const dynamic = "force-dynamic";

/** Cria um novo rascunho (sem login) e devolve o cartId + editToken. */
export async function POST(req: Request): Promise<Response> {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = draftUpdateSchema.safeParse(raw ?? {});
    const initial = parsed.success ? parsed.data : undefined;

    const { cart, editToken } = await createDraft(initial);
    return jsonOk({ cart, editToken }, 201);
  } catch (err) {
    return jsonError(err);
  }
}

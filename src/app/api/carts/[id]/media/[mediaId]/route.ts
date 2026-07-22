import { removeMedia } from "@/server/cartService";
import { jsonError, jsonOk } from "@/server/errors";
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

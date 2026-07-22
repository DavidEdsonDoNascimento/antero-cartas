import { getStorage } from "@/server/storage";
import { STORAGE_KEY_RE } from "@/server/storage/StorageProvider";

export const dynamic = "force-dynamic";

/**
 * Serve os arquivos do StorageProvider local (dev). Em produção com S3/R2,
 * as fotos são servidas diretamente pelo storage e esta rota deixa de ser
 * necessária — getPublicUrl() já aponta para lá nesse caso.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const key = path.join("/");

  if (!STORAGE_KEY_RE.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  const file = await getStorage().read(key);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: {
      "content-type": file.contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

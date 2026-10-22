import { getStorage } from "@/server/storage";
import { STORAGE_KEY_RE } from "@/server/storage/StorageProvider";

export const dynamic = "force-dynamic";

/**
 * Serve os arquivos do StorageProvider local: em desenvolvimento e, com
 * volume persistente, na hospedagem em contêiner (docs/0011). Com o Supabase
 * Storage (produção atual), getPublicUrl() aponta direto para o bucket e esta
 * rota não é usada.
 *
 * Segurança: só chaves `carts/{id}/{uuid}.{jpg|png|webp}` (STORAGE_KEY_RE) e
 * o provider ainda confere que o caminho resolvido fica dentro do diretório
 * base. Mesmo modelo do bucket público: quem conhece a URL (UUID de 122 bits)
 * vê a foto; não há listagem.
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
      "content-length": String(file.body.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

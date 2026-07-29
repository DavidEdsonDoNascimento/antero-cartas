/**
 * Verificação pontual do QR Code contra o domínio de produção.
 *
 * Roda o **mesmo caminho de código** usado na publicação de uma carta
 * (`buildPublicCartUrl` + `generateQrDataUrl`) com a `NEXT_PUBLIC_SITE_URL`
 * que está configurada em produção, e imprime a URL gerada. Serve para
 * confirmar, sem publicar nada e sem tocar no banco remoto, que o QR Code
 * passou a apontar para o domínio definitivo depois da troca da variável.
 *
 * Uso:
 *   NEXT_PUBLIC_SITE_URL=https://cartas.anterosistemas.com.br \
 *     npx tsx scripts/checkQrDomain.ts <slug>
 *
 * A decodificação do PNG é feita por um script separado no diretório
 * temporário — este arquivo só produz a data URL.
 */

import { buildPublicCartUrl } from "../src/lib/publicUrl";
import { generateQrDataUrl } from "../src/server/qrcode";

async function main(): Promise<void> {
  const slug = process.argv[2] ?? "seed-demonstracao";
  const url = buildPublicCartUrl(slug);
  const dataUrl = await generateQrDataUrl(url);

  if (!dataUrl) {
    console.error("Falha ao gerar o QR Code.");
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ slug, url, dataUrl }));
}

void main();

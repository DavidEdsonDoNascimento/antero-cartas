import sharp from "sharp";

/**
 * Foto da prévia pública, recodificada: a imagem sai sempre como JPEG novo,
 * gerado a partir dos pixels, e por isso SEM nenhum metadado do arquivo
 * enviado (EXIF, GPS, XMP, IPTC, perfil com nome do aparelho, miniatura
 * embutida). O `sharp` só copia metadados com `keepMetadata`/`withMetadata`,
 * que nunca usamos aqui.
 *
 * Por que recodificar em vez de servir o arquivo: o cliente normalmente já
 * reencoda a foto no navegador (o que descarta o EXIF), mas quando a
 * compressão falha ele envia o ORIGINAL (`lib/image.ts`), com o que a câmera
 * gravou. Na carta privada isso já era assim; na prévia, a foto é pública.
 *
 * Limites: a entrada já passou por `addMedia` (tamanho máximo e tipo real
 * conferido pelos bytes). Aqui ainda limitamos os pixels decodificados (contra
 * imagem que expande na memória) e o tamanho de saída.
 */
export const PUBLIC_PHOTO_MAX_SIDE = 1200;
const MAX_INPUT_PIXELS = 40_000_000;

export async function sanitizePublicPhoto(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
    .rotate() // aplica a orientação do EXIF antes de descartá-lo
    .resize({
      width: PUBLIC_PHOTO_MAX_SIDE,
      height: PUBLIC_PHOTO_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" }) // PNG/WebP com transparência
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

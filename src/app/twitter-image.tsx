/**
 * O card do X/Twitter usa exatamente a mesma arte do Open Graph. Reexportar
 * evita duas imagens divergentes: quem editar `opengraph-image.tsx` já
 * atualiza os dois canais.
 */
export { alt, size, contentType, default } from "./opengraph-image";

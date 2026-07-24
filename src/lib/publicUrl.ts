import { site } from "@/config/site";

/**
 * Monta a URL pública de uma carta a partir do slug. Única responsável por
 * essa montagem (usada pelo QR Code, e-mail e compartilhamento) — nunca
 * recebe token de edição, dados do comprador ou qualquer outro dado que não
 * o slug (que já não carrega informação pessoal).
 */
export function buildPublicCartUrl(slug: string): string {
  return `${site.url.replace(/\/+$/, "")}/c/${slug}`;
}

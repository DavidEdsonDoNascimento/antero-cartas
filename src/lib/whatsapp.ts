/**
 * Link de compartilhamento por WhatsApp com mensagem pré-preenchida.
 * Fase 1 usa apenas wa.me (sem Cloud API).
 */

export function whatsappShareUrl(text: string, phone?: string): string {
  const encoded = encodeURIComponent(text);
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    return `https://wa.me/${digits}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

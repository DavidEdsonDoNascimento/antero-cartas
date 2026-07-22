import QRCode from "qrcode";

/**
 * Gera um QR Code (PNG data URL) contendo APENAS a URL pública da carta.
 * Não bloqueia a publicação: em caso de falha, retorna null e a UI segue.
 */
export async function generateQrDataUrl(url: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

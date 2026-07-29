/**
 * Validação de assinatura do webhook do Mercado Pago (task 013, seção 9).
 * Módulo puro — sem SDK, sem rede — implementando o algoritmo documentado:
 *
 *   manifest = "id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;"
 *   esperado = HMAC-SHA256(manifest, segredo do webhook), em hex
 *   válido se esperado === v1 (comparação em tempo constante)
 *
 * `ts` e `v1` vêm do cabeçalho `x-signature`, no formato `ts=...,v1=...`.
 * Confirmado contra a documentação e exemplos oficiais do Mercado Pago
 * (várias fontes independentes concordam no mesmo formato de manifest).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface MercadoPagoSignatureInput {
  xSignature: string | null | undefined;
  xRequestId: string | null | undefined;
  dataId: string | null | undefined;
  secret: string | null | undefined;
}

function parseSignatureHeader(header: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const pair of header.split(",")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    parts.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  return parts;
}

/**
 * Sem segredo configurado, sempre inválido — nunca aceitar webhook "porque a
 * variável não estava definida". Fail-closed de propósito.
 */
export function verifyMercadoPagoSignature(input: MercadoPagoSignatureInput): boolean {
  if (!input.xSignature || !input.xRequestId || !input.dataId || !input.secret) {
    return false;
  }

  const parts = parseSignatureHeader(input.xSignature);
  const ts = parts.get("ts");
  const v1 = parts.get("v1");
  if (!ts || !v1) return false;

  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.xRequestId};ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(v1, "utf8");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

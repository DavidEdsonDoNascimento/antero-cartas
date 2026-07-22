/**
 * Geração de slug longo, único e difícil de adivinhar para a rota /c/[slug].
 * Usa a Web Crypto API (disponível no browser e no runtime Node do servidor).
 *
 * Alfabeto de 33 símbolos (sem caracteres ambíguos: 0/O, 1/l/I).
 * log2(33) ≈ 5.04 bits/caractere → 26 caracteres ≈ 131 bits de entropia,
 * acima do mínimo de 128 bits exigido para o slug público da carta.
 */

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const BITS_PER_CHAR = Math.log2(ALPHABET.length);

/** Comprimento mínimo para garantir >= 128 bits de entropia. */
export const SLUG_MIN_LENGTH_128_BITS = Math.ceil(128 / BITS_PER_CHAR); // 26

export function generateSlug(length = SLUG_MIN_LENGTH_128_BITS): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function generateId(prefix = "id"): string {
  return `${prefix}_${generateSlug(16)}`;
}

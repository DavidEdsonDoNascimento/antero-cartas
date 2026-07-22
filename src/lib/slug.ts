/**
 * Geração de slug longo, único e difícil de adivinhar para a rota /c/[slug].
 * Usa a Web Crypto API (disponível no browser e no runtime do Next).
 */

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // sem caracteres ambíguos

export function generateSlug(length = 22): string {
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

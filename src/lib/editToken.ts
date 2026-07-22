import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Token de edição do rascunho (sem login).
 * - Token aleatório de 256 bits fica só no navegador do comprador.
 * - O banco guarda apenas o hash SHA-256 (nunca o token nem é exposto).
 * - A comparação usa timingSafeEqual para evitar timing attacks.
 */

export function generateEditToken(): string {
  return randomBytes(32).toString("base64url"); // 256 bits
}

export function hashEditToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyEditToken(token: string, hash: string): boolean {
  if (!token || !hash) return false;
  const a = Buffer.from(hashEditToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

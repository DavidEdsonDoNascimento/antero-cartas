import { describe, it, expect } from "vitest";
import { generateEditToken, hashEditToken, verifyEditToken } from "@/lib/editToken";

describe("generateEditToken", () => {
  it("gera tokens únicos e longos o suficiente (>= 256 bits)", () => {
    const a = generateEditToken();
    const b = generateEditToken();
    expect(a).not.toBe(b);
    // base64url de 32 bytes tem 43 caracteres (sem padding).
    expect(a.length).toBeGreaterThanOrEqual(42);
  });
});

describe("hashEditToken / verifyEditToken", () => {
  it("hash é determinístico e não é o token em si", () => {
    const token = generateEditToken();
    const hash1 = hashEditToken(token);
    const hash2 = hashEditToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(token);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("verifica corretamente token válido e rejeita inválido", () => {
    const token = generateEditToken();
    const hash = hashEditToken(token);
    expect(verifyEditToken(token, hash)).toBe(true);
    expect(verifyEditToken("token-errado", hash)).toBe(false);
    expect(verifyEditToken(generateEditToken(), hash)).toBe(false);
  });

  it("rejeita entradas vazias sem lançar erro", () => {
    expect(verifyEditToken("", "abc")).toBe(false);
    expect(verifyEditToken("abc", "")).toBe(false);
  });
});

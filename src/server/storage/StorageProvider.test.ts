import { describe, it, expect } from "vitest";
import { STORAGE_KEY_RE } from "./StorageProvider";

describe("STORAGE_KEY_RE", () => {
  it("aceita chaves no formato carts/{id}/{uuid}.{ext}", () => {
    expect(STORAGE_KEY_RE.test("carts/cart_abc123/photo-uuid.jpg")).toBe(true);
    expect(STORAGE_KEY_RE.test("carts/cart_abc123/photo-uuid.png")).toBe(true);
    expect(STORAGE_KEY_RE.test("carts/cart_abc123/photo-uuid.webp")).toBe(true);
  });

  it("rejeita path traversal e caminhos arbitrários", () => {
    expect(STORAGE_KEY_RE.test("../../etc/passwd")).toBe(false);
    expect(STORAGE_KEY_RE.test("carts/../../../etc/passwd.jpg")).toBe(false);
    expect(STORAGE_KEY_RE.test("carts/cart_1/../../secret.jpg")).toBe(false);
    expect(STORAGE_KEY_RE.test("/etc/passwd")).toBe(false);
  });

  it("rejeita extensões não permitidas", () => {
    expect(STORAGE_KEY_RE.test("carts/cart_1/file.svg")).toBe(false);
    expect(STORAGE_KEY_RE.test("carts/cart_1/file.html")).toBe(false);
    expect(STORAGE_KEY_RE.test("carts/cart_1/file.exe")).toBe(false);
    expect(STORAGE_KEY_RE.test("carts/cart_1/file")).toBe(false);
  });

  it("rejeita chaves fora do prefixo carts/", () => {
    expect(STORAGE_KEY_RE.test("other/cart_1/file.jpg")).toBe(false);
  });
});

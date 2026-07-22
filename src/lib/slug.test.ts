import { describe, it, expect } from "vitest";
import { generateSlug, generateId, SLUG_MIN_LENGTH_128_BITS } from "@/lib/slug";

describe("generateSlug", () => {
  it("usa comprimento padrão com >= 128 bits de entropia", () => {
    const alphabetSize = 33;
    const bits = SLUG_MIN_LENGTH_128_BITS * Math.log2(alphabetSize);
    expect(bits).toBeGreaterThanOrEqual(128);
  });

  it("gera apenas caracteres do alfabeto seguro (sem 0/O/1/l/I)", () => {
    const slug = generateSlug(200);
    expect(slug).toMatch(/^[a-km-z2-9]+$/);
    expect(slug).not.toMatch(/[01lIO]/);
  });

  it("gera valores diferentes a cada chamada", () => {
    const values = new Set(Array.from({ length: 50 }, () => generateSlug()));
    expect(values.size).toBe(50);
  });

  it("respeita o comprimento solicitado", () => {
    expect(generateSlug(10)).toHaveLength(10);
    expect(generateSlug(40)).toHaveLength(40);
  });
});

describe("generateId", () => {
  it("usa o prefixo informado", () => {
    expect(generateId("cart")).toMatch(/^cart_[a-km-z2-9]{16}$/);
    expect(generateId("media")).toMatch(/^media_[a-km-z2-9]{16}$/);
  });
});

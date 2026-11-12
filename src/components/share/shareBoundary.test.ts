/**
 * Fronteira da prévia pública (/presente/): o código dela não pode alcançar
 * nada que receba a carta inteira. Teste estrutural, no espírito de
 * `publicCardCtaWiring.test.ts`: um import novo aqui é uma decisão de privacidade.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

const PUBLIC_SURFACE = [
  ...files(path.join(ROOT, "src/app/presente")),
  path.join(ROOT, "src/components/share/PublicGiftView.tsx"),
  path.join(ROOT, "src/components/share/GiftPeek.tsx"),
];

const FORBIDDEN = [
  "@/components/letter/LetterSheet",
  "@/components/card/CardPreview",
  "@/components/card/CardExperience",
  "@/components/card/PhotoCarousel",
  "@/components/presentation/RecipientExperience",
  "@/components/create/CreateCta",
  "@/server/cartDto",
  "@/lib/cartMapping",
  "getPublicCart",
  "getCartForEdit",
  "/api/media",
  "/c/",
];

describe("prévia pública não importa nada que conheça a carta inteira", () => {
  it("tem arquivos para conferir", () => {
    expect(PUBLIC_SURFACE.length).toBeGreaterThanOrEqual(5);
  });

  it.each(PUBLIC_SURFACE.map((f) => [path.relative(ROOT, f), f]))("%s", (_rel, file) => {
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const marker of FORBIDDEN) expect(source, marker).not.toContain(marker);
  });

  it("o serviço público seleciona campos explícitos (nunca a linha inteira)", () => {
    const source = readFileSync(path.join(ROOT, "src/server/publicPreviewService.ts"), "utf8");
    expect(source).not.toMatch(/include:/);
    expect(source).not.toMatch(/senderName|signature|title:|musicTitle|storageKey: true[\s\S]*storageKey: true/);
  });
});

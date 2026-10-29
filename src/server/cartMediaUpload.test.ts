/**
 * Upload idempotente (`uploadId`): o "Tentar de novo" depois de uma resposta
 * perdida não pode duplicar a foto.
 *
 * Banco falso em memória, como em `cartMediaFraming.test.ts`: o que está sob
 * teste é a regra do serviço, não o Prisma.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { hashEditToken } from "@/lib/editToken";
import { STORAGE_KEY_RE } from "@/server/storage/StorageProvider";

interface MediaRow {
  id: string;
  cartId: string;
  type: string;
  url: string;
  storageKey: string;
  position: number;
  focalX: number | null;
  focalY: number | null;
  zoom: number | null;
  createdAt: Date;
}

const db = vi.hoisted(() => ({ media: [] as unknown[], carts: new Map<string, unknown>() }));

const prismaMock = vi.hoisted(() => ({
  cart: { findUnique: vi.fn() },
  cartMedia: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
}));
const storageMock = vi.hoisted(() => ({ put: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/server/storage", () => ({ getStorage: () => storageMock }));

const TOKEN = "token-de-edicao-valido";
const UPLOAD_ID = "0b6f2c1e-8a4d-4c3b-9e2f-1a2b3c4d5e6f";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

function cartRow(id: string): Record<string, unknown> {
  const now = new Date();
  return {
    id,
    editTokenHash: hashEditToken(TOKEN),
    slug: null,
    status: "DRAFT",
    recipientType: null,
    recipientName: "",
    occasion: null,
    title: "",
    message: "",
    senderName: "",
    signature: "",
    theme: "romantico",
    musicVideoId: null,
    musicUrl: null,
    musicTitle: null,
    musicChannelTitle: null,
    musicThumbnailUrl: null,
    musicSource: null,
    relationshipStartDate: null,
    showRelationshipCounter: false,
    planType: null,
    expiresAt: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

let cartService: typeof import("@/server/cartService");

beforeAll(async () => {
  cartService = await import("@/server/cartService");
});

beforeEach(() => {
  vi.clearAllMocks();
  db.media = [];
  db.carts = new Map([["cart_1", cartRow("cart_1")]]);
  const rows = () => db.media as MediaRow[];

  prismaMock.cart.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const row = db.carts.get(where.id) as Record<string, unknown> | undefined;
    return row ? { ...row, media: rows().filter((m) => m.cartId === where.id) } : null;
  });
  prismaMock.cartMedia.findFirst.mockImplementation(
    async ({ where }: { where: { cartId: string; storageKey: { startsWith: string } } }) =>
      rows().find(
        (m) => m.cartId === where.cartId && m.storageKey.startsWith(where.storageKey.startsWith),
      ) ?? null,
  );
  prismaMock.cartMedia.count.mockImplementation(async () => rows().length);
  prismaMock.cartMedia.create.mockImplementation(async ({ data }: { data: MediaRow }) => {
    const row = { ...data, id: `m${rows().length + 1}`, focalX: null, focalY: null, zoom: null, createdAt: new Date() };
    rows().push(row);
    return row;
  });
  storageMock.put.mockImplementation(async ({ key }: { key: string }) => ({ url: `/api/media/${key}` }));
});

describe("addMedia — uploadId", () => {
  it("reenvio com o mesmo uploadId devolve a foto já gravada, sem duplicar", async () => {
    const first = await cartService.addMedia("cart_1", TOKEN, {
      body: JPEG,
      declaredType: "image/jpeg",
      uploadId: UPLOAD_ID,
    });
    const retry = await cartService.addMedia("cart_1", TOKEN, {
      body: JPEG,
      declaredType: "image/jpeg",
      uploadId: UPLOAD_ID,
    });

    expect(first.media).toHaveLength(1);
    expect(retry.media).toHaveLength(1);
    expect(retry.media[0].id).toBe(first.media[0].id);
    expect(storageMock.put).toHaveBeenCalledTimes(1);
    expect(prismaMock.cartMedia.create).toHaveBeenCalledTimes(1);
  });

  it("chave: uploadId como prefixo + UUID do servidor, ainda no formato servido", async () => {
    const cart = await cartService.addMedia("cart_1", TOKEN, {
      body: JPEG,
      declaredType: "image/jpeg",
      uploadId: UPLOAD_ID,
    });
    const key = cart.media[0].storageKey!;
    expect(key).toMatch(new RegExp(`^carts/cart_1/${UPLOAD_ID}_[0-9a-f-]{36}\\.jpg$`));
    expect(STORAGE_KEY_RE.test(key)).toBe(true);
  });

  it("fotos diferentes (uploadIds diferentes) continuam sendo gravadas", async () => {
    await cartService.addMedia("cart_1", TOKEN, { body: JPEG, declaredType: "image/jpeg", uploadId: UPLOAD_ID });
    const cart = await cartService.addMedia("cart_1", TOKEN, {
      body: JPEG,
      declaredType: "image/jpeg",
      uploadId: "11111111-2222-4333-8444-555555555555",
    });
    expect(cart.media).toHaveLength(2);
  });

  it("sem uploadId: comportamento antigo (chave só com UUID do servidor)", async () => {
    const cart = await cartService.addMedia("cart_1", TOKEN, { body: JPEG, declaredType: "image/jpeg" });
    expect(cart.media[0].storageKey).toMatch(/^carts\/cart_1\/[0-9a-f-]{36}\.jpg$/);
    expect(prismaMock.cartMedia.findFirst).not.toHaveBeenCalled();
  });

  it("recusa uploadId que não é UUID — nunca vira pedaço de caminho", async () => {
    await expect(
      cartService.addMedia("cart_1", TOKEN, {
        body: JPEG,
        declaredType: "image/jpeg",
        uploadId: "../../outra-carta/x",
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(storageMock.put).not.toHaveBeenCalled();
  });

  it("o reenvio continua exigindo token válido", async () => {
    await cartService.addMedia("cart_1", TOKEN, { body: JPEG, declaredType: "image/jpeg", uploadId: UPLOAD_ID });
    await expect(
      cartService.addMedia("cart_1", "token-errado", {
        body: JPEG,
        declaredType: "image/jpeg",
        uploadId: UPLOAD_ID,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});

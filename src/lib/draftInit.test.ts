import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Cart } from "@/lib/types";

const {
  mockLoadSession,
  mockSaveSession,
  mockClearSession,
  mockLoadDraft,
  mockClearDraft,
  mockHasMeaningfulContent,
  mockLoadUnsynced,
  mockCreateDraft,
  mockFetchCart,
} = vi.hoisted(() => ({
  mockLoadSession: vi.fn(),
  mockSaveSession: vi.fn(),
  mockClearSession: vi.fn(),
  mockLoadDraft: vi.fn(),
  mockClearDraft: vi.fn(),
  mockHasMeaningfulContent: vi.fn(),
  mockLoadUnsynced: vi.fn(),
  mockCreateDraft: vi.fn(),
  mockFetchCart: vi.fn(),
}));

vi.mock("@/lib/cartSession", () => ({
  loadSession: mockLoadSession,
  saveSession: mockSaveSession,
  clearSession: mockClearSession,
}));

vi.mock("@/lib/storage", () => ({
  loadDraft: mockLoadDraft,
  clearDraft: mockClearDraft,
  hasMeaningfulContent: mockHasMeaningfulContent,
  loadUnsyncedChanges: mockLoadUnsynced,
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createDraft: mockCreateDraft,
  fetchCart: mockFetchCart,
}));

const {
  resolveCartInit,
  getCartInit,
  prefetchCartInit,
  resetCartInitPrefetch,
  buildPatch,
  withDefaultStyle,
} = await import("./draftInit");
const { ApiClientError, RequestTimeoutError } = await import("@/lib/api");

function makeCart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart_1",
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
    music: null,
    relationshipStartDate: null,
    showRelationshipCounter: false,
    planType: null,
    presentation: null,
    presentationOptions: null,
    publicId: null,
    sharePreviewVersion: null,
    media: [],
    expiresAt: null,
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCartInitPrefetch();
  mockLoadDraft.mockReturnValue(null);
  mockHasMeaningfulContent.mockReturnValue(false);
  mockLoadUnsynced.mockReturnValue(null);
});

describe("resolveCartInit", () => {
  it("continua uma carta realmente abandonada (sessão em DRAFT)", async () => {
    const session = { cartId: "cart_1", editToken: "tok" };
    const cart = makeCart({ status: "DRAFT", recipientType: "esposa" });
    mockLoadSession.mockReturnValue(session);
    mockFetchCart.mockResolvedValue({ cart });

    const outcome = await resolveCartInit();

    expect(outcome).toEqual({ kind: "resume", cart, session });
    expect(mockClearSession).not.toHaveBeenCalled();
    expect(mockClearDraft).not.toHaveBeenCalled();
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("também continua uma sessão em AWAITING_PAYMENT", async () => {
    mockLoadSession.mockReturnValue({ cartId: "cart_1", editToken: "tok" });
    mockFetchCart.mockResolvedValue({ cart: makeCart({ status: "AWAITING_PAYMENT" }) });

    const outcome = await resolveCartInit();

    expect(outcome.kind).toBe("resume");
  });

  it("não recupera uma carta publicada — encerra sessão e cache, cria uma nova vazia", async () => {
    mockLoadSession.mockReturnValue({ cartId: "cart_1", editToken: "tok" });
    mockFetchCart.mockResolvedValue({
      cart: makeCart({ status: "PUBLISHED", recipientType: "esposa", title: "Para minha esposa" }),
    });
    const freshCart = makeCart({ id: "cart_2", recipientType: null, title: "" });
    mockCreateDraft.mockResolvedValue({ cart: freshCart, editToken: "tok2" });

    const outcome = await resolveCartInit();

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockClearDraft).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe("create");
    if (outcome.kind === "create") {
      expect(outcome.cart.recipientType).toBeNull();
      expect(outcome.cart.title).toBe("");
    }
    expect(mockCreateDraft).toHaveBeenCalledWith(withDefaultStyle(undefined));
  });

  it.each([
    ["queda de rede", new TypeError("Failed to fetch")],
    ["prazo esgotado", new RequestTimeoutError()],
    ["erro do servidor", new ApiClientError("server", "Erro interno.", 500)],
    ["manutenção", new ApiClientError("maintenance", "Em manutenção.", 503)],
  ])("%s ao ler o rascunho não encerra a sessão nem cria outra carta", async (_nome, erro) => {
    mockLoadSession.mockReturnValue({ cartId: "cart_1", editToken: "tok" });
    mockFetchCart.mockRejectedValue(erro);

    await expect(resolveCartInit()).rejects.toBe(erro);

    expect(mockClearSession).not.toHaveBeenCalled();
    expect(mockClearDraft).not.toHaveBeenCalled();
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("carta que não existe mais encerra a sessão e começa outra", async () => {
    mockLoadSession.mockReturnValue({ cartId: "cart_1", editToken: "tok" });
    mockFetchCart.mockRejectedValue(new ApiClientError("not_found", "Não encontrado.", 404));
    mockCreateDraft.mockResolvedValue({ cart: makeCart({ id: "cart_2" }), editToken: "tok2" });

    const outcome = await resolveCartInit();

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe("create");
  });

  it("carta inacessível com texto não salvo: leva o texto para uma carta nova", async () => {
    const unsynced = { message: "Não posso perder isto" };
    mockLoadSession.mockReturnValue({ cartId: "cart_1", editToken: "tok" });
    mockFetchCart.mockRejectedValue(new ApiClientError("not_found", "Não encontrado.", 404));
    mockLoadUnsynced.mockReturnValue(unsynced);
    const created = makeCart({ id: "cart_2", message: unsynced.message });
    mockCreateDraft.mockResolvedValue({ cart: created, editToken: "tok2" });

    const outcome = await resolveCartInit();

    expect(mockLoadUnsynced).toHaveBeenCalledWith("cart_1");
    expect(mockCreateDraft).toHaveBeenCalledWith(withDefaultStyle(unsynced));
    expect(mockSaveSession).toHaveBeenCalledWith({ cartId: "cart_2", editToken: "tok2" });
    expect(mockClearDraft).toHaveBeenCalled();
    expect(outcome).toMatchObject({ kind: "create", cart: created, recovered: true });
  });

  it("se a carta nova não puder ser criada, a sessão e o texto ficam para a próxima tentativa", async () => {
    const queda = new TypeError("Failed to fetch");
    mockLoadSession.mockReturnValue({ cartId: "cart_1", editToken: "tok" });
    mockFetchCart.mockRejectedValue(new ApiClientError("not_found", "Não encontrado.", 404));
    mockLoadUnsynced.mockReturnValue({ message: "Não posso perder isto" });
    mockCreateDraft.mockRejectedValue(queda);

    await expect(resolveCartInit()).rejects.toBe(queda);

    expect(mockClearDraft).not.toHaveBeenCalled();
    expect(mockClearSession).not.toHaveBeenCalled();
  });

  it("carta já publicada nunca passa texto guardado para a carta nova", async () => {
    mockLoadSession.mockReturnValue({ cartId: "cart_1", editToken: "tok" });
    mockFetchCart.mockResolvedValue({ cart: makeCart({ status: "PUBLISHED" }) });
    mockLoadUnsynced.mockReturnValue({ message: "Texto da carta publicada" });
    mockCreateDraft.mockResolvedValue({ cart: makeCart({ id: "cart_2" }), editToken: "tok2" });

    await resolveCartInit();

    expect(mockCreateDraft).toHaveBeenCalledWith(withDefaultStyle(undefined));
  });

  it("também descarta a sessão quando o token é inválido (fetchCart falha)", async () => {
    mockLoadSession.mockReturnValue({ cartId: "cart_1", editToken: "bad" });
    mockFetchCart.mockRejectedValue(new ApiClientError("unauthorized", "Token inválido.", 401));
    mockCreateDraft.mockResolvedValue({ cart: makeCart({ id: "cart_2" }), editToken: "tok2" });

    const outcome = await resolveCartInit();

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockClearDraft).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe("create");
  });

  it("inicia uma carta nova vazia quando não há sessão nem rascunho legado", async () => {
    mockLoadSession.mockReturnValue(null);
    const fresh = makeCart({ id: "cart_3" });
    mockCreateDraft.mockResolvedValue({ cart: fresh, editToken: "tok3" });

    const outcome = await resolveCartInit();

    expect(outcome).toEqual({
      kind: "create",
      cart: fresh,
      session: { cartId: fresh.id, editToken: "tok3" },
      legacyMedia: [],
    });
    expect(mockCreateDraft).toHaveBeenCalledWith(withDefaultStyle(undefined));
    expect(mockSaveSession).toHaveBeenCalledWith({ cartId: fresh.id, editToken: "tok3" });
  });

  it("não restaura campos antigos de cache local ao encerrar uma sessão inválida/publicada", async () => {
    // Cenário do bug relatado: a sessão anterior (agora publicada) tinha, por
    // causa do autosave, um espelho em antero:draft com os MESMOS campos
    // (recipientType "esposa"). resolveCartInit precisa limpar esse cache
    // antes de decidir se migra algo — nunca deve usá-lo para a carta nova.
    mockLoadSession.mockReturnValue({ cartId: "cart_1", editToken: "tok" });
    mockFetchCart.mockResolvedValue({
      cart: makeCart({ status: "PUBLISHED", recipientType: "esposa" }),
    });
    mockLoadDraft.mockReturnValue(
      makeCart({ recipientType: "esposa", title: "Para minha esposa" }),
    );
    mockClearDraft.mockImplementation(() => {
      // Simula o efeito real de clearDraft(): a leitura seguinte volta vazia.
      mockLoadDraft.mockReturnValue(null);
    });
    mockCreateDraft.mockResolvedValue({ cart: makeCart({ id: "cart_2" }), editToken: "tok2" });

    const outcome = await resolveCartInit();

    expect(mockClearDraft).toHaveBeenCalled();
    expect(mockCreateDraft).toHaveBeenCalledWith(withDefaultStyle(undefined));
    expect(outcome.kind).toBe("create");
    if (outcome.kind === "create") {
      expect(outcome.legacyMedia).toEqual([]);
    }
  });

  it("migra um rascunho legado genuíno (nunca houve sessão) para o backend", async () => {
    mockLoadSession.mockReturnValue(null);
    const legacy = makeCart({ recipientType: "mae", title: "Feliz dia das mães" });
    mockLoadDraft.mockReturnValue(legacy);
    mockHasMeaningfulContent.mockReturnValue(true);
    const created = makeCart({ id: "cart_legacy", recipientType: "mae", title: "Feliz dia das mães" });
    mockCreateDraft.mockResolvedValue({ cart: created, editToken: "tokL" });

    const outcome = await resolveCartInit();

    expect(mockCreateDraft).toHaveBeenCalledWith(withDefaultStyle(buildPatch(legacy)));
    expect(outcome.kind).toBe("create");
  });
});

describe("prefetch cache (CreateCta)", () => {
  it("getCartInit reaproveita um prefetch em andamento", async () => {
    mockLoadSession.mockReturnValue(null);
    mockCreateDraft.mockResolvedValue({ cart: makeCart(), editToken: "tok" });

    prefetchCartInit();
    prefetchCartInit(); // segunda chamada não deve disparar outra criação
    await getCartInit();

    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
  });

  it("libera o cache após consumido — a próxima visita resolve de novo", async () => {
    mockLoadSession.mockReturnValue(null);
    mockCreateDraft.mockResolvedValue({ cart: makeCart(), editToken: "tok" });

    await getCartInit();
    await getCartInit();

    expect(mockCreateDraft).toHaveBeenCalledTimes(2);
  });
});

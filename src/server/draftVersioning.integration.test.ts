/**
 * Proteção de versão do rascunho, contra banco real (opt-in, ver
 * phase2.integration.test.ts). Só a escrita condicional dentro do PostgreSQL
 * garante que um envio atrasado não sobrescreve um texto mais novo.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!RUN)("versão do rascunho no servidor", { timeout: 60_000 }, () => {
  let prisma: typeof import("@/lib/db").prisma;
  let cartService: typeof import("@/server/cartService");
  const ids: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    cartService = await import("@/server/cartService");
  });

  afterAll(async () => {
    await prisma.cart.deleteMany({ where: { id: { in: ids } } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function draft() {
    const created = await cartService.createDraft();
    ids.push(created.cart.id);
    return created;
  }

  it("grava quando a versão confere e devolve a versão nova", async () => {
    const { cart, editToken } = await draft();
    const saved = await cartService.updateDraft(cart.id, editToken, {
      message: "novo",
      clientUpdatedAt: cart.updatedAt,
    });
    expect(saved.message).toBe("novo");
    expect(saved.updatedAt).not.toBe(cart.updatedAt);
  });

  it("envio atrasado, baseado em versão passada, não sobrescreve o texto novo", async () => {
    const { cart, editToken } = await draft();
    await cartService.updateDraft(cart.id, editToken, {
      message: "mais novo",
      clientUpdatedAt: cart.updatedAt,
    });

    await expect(
      cartService.updateDraft(cart.id, editToken, {
        message: "atrasado",
        clientUpdatedAt: cart.updatedAt,
      }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });

    expect((await cartService.getCartForEdit(cart.id, editToken)).message).toBe("mais novo");
  });

  it("de dois envios simultâneos sobre a mesma versão, só um grava", async () => {
    const { cart, editToken } = await draft();
    const results = await Promise.allSettled(
      ["a", "b"].map((message) =>
        cartService.updateDraft(cart.id, editToken, { message, clientUpdatedAt: cart.updatedAt }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("sob concorrência alta, cada versão aceita exatamente uma escrita", async () => {
    const { cart, editToken } = await draft();
    let base = cart.updatedAt;
    for (let round = 0; round < 5; round++) {
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          cartService.updateDraft(cart.id, editToken, {
            message: `rodada ${round} envio ${i}`,
            clientUpdatedAt: base,
          }),
        ),
      );
      const winners = results.filter((r) => r.status === "fulfilled");
      expect(winners).toHaveLength(1);
      expect(
        results.filter((r) => r.status === "rejected").every(
          (r) => (r as PromiseRejectedResult).reason.code === "conflict",
        ),
      ).toBe(true);

      const saved = (winners[0] as PromiseFulfilledResult<{ message: string; updatedAt: string }>).value;
      const stored = await cartService.getCartForEdit(cart.id, editToken);
      expect(stored.message).toBe(saved.message);
      base = stored.updatedAt;
    }
  });

  it("relógio igual ou atrasado em outra instância não faz uma versão se repetir", async () => {
    const { cart, editToken } = await draft();

    // Esta instância grava com o relógio parado exatamente na versão atual: é o
    // que acontece com duas escritas no mesmo milissegundo ou relógios divergentes.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(cart.updatedAt) });
    const saved = await cartService.updateDraft(cart.id, editToken, {
      message: "gravado primeiro",
      clientUpdatedAt: cart.updatedAt,
    });
    expect(saved.updatedAt).not.toBe(cart.updatedAt);

    await expect(
      cartService.updateDraft(cart.id, editToken, {
        message: "envio atrasado",
        clientUpdatedAt: cart.updatedAt,
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    // Relógio ATRÁS da versão: a próxima versão ainda precisa andar para a frente.
    vi.setSystemTime(new Date(new Date(cart.updatedAt).getTime() - 60_000));
    const later = await cartService.updateDraft(cart.id, editToken, {
      message: "relógio atrasado",
      clientUpdatedAt: saved.updatedAt,
    });
    expect(new Date(later.updatedAt).getTime()).toBeGreaterThan(new Date(saved.updatedAt).getTime());
    vi.useRealTimers();

    expect((await cartService.getCartForEdit(cart.id, editToken)).message).toBe("relógio atrasado");
  });

  it("devolve a versão que gravou, não a de uma escrita que veio logo depois", async () => {
    const { cart, editToken } = await draft();
    const realUpdateMany = prisma.cart.updateMany.bind(prisma.cart);
    const spy = vi.spyOn(prisma.cart, "updateMany").mockImplementationOnce((async (
      args: Parameters<typeof realUpdateMany>[0],
    ) => {
      const result = await realUpdateMany(args);
      // Outra instância grava entre o UPDATE desta requisição e a resposta dela.
      await prisma.cart.update({ where: { id: cart.id }, data: { message: "da outra instância" } });
      return result;
    }) as unknown as typeof prisma.cart.updateMany);

    const saved = await cartService.updateDraft(cart.id, editToken, {
      message: "desta instância",
      clientUpdatedAt: cart.updatedAt,
    });
    spy.mockRestore();

    // O próximo envio desta aba precisa descobrir a escrita alheia, não ignorá-la.
    await expect(
      cartService.updateDraft(cart.id, editToken, {
        message: "próximo envio",
        clientUpdatedAt: saved.updatedAt,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await cartService.getCartForEdit(cart.id, editToken)).message).toBe("da outra instância");
  });

  it("foto não muda a versão: enquadrar ou reordenar não gera conflito com o texto", async () => {
    const { cart, editToken } = await draft();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
      "base64",
    );
    const withPhoto = await cartService.addMedia(cart.id, editToken, {
      body: png,
      declaredType: "image/png",
    });
    expect(withPhoto.updatedAt).toBe(cart.updatedAt);

    const saved = await cartService.updateDraft(cart.id, editToken, {
      message: "depois da foto",
      clientUpdatedAt: cart.updatedAt,
    });
    expect(saved.message).toBe("depois da foto");
  });

  it("sem versão informada (aba com o site antigo) continua gravando", async () => {
    const { cart, editToken } = await draft();
    await cartService.updateDraft(cart.id, editToken, { message: "um" });
    const saved = await cartService.updateDraft(cart.id, editToken, { message: "dois" });
    expect(saved.message).toBe("dois");
  });

  it("carta que não aceita edição responde forbidden_state, não conflito", async () => {
    const { cart, editToken } = await draft();
    await prisma.cart.update({ where: { id: cart.id }, data: { status: "PUBLISHED" } });
    await expect(
      cartService.updateDraft(cart.id, editToken, {
        message: "tarde",
        clientUpdatedAt: cart.updatedAt,
      }),
    ).rejects.toMatchObject({ code: "forbidden_state" });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClientError, RequestTimeoutError, type CartPatch } from "@/lib/api";
import { canonicalPatch, DraftSync, isTransientSaveError } from "@/lib/draftSync";

const save = vi.fn();
const load = vi.fn();
const journalSave = vi.fn();
const journalClear = vi.fn();

const INITIAL: CartPatch = { message: "antigo", music: null };
const conflict = () => new ApiClientError("conflict", "Mudou.", 409);
const net = () => new TypeError("Failed to fetch");

function make() {
  return new DraftSync({
    initial: INITIAL,
    baseUpdatedAt: "v0",
    save,
    load,
    journalSave,
    journalClear,
    debounceMs: 700,
    retryDelaysMs: [1000, 3000],
    slowRetryMs: 30_000,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  journalSave.mockReturnValue(true);
  let n = 0;
  save.mockImplementation(async () => ({ updatedAt: `v${++n}` }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("canonicalPatch", () => {
  it("ignora a ordem das chaves e os undefined", () => {
    expect(canonicalPatch({ title: "a", message: "b", music: undefined })).toBe(
      canonicalPatch({ message: "b", title: "a" }),
    );
  });

  it("distingue null de ausente e compara música por dentro", () => {
    expect(canonicalPatch({ music: null })).not.toBe(canonicalPatch({}));
    const music = { videoId: "x", youtubeUrl: "u", source: "search" as const };
    expect(canonicalPatch({ music })).toBe(
      canonicalPatch({ music: { source: "search", youtubeUrl: "u", videoId: "x", title: undefined } }),
    );
  });
});

describe("isTransientSaveError", () => {
  it.each([
    [net()],
    [new RequestTimeoutError()],
    [new ApiClientError("rate_limited", "", 429)],
    [new ApiClientError("server", "", 500)],
    [new ApiClientError("maintenance", "", 503)],
    [new ApiClientError("invalid_response", "", 200)],
  ])("%s é transitório", (err) => {
    expect(isTransientSaveError(err)).toBe(true);
  });

  it.each([
    [new ApiClientError("invalid", "", 400)],
    [new ApiClientError("unauthorized", "", 401)],
    [new ApiClientError("not_found", "", 404)],
    [new ApiClientError("forbidden_state", "", 409)],
  ])("%s é definitivo", (err) => {
    expect(isTransientSaveError(err)).toBe(false);
  });
});

describe("versão enviada ao servidor", () => {
  it("cada envio se baseia na versão confirmada pelo anterior", async () => {
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "a" });
    await vi.advanceTimersByTimeAsync(700);
    sync.setDesired({ ...INITIAL, message: "b" });
    await vi.advanceTimersByTimeAsync(700);

    expect(save.mock.calls[0][1]).toBe("v0");
    expect(save.mock.calls[1][1]).toBe("v1");
  });

  it("primeira tentativa que chegou apesar do erro não é regravada", async () => {
    const sent = { ...INITIAL, message: "a" };
    save.mockRejectedValueOnce(new RequestTimeoutError()).mockRejectedValueOnce(conflict());
    load.mockResolvedValue({ patch: sent, updatedAt: "v9", editable: true });
    const sync = make();
    sync.setDesired(sent);

    await vi.advanceTimersByTimeAsync(700 + 1000);

    expect(save).toHaveBeenCalledTimes(2);
    expect(sync.getState().status).toBe("saved");
    expect(journalClear).toHaveBeenCalledWith(sent);

    sync.setDesired({ ...INITIAL, message: "b" });
    await vi.advanceTimersByTimeAsync(700);
    expect(save.mock.calls[2][1]).toBe("v9");
  });

  it("outra versão no servidor: reenvia sobre a versão nova, e vale o que está na tela", async () => {
    save.mockRejectedValueOnce(conflict());
    load.mockResolvedValue({ patch: { message: "da outra aba" }, updatedAt: "v5", editable: true });
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "minha" });

    await vi.advanceTimersByTimeAsync(700);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({ message: "minha" });
    expect(save.mock.calls[1][1]).toBe("v5");
    expect(sync.getState().status).toBe("saved");
  });

  it("conflito com carta que não aceita mais edição vira erro, sem reenviar", async () => {
    save.mockRejectedValueOnce(conflict());
    load.mockResolvedValue({ patch: {}, updatedAt: "v5", editable: false });
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "minha" });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(sync.getState().status).toBe("error");
  });

  it("conflitos sem fim param em erro, em vez de ficar em laço", async () => {
    save.mockRejectedValue(conflict());
    load.mockResolvedValue({ patch: {}, updatedAt: "v5", editable: true });
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "minha" });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(save).toHaveBeenCalledTimes(4);
    expect(sync.getState().status).toBe("error");
  });
});

describe("novas tentativas", () => {
  it("segue o intervalo combinado, cai em erro e continua sem pressa até voltar", async () => {
    save.mockRejectedValue(net());
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "a" });

    await vi.advanceTimersByTimeAsync(700);
    expect(save).toHaveBeenCalledTimes(1);
    expect(sync.getState()).toMatchObject({ status: "saving", retrying: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(3);
    expect(sync.getState()).toMatchObject({ status: "error", retrying: false });

    await vi.advanceTimersByTimeAsync(29_000);
    expect(save).toHaveBeenCalledTimes(3);

    save.mockResolvedValue({ updatedAt: "v1" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(4);
    expect(sync.getState().status).toBe("saved");
  });

  it("flush falha só depois de esgotar as tentativas rápidas", async () => {
    save.mockRejectedValue(net());
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "a" });
    const settled = vi.fn();
    void sync.flush().then(settled);

    await vi.advanceTimersByTimeAsync(3999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith({ ok: false, message: expect.any(String) });
  });

  it("flush confirma o texto escrito enquanto outro envio estava em andamento", async () => {
    let release!: (v: { updatedAt: string }) => void;
    save.mockReturnValueOnce(new Promise((res) => (release = res)));
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "a" });
    await vi.advanceTimersByTimeAsync(700);
    sync.setDesired({ ...INITIAL, message: "b" });

    const settled = vi.fn();
    void sync.flush().then(settled);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();

    release({ updatedAt: "v1" });
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.lastCall?.[0]).toMatchObject({ message: "b" });
    expect(settled).toHaveBeenCalledWith({ ok: true });
  });

  it("retryNow não interrompe um salvamento normal", async () => {
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "a" });
    sync.retryNow();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("saída da tela", () => {
  it("envia o pendente com keepalive e não insiste depois de falhar", async () => {
    save.mockRejectedValue(net());
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "a" });

    sync.close();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][2]).toEqual({ keepalive: true });
    expect(journalClear).not.toHaveBeenCalled(); // o texto fica no aparelho
  });

  it("tela fechada enquanto resolvia um conflito não reenvia com a versão nova", async () => {
    save.mockRejectedValueOnce(conflict());
    let release!: (v: { patch: CartPatch; updatedAt: string; editable: boolean }) => void;
    load.mockReturnValueOnce(new Promise((res) => (release = res)));
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "tela antiga" });
    await vi.advanceTimersByTimeAsync(700);

    sync.close();
    // A tela nova pode já ter texto mais novo: esta não pode gravar por cima dele.
    release({ patch: { message: "servidor" }, updatedAt: "v5", editable: true });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(journalClear).not.toHaveBeenCalled();
  });

  it("sem nada pendente, sair não faz requisição", async () => {
    make().close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it("reabre depois de um close (remontagem do Strict Mode)", async () => {
    save.mockRejectedValueOnce(net());
    const sync = make();
    sync.close();
    sync.open();
    sync.setDesired({ ...INITIAL, message: "a" });
    await vi.advanceTimersByTimeAsync(700 + 1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(sync.getState().status).toBe("saved");
  });
});

describe("registro local", () => {
  it("desfazer até a versão salva não deixa o texto desfeito guardado", () => {
    const journal = new Map<string, string>();
    journalSave.mockImplementation((patch: CartPatch) => {
      journal.set("entry", JSON.stringify(patch));
      return true;
    });
    journalClear.mockImplementation((patch: CartPatch) => {
      if (journal.get("entry") === JSON.stringify(patch)) journal.delete("entry");
    });
    const sync = make();

    sync.setDesired({ ...INITIAL, message: "desisti disto" });
    sync.setDesired(INITIAL);

    expect(journal.has("entry")).toBe(false);
  });

  it("desfazer durante um envio mantém o registro até o servidor receber a correção", async () => {
    let release!: (v: { updatedAt: string }) => void;
    save.mockReturnValueOnce(new Promise((res) => (release = res)));
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "enviado" });
    await vi.advanceTimersByTimeAsync(700);

    journalClear.mockClear();
    sync.setDesired(INITIAL);
    expect(journalClear).not.toHaveBeenCalled();
    expect(journalSave).toHaveBeenLastCalledWith(INITIAL);

    release({ updatedAt: "v1" });
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.lastCall?.[0]).toEqual(INITIAL);
    expect(journalClear).toHaveBeenLastCalledWith(INITIAL);
  });

  it("avisa quando o aparelho não conseguiu guardar", () => {
    journalSave.mockReturnValue(false);
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "a" });
    expect(sync.getState().savedLocally).toBe(false);
  });

  it("guarda antes de enviar e só apaga depois da confirmação", async () => {
    const sync = make();
    sync.setDesired({ ...INITIAL, message: "a" });
    expect(journalSave).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(journalClear).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(700);
    expect(journalClear).toHaveBeenCalledTimes(1);
  });
});

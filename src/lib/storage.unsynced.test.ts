// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  clearDraft,
  clearUnsyncedChanges,
  loadUnsyncedChanges,
  saveUnsyncedChanges,
} from "@/lib/storage";

const KEY = "antero:draft:unsynced";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("alterações ainda não confirmadas", () => {
  it("devolve as alterações da carta certa", () => {
    saveUnsyncedChanges("c1", { message: "oi" });
    expect(loadUnsyncedChanges("c1")).toEqual({ message: "oi" });
  });

  it("nunca entrega as alterações de outra carta, e as descarta", () => {
    saveUnsyncedChanges("c1", { message: "de outra" });
    expect(loadUnsyncedChanges("c2")).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("não guarda o token de edição", () => {
    saveUnsyncedChanges("c1", { message: "oi" });
    expect(localStorage.getItem(KEY)).not.toMatch(/token/i);
  });

  it("apaga só a versão confirmada: texto mais novo continua guardado", () => {
    saveUnsyncedChanges("c1", { message: "novo" });
    clearUnsyncedChanges("c1", { message: "antigo" });
    expect(loadUnsyncedChanges("c1")).toEqual({ message: "novo" });

    clearUnsyncedChanges("c1", { message: "novo" });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("confirmação de outra carta não apaga nada", () => {
    saveUnsyncedChanges("c1", { message: "oi" });
    clearUnsyncedChanges("c2", { message: "oi" });
    expect(loadUnsyncedChanges("c1")).toEqual({ message: "oi" });
  });

  it("termina junto com a sessão (clearDraft)", () => {
    saveUnsyncedChanges("c1", { message: "oi" });
    clearDraft();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it.each([
    ["JSON quebrado", "{nao-e-json"],
    ["sem id", JSON.stringify({ patch: { message: "x" } })],
    ["mensagem de tipo errado", JSON.stringify({ cartId: "c1", patch: { message: 5 } })],
    ["patch em lista", JSON.stringify({ cartId: "c1", patch: ["x"] })],
  ])("ignora conteúdo inválido: %s", (_nome, raw) => {
    localStorage.setItem(KEY, raw);
    expect(loadUnsyncedChanges("c1")).toBeNull();
  });

  it("sem espaço no aparelho: avisa e não deixa uma versão velha para trás", () => {
    saveUnsyncedChanges("c1", { message: "velho" });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    expect(saveUnsyncedChanges("c1", { message: "novo" })).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

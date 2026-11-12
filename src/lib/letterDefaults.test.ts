import { describe, it, expect } from "vitest";
import type { Cart } from "@/lib/types";
import {
  applyEditorPatch,
  autoTitle,
  effectiveTitle,
  finalizeDefaults,
  isAutoTitle,
  savePatch,
} from "./letterDefaults";

const CART: Cart = {
  id: "c1",
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
  presentation: "papel-luz",
  presentationOptions: null,
  publicId: null,
  sharePreviewVersion: null,
  media: [],
  expiresAt: null,
  publishedAt: null,
  createdAt: "2026-11-03T00:00:00.000Z",
  updatedAt: "2026-11-03T00:00:00.000Z",
};

describe("título automático", () => {
  it("usa o nome, ou o genérico", () => {
    expect(autoTitle("Ana")).toBe("Para Ana");
    expect(autoTitle("  ")).toBe("Uma cartinha para você");
  });

  it("acompanha o nome enquanto não foi personalizado", () => {
    let c = applyEditorPatch(CART, { recipientName: "Ana" });
    expect(effectiveTitle(c)).toBe("Para Ana");
    c = { ...c, title: "Para Ana" }; // como volta do servidor depois de salvar
    c = applyEditorPatch(c, { recipientName: "Ana Lúcia" });
    expect(c.title).toBe("Para Ana Lúcia");
    c = applyEditorPatch(c, { recipientName: "" });
    expect(c.title).toBe("Uma cartinha para você");
  });

  it("título escrito pela pessoa nunca muda com o nome", () => {
    const c = applyEditorPatch({ ...CART, title: "Feliz aniversário", recipientName: "Ana" }, { recipientName: "Bia" });
    expect(c.title).toBe("Feliz aniversário");
    expect(isAutoTitle("Feliz aniversário", "Bia")).toBe(false);
  });
});

describe("patch do autosave", () => {
  it("manda o título efetivo (nunca vazio)", () => {
    expect(savePatch({ ...CART, recipientName: "Ana" }, null).title).toBe("Para Ana");
  });

  it("com pagamento pendente, não manda a mensagem vazia: fica a última confirmada", () => {
    const pending = { ...CART, status: "AWAITING_PAYMENT" as const, message: "  " };
    expect(savePatch(pending, "Mensagem já salva").message).toBe("Mensagem já salva");
    expect(savePatch({ ...pending, status: "DRAFT" }, "Mensagem já salva").message).toBe("  ");
  });

  it("estilo só entra quando existe (rascunho antigo não grava presentation: null)", () => {
    expect("presentation" in savePatch({ ...CART, presentation: null }, null)).toBe(false);
    expect(savePatch(CART, null).presentation).toBe("papel-luz");
  });
});

describe("finalização", () => {
  it("tipo de destinatário 'outro' e título automático quando faltam", () => {
    expect(finalizeDefaults(CART)).toEqual({ recipientType: "outro", title: "Uma cartinha para você" });
    expect(finalizeDefaults({ ...CART, recipientType: "mae", title: "Mãe" })).toEqual({});
  });
});

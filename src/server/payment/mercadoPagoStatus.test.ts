import { describe, it, expect } from "vitest";
import { mapMercadoPagoStatus, shouldApplyTransition } from "./mercadoPagoStatus";

describe("mapMercadoPagoStatus", () => {
  it("mapeia approved para PAID", () => {
    expect(mapMercadoPagoStatus("approved")).toBe("PAID");
  });

  it("mapeia rejected para FAILED", () => {
    expect(mapMercadoPagoStatus("rejected")).toBe("FAILED");
  });

  it("mapeia refunded para REFUNDED", () => {
    expect(mapMercadoPagoStatus("refunded")).toBe("REFUNDED");
  });

  it("mapeia charged_back para CHARGED_BACK", () => {
    expect(mapMercadoPagoStatus("charged_back")).toBe("CHARGED_BACK");
  });

  it("mapeia cancelled com status_detail expired para EXPIRED", () => {
    expect(mapMercadoPagoStatus("cancelled", "expired")).toBe("EXPIRED");
  });

  it("mapeia cancelled sem status_detail expired para CANCELLED", () => {
    expect(mapMercadoPagoStatus("cancelled", "by_collector")).toBe("CANCELLED");
    expect(mapMercadoPagoStatus("cancelled")).toBe("CANCELLED");
  });

  it("mapeia pending/in_process/authorized/in_mediation para PENDING", () => {
    expect(mapMercadoPagoStatus("pending")).toBe("PENDING");
    expect(mapMercadoPagoStatus("in_process")).toBe("PENDING");
    expect(mapMercadoPagoStatus("authorized")).toBe("PENDING");
    expect(mapMercadoPagoStatus("in_mediation")).toBe("PENDING");
  });

  it("status desconhecido/futuro cai em PENDING, nunca em PAID", () => {
    expect(mapMercadoPagoStatus("um_status_novo_que_nao_existe_ainda")).toBe("PENDING");
  });
});

describe("shouldApplyTransition", () => {
  it("permite qualquer transição a partir de PENDING", () => {
    expect(shouldApplyTransition("PENDING", "PAID")).toBe(true);
    expect(shouldApplyTransition("PENDING", "FAILED")).toBe(true);
    expect(shouldApplyTransition("PENDING", "CANCELLED")).toBe(true);
    expect(shouldApplyTransition("PENDING", "EXPIRED")).toBe(true);
  });

  it("de PAID só permite avançar para REFUNDED ou CHARGED_BACK", () => {
    expect(shouldApplyTransition("PAID", "REFUNDED")).toBe(true);
    expect(shouldApplyTransition("PAID", "CHARGED_BACK")).toBe(true);
  });

  it("nunca regride um estado pago para PENDING (evento fora de ordem)", () => {
    expect(shouldApplyTransition("PAID", "PENDING")).toBe(false);
  });

  it("nunca regride PAID para FAILED/CANCELLED/EXPIRED", () => {
    expect(shouldApplyTransition("PAID", "FAILED")).toBe(false);
    expect(shouldApplyTransition("PAID", "CANCELLED")).toBe(false);
    expect(shouldApplyTransition("PAID", "EXPIRED")).toBe(false);
  });

  it("estados terminais não-pagos não transicionam para outro estado", () => {
    expect(shouldApplyTransition("FAILED", "PAID")).toBe(false);
    expect(shouldApplyTransition("CANCELLED", "PAID")).toBe(false);
    expect(shouldApplyTransition("EXPIRED", "PAID")).toBe(false);
  });

  it("reaplicar o mesmo estado é sempre um no-op (idempotente)", () => {
    expect(shouldApplyTransition("PAID", "PAID")).toBe(false);
    expect(shouldApplyTransition("PENDING", "PENDING")).toBe(false);
    expect(shouldApplyTransition("REFUNDED", "REFUNDED")).toBe(false);
  });
});

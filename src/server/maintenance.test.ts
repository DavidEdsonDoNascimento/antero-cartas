import { describe, it, expect, afterEach, vi } from "vitest";
import {
  assertNotInMaintenance,
  isMaintenanceMode,
  maintenanceResponse,
  MAINTENANCE_RETRY_AFTER_SECONDS,
} from "./maintenance";
import { ApiError, jsonError } from "./errors";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isMaintenanceMode", () => {
  it("fica desligado por padrão (variável ausente)", () => {
    vi.stubEnv("MAINTENANCE_MODE", undefined);
    expect(isMaintenanceMode()).toBe(false);
  });

  it.each(["", "false", "0", "no", "off", "1", "yes", "verdadeiro"])(
    "só liga com 'true' explícito — %j mantém desligado",
    (value) => {
      vi.stubEnv("MAINTENANCE_MODE", value);
      expect(isMaintenanceMode()).toBe(false);
    },
  );

  it.each(["true", "TRUE", " true "])("liga com %j", (value) => {
    vi.stubEnv("MAINTENANCE_MODE", value);
    expect(isMaintenanceMode()).toBe(true);
  });
});

describe("assertNotInMaintenance", () => {
  it("não faz nada com o modo desligado", () => {
    vi.stubEnv("MAINTENANCE_MODE", "false");
    expect(() => assertNotInMaintenance()).not.toThrow();
  });

  it("lança ApiError 'maintenance' (503) com o modo ligado", () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    let caught: unknown;
    try {
      assertNotInMaintenance();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe("maintenance");
    expect((caught as ApiError).status).toBe(503);
  });

  it("jsonError converte em 503 com Retry-After e sem cache", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    let res: Response | null = null;
    try {
      assertNotInMaintenance();
    } catch (err) {
      res = jsonError(err);
    }
    expect(res?.status).toBe(503);
    expect(res?.headers.get("retry-after")).toBe(String(MAINTENANCE_RETRY_AFTER_SECONDS));
    expect(res?.headers.get("cache-control")).toBe("no-store");
    expect((await res?.json()).error.code).toBe("maintenance");
  });

  it("erros comuns continuam sem Retry-After", () => {
    const res = jsonError(new ApiError("invalid", "x"));
    expect(res.status).toBe(400);
    expect(res.headers.get("retry-after")).toBeNull();
  });
});

describe("maintenanceResponse", () => {
  it("devolve null com o modo desligado", () => {
    vi.stubEnv("MAINTENANCE_MODE", "false");
    expect(maintenanceResponse()).toBeNull();
  });

  it("devolve 503 com Retry-After com o modo ligado", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    const res = maintenanceResponse();
    expect(res?.status).toBe(503);
    expect(res?.headers.get("retry-after")).toBe(String(MAINTENANCE_RETRY_AFTER_SECONDS));
    expect((await res?.json()).error.code).toBe("maintenance");
  });
});

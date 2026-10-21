import { describe, it, expect, vi, afterEach } from "vitest";

const queryRaw = vi.fn();
const check = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) } }));
vi.mock("@/server/storage", () => ({ getStorage: () => ({ check }) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function call(query = "") {
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/api/health${query}`));
}

describe("/api/health", () => {
  it("200 quando banco e storage respondem, com versão e sem cache", async () => {
    vi.stubEnv("APP_VERSION", "abc1234");
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    check.mockResolvedValue(undefined);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      status: "ok",
      checks: { database: "ok", storage: "ok" },
      maintenance: false,
      version: "abc1234",
    });
  });

  it("503 quando o banco falha — sem vazar a mensagem do erro", async () => {
    queryRaw.mockRejectedValue(new Error("password authentication failed for user x at host y"));
    check.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("password");
    expect(JSON.parse(text).checks.database).toBe("fail");
  });

  it("503 quando o volume de fotos não é gravável", async () => {
    queryRaw.mockResolvedValue([]);
    check.mockRejectedValue(new Error("EACCES"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call();
    expect(res.status).toBe(503);
    expect((await res.json()).checks.storage).toBe("fail");
  });

  it("manutenção ligada continua 200 e é informada", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    queryRaw.mockResolvedValue([]);
    check.mockResolvedValue(undefined);
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).maintenance).toBe(true);
  });

  it("probe=live não toca no banco", async () => {
    const res = await call("?probe=live");
    expect(res.status).toBe(200);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });
});

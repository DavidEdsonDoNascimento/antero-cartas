import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readdir, rm, readFile, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalDiskStorage } from "./localDisk";

let dir: string;
const KEY = "carts/cm1/0b1c2d3e-aaaa-bbbb-cccc-111122223333.jpg";

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "antero-storage-"));
  vi.stubEnv("STORAGE_DIR", dir);
  vi.stubEnv("STORAGE_PUBLIC_URL", "/api/media");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await chmod(dir, 0o700).catch(() => {});
  await rm(dir, { recursive: true, force: true });
});

describe("createLocalDiskStorage", () => {
  it("grava, lê e devolve a URL pública; sem temporários sobrando", async () => {
    const s = createLocalDiskStorage();
    const body = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
    const { url } = await s.put({ key: KEY, body, contentType: "image/jpeg" });
    expect(url).toBe(`/api/media/${KEY}`);
    expect(await readFile(path.join(dir, KEY))).toEqual(body);
    expect(await s.read(KEY)).toEqual({ body, contentType: "image/jpeg" });
    expect(await readdir(path.join(dir, "carts/cm1"))).toEqual([path.basename(KEY)]);
  });

  it("STORAGE_DIR absoluto (volume) é respeitado e uma nova instância lê o que a anterior gravou", async () => {
    await createLocalDiskStorage().put({ key: KEY, body: Buffer.from("x"), contentType: "image/jpeg" });
    // Simula restart do processo/contêiner: nova instância, mesmo volume.
    expect((await createLocalDiskStorage().read(KEY))?.body.toString()).toBe("x");
  });

  it("recusa chaves fora do padrão e path traversal", async () => {
    const s = createLocalDiskStorage();
    await expect(s.put({ key: "../fora.jpg", body: Buffer.from("x"), contentType: "image/jpeg" })).rejects.toThrow();
    await expect(s.put({ key: "carts/a/../../b.jpg", body: Buffer.from("x"), contentType: "image/jpeg" })).rejects.toThrow();
    expect(await s.read("../../etc/passwd")).toBeNull();
    expect(await s.read("carts/a/nao-existe.jpg")).toBeNull();
  });

  it("delete é idempotente", async () => {
    const s = createLocalDiskStorage();
    await s.put({ key: KEY, body: Buffer.from("x"), contentType: "image/jpeg" });
    await s.delete(KEY);
    await s.delete(KEY);
    expect(await s.read(KEY)).toBeNull();
  });

  it("check() passa com diretório gravável e falha sem permissão de escrita", async () => {
    const s = createLocalDiskStorage();
    await expect(s.check?.()).resolves.toBeUndefined();
    if (process.getuid?.() === 0) return; // root ignora permissões de diretório
    await chmod(dir, 0o500);
    await expect(createLocalDiskStorage().check?.()).rejects.toThrow();
    expect((await stat(dir)).mode & 0o777).toBe(0o500);
  });
});

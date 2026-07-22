import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import {
  STORAGE_KEY_RE,
  type StorageProvider,
  type StoragePutInput,
} from "./StorageProvider";

/**
 * StorageProvider em disco local (desenvolvimento).
 * Upload passa pelo servidor Next (justificado: sem infra S3 configurada;
 * mantém o MVP 100% rodável). Limitações em serverless documentadas em 0004.
 * Os arquivos ficam fora de `public` e são servidos pela rota /api/media.
 */
export function createLocalDiskStorage(): StorageProvider {
  // turbopackIgnore evita que o bundler trace o projeto inteiro por causa
  // do process.cwd() dinâmico (apenas resolve um caminho de disco em runtime).
  const baseDir = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.STORAGE_DIR || ".data/uploads",
  );
  const publicBase = process.env.STORAGE_PUBLIC_URL || "/api/media";

  const CONTENT_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  function safeFullPath(key: string): string {
    if (!STORAGE_KEY_RE.test(key)) throw new Error("Chave de storage inválida.");
    const full = path.resolve(baseDir, key);
    if (!full.startsWith(baseDir + path.sep)) throw new Error("Caminho inválido.");
    return full;
  }

  return {
    async put({ key, body }: StoragePutInput) {
      const full = safeFullPath(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      return { key, url: this.getPublicUrl(key) };
    },
    async delete(key: string) {
      try {
        await unlink(safeFullPath(key));
      } catch (err) {
        // Ausência do arquivo não é erro (idempotente).
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      }
    },
    getPublicUrl(key: string) {
      return `${publicBase}/${key}`;
    },
    async read(key: string) {
      try {
        const full = safeFullPath(key);
        const body = await readFile(full);
        const contentType = CONTENT_TYPES[path.extname(full)] ?? "application/octet-stream";
        return { body, contentType };
      } catch {
        return null;
      }
    },
  };
}

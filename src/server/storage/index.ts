import type { StorageProvider } from "./StorageProvider";
import { createLocalDiskStorage } from "./localDisk";

let cached: StorageProvider | null = null;

/**
 * Fábrica de storage. Fase 2 suporta apenas "local" (disco).
 * Para produção, adicionar um provider S3/R2 aqui (STORAGE_PROVIDER=s3),
 * implementando a mesma interface — o domínio não muda.
 */
export function getStorage(): StorageProvider {
  if (cached) return cached;
  const provider = process.env.STORAGE_PROVIDER || "local";
  if (provider !== "local") {
    throw new Error(
      `STORAGE_PROVIDER "${provider}" não implementado nesta fase. Use "local".`,
    );
  }
  cached = createLocalDiskStorage();
  return cached;
}

export type { StorageProvider } from "./StorageProvider";

import type { StorageProvider } from "./StorageProvider";
import { createLocalDiskStorage } from "./localDisk";
import { createSupabaseStorage } from "./supabaseStorage";
import { assertNotAccidentalProduction } from "@/lib/appEnv";

let cached: StorageProvider | null = null;

/**
 * Fábrica de storage, escolhida por STORAGE_PROVIDER:
 * - "local"    → disco (`.data/uploads`), servido por /api/media. Testes
 *                isolados sem Docker.
 * - "supabase" → Supabase Storage (bucket público). Local (Docker) e produção.
 *
 * O domínio nunca sabe qual está ativo: só conhece a interface StorageProvider.
 */
export function getStorage(): StorageProvider {
  if (cached) return cached;
  assertNotAccidentalProduction("src/server/storage/index.ts");
  const provider = (process.env.STORAGE_PROVIDER || "local").trim().toLowerCase();

  switch (provider) {
    case "local":
      cached = createLocalDiskStorage();
      break;
    case "supabase":
      cached = createSupabaseStorage();
      break;
    default:
      throw new Error(
        `STORAGE_PROVIDER "${provider}" desconhecido. Use "local" ou "supabase".`,
      );
  }
  return cached;
}

/** Utilitário de teste: descarta o provider memoizado. */
export function resetStorage(): void {
  cached = null;
}

export type { StorageProvider } from "./StorageProvider";

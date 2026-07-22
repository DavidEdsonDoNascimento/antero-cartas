/**
 * Contrato de storage desacoplado do fornecedor.
 * O domínio nunca fala com um SDK específico — só com esta interface.
 * Fase 2: implementação em disco local (dev). Produção: S3/R2 atrás da mesma
 * interface (ver docs/0003 e 0004).
 */
export interface StoragePutInput {
  /** Chave no formato carts/{cartId}/{uuid}.{ext}. */
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageProvider {
  put(input: StoragePutInput): Promise<{ key: string; url: string }>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  /** Lê o objeto (usado pelo provider de disco para servir via rota). */
  read(key: string): Promise<{ body: Buffer; contentType: string } | null>;
}

/** Chave só pode conter carts/{id}/{uuid}.{ext} — sem caminhos arbitrários. */
export const STORAGE_KEY_RE = /^carts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

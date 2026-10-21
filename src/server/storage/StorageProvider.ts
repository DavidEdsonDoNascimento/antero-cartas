/**
 * Contrato de storage desacoplado do fornecedor.
 * O domínio nunca fala com um SDK específico — só com esta interface.
 * Implementações: disco local (dev e, com volume persistente, a produção em
 * contêiner — docs/0011) e Supabase Storage (produção atual na Vercel).
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
  /**
   * Verificação leve para o health check (opcional). Lança se o storage não
   * puder ser usado agora — ex.: volume ausente ou sem permissão de escrita.
   */
  check?(): Promise<void>;
}

/** Chave só pode conter carts/{id}/{uuid}.{ext} — sem caminhos arbitrários. */
export const STORAGE_KEY_RE = /^carts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

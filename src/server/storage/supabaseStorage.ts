import { ApiError } from "@/server/errors";
import {
  STORAGE_KEY_RE,
  type StorageProvider,
  type StoragePutInput,
} from "./StorageProvider";

/**
 * StorageProvider no Supabase Storage (produção).
 *
 * Fala direto com a API REST do Storage via fetch — sem SDK, pelo mesmo motivo
 * da busca do YouTube: a superfície usada é pequena e estável (PUT/DELETE/GET
 * de um objeto), e evita uma dependência a mais no bundle do servidor.
 *
 * Modelo de acesso:
 * - O bucket é PÚBLICO para leitura; a chave do objeto termina em um UUID
 *   (122 bits), então a URL é tão inadivinhável quanto o slug da carta.
 * - O bucket NÃO deve ter política de listagem — sem ela, a chave anônima não
 *   consegue enumerar objetos, só ler quem já conhece a URL exata.
 * - Escrita e remoção usam a SERVICE ROLE KEY, que nunca sai do servidor
 *   (variável sem prefixo NEXT_PUBLIC_).
 *
 * O upload continua passando pelo servidor Next (e não por URL assinada de
 * upload direto) para preservar a validação de magic bytes feita em
 * cartService.addMedia antes de qualquer byte chegar ao bucket. Ver docs/0004.
 */

const DEFAULT_BUCKET = "cart-media";
const DEFAULT_TIMEOUT_MS = 15_000;
/** A chave é imutável (UUID por arquivo), então o cache pode ser eterno. */
const OBJECT_CACHE_CONTROL = "max-age=31536000, immutable";

export interface SupabaseStorageOptions {
  url?: string;
  serviceKey?: string;
  bucket?: string;
  timeoutMs?: number;
  /** Injeção de fetch para testes. */
  fetchImpl?: typeof fetch;
}

interface ResolvedConfig {
  baseUrl: string;
  serviceKey: string;
  bucket: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}

/** Nome de bucket aceito pelo Supabase (sem barras nem espaços). */
const BUCKET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function resolveConfig(opts: SupabaseStorageOptions): ResolvedConfig {
  const baseUrl = (opts.url ?? process.env.SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const serviceKey = (
    opts.serviceKey ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  ).trim();
  const bucket = (
    opts.bucket ??
    process.env.SUPABASE_STORAGE_BUCKET ??
    DEFAULT_BUCKET
  ).trim();

  if (!baseUrl) {
    throw new Error(
      "SUPABASE_URL ausente. Configure a URL do projeto Supabase (ex.: https://xxxx.supabase.co) para usar STORAGE_PROVIDER=supabase.",
    );
  }
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error("SUPABASE_URL deve começar com http:// ou https://.");
  }
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ausente. Ela é obrigatória para gravar no bucket e NUNCA deve ter prefixo NEXT_PUBLIC_.",
    );
  }
  if (!BUCKET_RE.test(bucket)) {
    throw new Error(`SUPABASE_STORAGE_BUCKET inválido: "${bucket}".`);
  }

  return {
    baseUrl,
    serviceKey,
    bucket,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetchImpl: opts.fetchImpl ?? fetch,
  };
}

/**
 * Valida a chave antes de montar qualquer URL. STORAGE_KEY_RE só aceita
 * carts/{id}/{uuid}.{jpg|png|webp} — caracteres já seguros em URL, sem "..".
 */
function assertKey(key: string): void {
  if (!STORAGE_KEY_RE.test(key)) throw new Error("Chave de storage inválida.");
}

export function createSupabaseStorage(
  opts: SupabaseStorageOptions = {},
): StorageProvider {
  const cfg = resolveConfig(opts);

  const objectUrl = (key: string) =>
    `${cfg.baseUrl}/storage/v1/object/${cfg.bucket}/${key}`;

  const authHeaders = (): Record<string, string> => ({
    authorization: `Bearer ${cfg.serviceKey}`,
    apikey: cfg.serviceKey,
  });

  async function request(
    method: string,
    url: string,
    init: { headers?: Record<string, string>; body?: BodyInit } = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      return await cfg.fetchImpl(url, {
        method,
        headers: { ...authHeaders(), ...init.headers },
        body: init.body,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      throw storageFailure(
        method,
        (err as Error)?.name === "AbortError"
          ? "tempo esgotado"
          : "falha de rede",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async put({ key, body, contentType }: StoragePutInput) {
      assertKey(key);
      const res = await request("POST", objectUrl(key), {
        headers: {
          "content-type": contentType,
          "cache-control": OBJECT_CACHE_CONTROL,
          // A chave inclui UUID, então colisão é teórica; upsert deixa o
          // reenvio da mesma chave idempotente em vez de erro 409.
          "x-upsert": "true",
        },
        body: new Uint8Array(body),
      });
      if (!res.ok) {
        throw storageFailure("upload", await describeError(res));
      }
      return { key, url: this.getPublicUrl(key) };
    },

    async delete(key: string) {
      assertKey(key);
      const res = await request("DELETE", objectUrl(key));
      // Objeto ausente não é erro — a remoção é idempotente, igual ao provider
      // de disco (que ignora ENOENT).
      if (res.ok || res.status === 404) return;
      throw storageFailure("remoção", await describeError(res));
    },

    getPublicUrl(key: string) {
      assertKey(key);
      return `${cfg.baseUrl}/storage/v1/object/public/${cfg.bucket}/${key}`;
    },

    async read(key: string) {
      assertKey(key);
      const res = await request("GET", objectUrl(key));
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) return null;
      const body = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      return { body, contentType };
    },
  };
}

/**
 * Mensagem curta e sem segredos para o cliente; o detalhe técnico vai para o
 * log do servidor, porque uma falha de bucket/credencial é invisível de outra
 * forma (jsonError converte qualquer erro desconhecido em 500 genérico).
 */
function storageFailure(operation: string, detail: string): ApiError {
  console.error(`[storage:supabase] ${operation} falhou: ${detail}`);
  return new ApiError(
    "server",
    "Não foi possível salvar a foto agora. Tente novamente em instantes.",
  );
}

/** Extrai o motivo do erro do Storage sem repassar corpo bruto ao cliente. */
async function describeError(res: Response): Promise<string> {
  let message = "";
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    message = body.message ?? body.error ?? "";
  } catch {
    message = "";
  }
  return `HTTP ${res.status}${message ? ` — ${message}` : ""}`;
}

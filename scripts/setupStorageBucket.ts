/**
 * Cria (ou corrige) o bucket de fotos no Supabase Storage.
 *
 *   npm run storage:setup
 *
 * Idempotente: se o bucket já existir, apenas garante a configuração
 * (público para leitura, limite de tamanho e MIME types permitidos).
 * Usa a SERVICE ROLE KEY — rode somente localmente, nunca no cliente.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // igual a MAX_UPLOAD_BYTES

interface BucketConfig {
  public: boolean;
  file_size_limit: number;
  allowed_mime_types: string[];
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} não configurada. Defina em .env.local antes de rodar.`);
    process.exit(1);
  }
  return value;
}

/**
 * Lê o corpo JSON do erro sem nunca repassar cabeçalhos/segredos da
 * requisição — só o que o Supabase devolveu no corpo da resposta.
 */
async function errorBody(res: Response): Promise<{ message?: string; error?: string }> {
  try {
    return (await res.json()) as { message?: string; error?: string };
  } catch {
    return {};
  }
}

function errorMessage(body: { message?: string; error?: string }): string {
  return body.message ?? body.error ?? "";
}

async function describe(res: Response): Promise<string> {
  const message = errorMessage(await errorBody(res));
  return `HTTP ${res.status}${message ? ` — ${message}` : ""}`;
}

type BucketLookup = "exists" | "missing";

/**
 * GET /storage/v1/bucket/:id no Supabase Storage responde HTTP 400 (não 404)
 * quando o bucket não existe, com corpo `{ error/message: "Bucket not found" }`.
 * Por isso a existência é decidida pela MENSAGEM do corpo, não pelo status —
 * confirmado rodando contra um projeto real antes de escrever esta lógica.
 */
async function checkBucketExists(
  baseUrl: string,
  bucket: string,
  headers: Record<string, string>,
): Promise<BucketLookup> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/storage/v1/bucket/${bucket}`, { headers });
  } catch (err) {
    console.error(
      `Não foi possível conectar a ${baseUrl} (${(err as Error)?.message ?? "erro de rede"}). Verifique SUPABASE_URL.`,
    );
    process.exit(1);
  }

  if (res.ok) return "exists";

  const message = errorMessage(await errorBody(res)).toLowerCase();
  if (message.includes("not found") || message.includes("não encontrado")) {
    return "missing";
  }

  // Status real de autenticação/permissão/comunicação — não é "não existe".
  if (res.status === 401) {
    console.error(
      "Falha de autenticação (401): SUPABASE_SERVICE_ROLE_KEY parece inválida ou expirada.",
    );
  } else if (res.status === 403) {
    console.error(
      "Acesso negado (403): a service_role key não tem permissão sobre o Storage deste projeto.",
    );
  } else {
    console.error(`Não foi possível consultar o bucket: HTTP ${res.status}${message ? ` — ${message}` : ""}`);
  }
  process.exit(1);
}

async function main() {
  const baseUrl = required("SUPABASE_URL").replace(/\/+$/, "");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "cart-media";

  const headers = {
    authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "content-type": "application/json",
  };
  const config: BucketConfig = {
    public: true,
    file_size_limit: FILE_SIZE_LIMIT,
    allowed_mime_types: ALLOWED_MIME,
  };

  const lookup = await checkBucketExists(baseUrl, bucket, headers);

  if (lookup === "missing") {
    console.log(`Bucket "${bucket}" não existe — criando...`);
    const res = await fetch(`${baseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: bucket, name: bucket, ...config }),
    });
    if (res.ok) {
      console.log("Bucket criado.");
    } else {
      const body = await errorBody(res);
      const message = errorMessage(body).toLowerCase();
      // Corrida entre execuções concorrentes: o bucket passou a existir entre
      // o GET e o POST. Ainda é idempotente — só cai para o PUT de baixo.
      const raceWithConcurrentCreate =
        res.status === 409 || message.includes("already exists") || message.includes("duplicate");
      if (!raceWithConcurrentCreate) {
        console.error(`Falha ao criar o bucket: HTTP ${res.status}${message ? ` — ${message}` : ""}`);
        process.exit(1);
      }
      console.log(`Bucket "${bucket}" já existia (corrida de criação) — atualizando configuração...`);
      const update = await fetch(`${baseUrl}/storage/v1/bucket/${bucket}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(config),
      });
      if (!update.ok) {
        console.error(`Falha ao atualizar o bucket: ${await describe(update)}`);
        process.exit(1);
      }
      console.log("Configuração atualizada.");
    }
  } else {
    console.log(`Bucket "${bucket}" já existe — atualizando configuração...`);
    const res = await fetch(`${baseUrl}/storage/v1/bucket/${bucket}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      console.error(`Falha ao atualizar o bucket: ${await describe(res)}`);
      process.exit(1);
    }
    console.log("Configuração atualizada.");
  }

  console.log("");
  console.log(`  Leitura pública:  ${baseUrl}/storage/v1/object/public/${bucket}/<chave>`);
  console.log(`  Tamanho máximo:   ${(FILE_SIZE_LIMIT / 1024 / 1024).toFixed(0)} MB`);
  console.log(`  MIME permitidos:  ${ALLOWED_MIME.join(", ")}`);
  console.log("");
  console.log("Importante: NÃO crie policies de SELECT/list em storage.objects para");
  console.log("este bucket. Sem elas a chave anônima lê apenas URLs que já conhece e");
  console.log("não consegue enumerar as fotos das cartas.");
  console.log("");
  console.log("Agora ajuste .env.local: STORAGE_PROVIDER=supabase");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

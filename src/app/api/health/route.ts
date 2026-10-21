import { prisma } from "@/lib/db";
import { getStorage } from "@/server/storage";
import { isMaintenanceMode } from "@/server/maintenance";

export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 3_000;

type CheckResult = "ok" | "fail" | "skipped";

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Health check para o contêiner (Docker HEALTHCHECK / Coolify) e monitor
 * externo — docs/0011.
 *
 * - `GET /api/health`: prontidão. 200 só se o banco responde (`SELECT 1`) e o
 *   storage está utilizável (no disco local: diretório existe e é gravável).
 *   503 caso contrário — o proxy deixa de mandar tráfego e um deploy novo não
 *   substitui o anterior.
 * - `GET /api/health?probe=live`: só o processo, sem tocar no banco.
 *
 * Nunca expõe erro interno, host ou credencial: só "ok"/"fail". Manutenção
 * ligada continua 200 (a aplicação está saudável, só não aceita escrita).
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  const version = process.env.APP_VERSION?.trim() || null;

  if (new URL(req.url).searchParams.get("probe") === "live") {
    return Response.json({ status: "ok", probe: "live", version }, { headers });
  }

  let database: CheckResult = "ok";
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`);
  } catch {
    database = "fail";
  }

  let storage: CheckResult = "skipped";
  try {
    const provider = getStorage();
    if (provider.check) {
      await withTimeout(provider.check());
      storage = "ok";
    }
  } catch {
    storage = "fail";
  }

  const healthy = database === "ok" && storage !== "fail";
  if (!healthy) {
    console.error("[health] verificação falhou", { database, storage });
  }
  return Response.json(
    {
      status: healthy ? "ok" : "fail",
      checks: { database, storage },
      maintenance: isMaintenanceMode(),
      version,
    },
    { status: healthy ? 200 : 503, headers },
  );
}

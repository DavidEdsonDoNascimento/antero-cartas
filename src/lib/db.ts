// Módulo apenas de servidor: importa pg/adapter (Node), nunca use no cliente.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { assertNotAccidentalProduction } from "@/lib/appEnv";

/**
 * Cliente Prisma (Prisma 7 usa driver adapter). Singleton para não abrir
 * várias conexões durante o hot-reload do Next em desenvolvimento.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  assertNotAccidentalProduction("src/lib/db.ts");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

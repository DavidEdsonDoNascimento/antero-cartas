// Carrega as variáveis do .env.local (preferência) e depois do .env,
// para que o Prisma CLI (migrate/generate) use a mesma DATABASE_URL do app.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Usada pelo Prisma CLI (migrate/introspect). Para bancos com pooler
  // (Neon/Supabase), prefira a conexão DIRETA nas migrations.
  datasource: {
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});

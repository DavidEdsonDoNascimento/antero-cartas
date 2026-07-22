import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// Carrega .env.local para que testes de integração (Fase 2) enxerguem
// DATABASE_URL etc., do mesmo jeito que o Next.js faz em dev.
loadEnv({ path: ".env.local" });

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

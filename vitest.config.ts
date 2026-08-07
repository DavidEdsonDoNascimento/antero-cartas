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
    // Padrão continua node (servidor, integração com banco, módulos puros).
    // Testes de componente pedem DOM caso a caso, com a diretiva
    // `@vitest-environment jsdom` no topo do arquivo — assim a suíte inteira
    // não paga o custo de montar um DOM.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});

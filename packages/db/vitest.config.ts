import { defineConfig } from "vitest/config";

// Pruebas unitarias/lógica (PGlite): rápidas, sin dependencia de binarios
// nativos de Postgres. La concurrencia real del EXCLUDE se valida solo en
// vitest.integration.config.ts contra embedded-postgres (D-022).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration/**", "node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

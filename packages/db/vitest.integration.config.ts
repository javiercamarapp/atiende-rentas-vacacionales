import { defineConfig } from "vitest/config";

// Pruebas de integración/concurrencia real contra embedded-postgres
// (Postgres 18.4 real, D-009/D-022). Corren secuencialmente (fileParallelism
// desactivado) porque cada archivo levanta su propio cluster embebido en un
// puerto propio; el paralelismo real que se prueba es DENTRO de cada test
// (inserciones concurrentes contra el mismo cluster), no entre archivos.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

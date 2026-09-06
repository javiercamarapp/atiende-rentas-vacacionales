import { defineConfig } from "vitest/config";

// Pruebas de integración de apps/api (RLS vía HTTP, auditoría, cifrado)
// contra `embedded-postgres` real (D-009/D-022) — nunca PGlite, porque
// necesitan roles de PostgreSQL de verdad (`app_rv` sin BYPASSRLS) y las
// políticas RLS reales de packages/db/src/migrations/0010-0019.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

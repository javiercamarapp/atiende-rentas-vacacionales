import { defineConfig } from "vitest/config";

// Config compartido de auditoría-3 (mismo patrón que tests/auditoria-2/
// vitest.config.ts y tests/adversarial/vitest.config.ts): corre desde la
// raíz del repo (`root` por defecto = cwd) para poder resolver los
// paquetes hoisted por npm workspaces (hono, jose, pg, vitest, ...) desde
// el `node_modules` raíz, igual que hacen los otros archivos de esta
// carpeta al importar directamente de `apps/api/src/...`.
export default defineConfig({
  test: {
    include: ["tests/auditoria-3/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

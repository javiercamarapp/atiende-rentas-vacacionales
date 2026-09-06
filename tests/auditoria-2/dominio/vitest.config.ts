import { defineConfig } from "vitest/config";

// Auditoría adversarial independiente Sonnet — dominio/sincronización/datos
// (Fase 2). Corre desde la raíz del repo para resolver los paquetes de
// workspace (@atiende-rv/domain, @atiende-rv/db, @atiende-rv/adapters,
// @atiende-rv/sim) vía los symlinks de npm workspaces, igual que
// tests/adversarial/vitest.config.ts. Suite separada y de solo lectura de
// producto: únicamente añade pruebas de reproducción, nunca modifica
// packages/*.
export default defineConfig({
  test: {
    include: ["tests/auditoria-2/dominio/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});

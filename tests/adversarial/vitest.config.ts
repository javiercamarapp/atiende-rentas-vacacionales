import { defineConfig } from "vitest/config";

// Suite adversarial de sincronización (Lote 2, LOTES.md: "npm run
// test:adversarial -- --filter=sync"). Corre desde la raíz del repo
// (`root` por defecto = cwd) para poder resolver los paquetes de workspace
// (@atiende-rv/domain, @atiende-rv/db, @atiende-rv/adapters, @atiende-rv/sim)
// vía los symlinks de npm workspaces en node_modules. Contra
// embedded-postgres real (D-009/D-022) + simuladores etiquetados (D-019):
// arranques de cluster pesados, por eso timeouts largos y sin paralelismo
// entre archivos (cada archivo puede levantar su propio cluster).
export default defineConfig({
  test: {
    include: ["tests/adversarial/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

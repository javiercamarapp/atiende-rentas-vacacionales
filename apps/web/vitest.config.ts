import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Pruebas de componentes (LOTES.md Lote 4 punto 6: "componentes (Vitest +
// Testing Library) para render de capas y estados, accesibilidad básica").
// Excluye `e2e/` (Playwright, config propia) para que `npm run test` de
// este workspace nunca intente correr specs de Playwright con Vitest.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});

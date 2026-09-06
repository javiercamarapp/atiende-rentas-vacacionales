import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Config PRIVADO para xss-mensajeria.adversarial.test.tsx (entorno jsdom +
// plugin de React/JSX), aislado del resto de tests/auditoria-2/ (carpeta
// compartida por varias auditorías concurrentes en esta sesión — mismo
// motivo que vitest.config.secretos-inyeccion.ts en esta misma carpeta:
// nunca depender de/editar tests/auditoria-2/vitest.config.ts, que
// pertenece a otra auditoría en curso). Alias "@" -> apps/web/src igual
// que apps/web/vitest.config.ts, por si algún import transitivo lo usa.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../../../apps/web/src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["apps/web/src/test/setup.ts"],
    include: ["tests/auditoria-2/seguridad/xss-mensajeria.adversarial.test.tsx"],
  },
});

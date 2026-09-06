import { defineConfig } from "vitest/config";

// Config PRIVADO para correr únicamente ssrf-ical.adversarial.test.ts de
// forma aislada (este directorio tests/auditoria-2/ es compartido por
// varias auditorías concurrentes en esta misma sesión de filesystem —
// evitamos depender de/editar tests/auditoria-2/vitest.config.ts, que
// pertenece a otra auditoría en curso).
export default defineConfig({
  test: {
    include: ["tests/auditoria-2/seguridad/ssrf-ical.adversarial.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

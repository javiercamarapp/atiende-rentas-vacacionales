import { defineConfig } from "vitest/config";

// Config PRIVADO para correr únicamente logs-flags.adversarial.test.ts de
// forma aislada (tests/auditoria-2/ es compartido por varias auditorías
// concurrentes en esta sesión de filesystem — evitamos depender de/editar
// tests/auditoria-2/vitest.config.ts, que pertenece a otra auditoría en curso).
export default defineConfig({
  test: {
    include: ["tests/auditoria-2/seguridad/logs-flags.adversarial.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

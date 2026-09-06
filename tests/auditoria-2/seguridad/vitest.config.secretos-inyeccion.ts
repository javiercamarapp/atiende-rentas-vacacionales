import { defineConfig } from "vitest/config";

// Config PRIVADO para correr únicamente secretos-inyeccion.adversarial.test.ts
// de forma aislada (tests/auditoria-2/ es compartido por varias auditorías
// concurrentes en esta sesión de filesystem — evitamos depender de/editar
// tests/auditoria-2/vitest.config.ts, que pertenece a otra auditoría en
// curso). Mismo patrón que vitest.config.logs-flags.ts /
// vitest.config.local-ssrf-ical.ts en esta misma carpeta.
export default defineConfig({
  test: {
    include: ["tests/auditoria-2/seguridad/secretos-inyeccion.adversarial.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

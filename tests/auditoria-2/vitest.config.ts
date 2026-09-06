import { defineConfig } from "vitest/config";

// AVISO: tests/auditoria-2/ es compartido por varias auditorías
// adversariales concurrentes en esta misma sesión de filesystem (ver
// tests/auditoria-2/seguridad/vitest.config.logs-flags.ts y
// vitest.config.local-ssrf-ical.ts, que documentan lo mismo). Este
// archivo raíz pudo haber sido escrito/sobrescrito por más de una
// auditoría — si tu suite necesita ajustes propios (timeout, entorno,
// plugins), usa un config PRIVADO junto a tu archivo de prueba (mismo
// patrón que los dos anteriores) en vez de editar este.
//
// Config genérico de auditoría-2 (NO modifica tests/adversarial/vitest.config.ts):
// mismo patrón (embedded-postgres real, timeouts largos, sin paralelismo
// entre archivos) pero con `include` apuntando a tests/auditoria-2/.
export default defineConfig({
  test: {
    include: ["tests/auditoria-2/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

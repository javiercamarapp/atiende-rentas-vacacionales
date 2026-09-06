import type { Migracion } from "../runner/tipos.js";

// Lote 3.3 (RV16) — corrección encontrada por la prueba de integración
// HTTP real (apps/api/test/integration/onboardingFacturacion.test.ts):
// el handler de `POST /facturacion/webhooks/stripe` necesita resolver
// `tenant_id` a partir del `cliente_externo_id` de Stripe usando
// `pool.query(...)` SIN sesión de usuario (un webhook no trae JWT) —
// pero `suscripcion_tenant` tiene RLS `FORCE`ado (migración 0123) con una
// política de SELECT que exige `is_tenant_member(usuario_actual_id(), ...)`.
// Sin sesión, `usuario_actual_id()` es NULL y la política bloquea la
// fila SILENCIOSAMENTE (cero filas, sin error) — el webhook completo
// devolvía 200 "ignorado" en vez de activar la suscripción, verificado
// en vivo: el `estado` se quedaba en 'prueba' después de un webhook con
// firma VÁLIDA. Mismo patrón que las funciones `autenticar_buscar_*`
// (0106): una función `SECURITY DEFINER` de solo lectura para el único
// caso legítimo sin sesión de usuario.
export const migracion0125FacturacionWebhookLookup: Migracion = {
  id: "0125_facturacion_webhook_lookup",
  descripcion: "facturacion_tenant_por_cliente_externo() — lookup sin sesión para el webhook de pagos",
  up: `
    CREATE FUNCTION facturacion_tenant_por_cliente_externo(_cliente_externo_id text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT tenant_id FROM suscripcion_tenant WHERE cliente_externo_id = _cliente_externo_id
    $$;
    REVOKE ALL ON FUNCTION facturacion_tenant_por_cliente_externo(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION facturacion_tenant_por_cliente_externo(text) TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS facturacion_tenant_por_cliente_externo(text);
  `,
};

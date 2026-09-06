import type { Migracion } from "../runner/tipos.js";

// Lote 3.3: soporte de webhook de pagos (Stripe real o `PagosSimulado`
// en pruebas de integración) — un webhook HTTP no trae sesión de usuario
// (no hay JWT, la única credencial es la firma HMAC verificada en
// `packages/domain/src/facturacion/pagos/stripe.ts`), así que la
// actualización de `suscripcion_tenant` que dispara tiene que pasar por
// una función `SECURITY DEFINER` — igual patrón que `onboarding_registrar_
// empresa`/`autenticar_registrar_usuario`.
//
// `evento_pago_procesado` deduplica reintentos de webhook (Stripe
// reintenta un webhook si la respuesta HTTP no fue 2xx en su ventana) —
// sin esto, un reintento legítimo podría reactivar dos veces la misma
// suscripción o duplicar un efecto de negocio no idempotente.
export const migracion0124FacturacionWebhook: Migracion = {
  id: "0124_facturacion_webhook",
  descripcion: "facturacion_registrar_pago() + evento_pago_procesado (idempotencia de webhook)",
  up: `
    CREATE TABLE evento_pago_procesado (
      proveedor    text NOT NULL CHECK (proveedor IN ('simulado', 'stripe')),
      evento_id    text NOT NULL,
      procesado_en timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (proveedor, evento_id)
    );
    -- Sin RLS de por medio a propósito: esta tabla nunca se consulta con
    -- una sesión de usuario, solo desde facturacion_registrar_pago()
    -- (SECURITY DEFINER) — no expone ninguna fila vía la API HTTP normal.

    CREATE FUNCTION facturacion_registrar_pago(
      _tenant uuid,
      _proveedor text,
      _evento_id text,
      _cliente_externo_id text,
      _suscripcion_externa_id text,
      _estado text
    ) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_filas_insertadas integer;
    BEGIN
      IF _estado NOT IN ('prueba', 'activa', 'pago_pendiente', 'cancelada', 'vencida') THEN
        RAISE EXCEPTION 'estado de suscripción inválido: %', _estado USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO evento_pago_procesado (proveedor, evento_id)
      VALUES (_proveedor, _evento_id)
      ON CONFLICT (proveedor, evento_id) DO NOTHING;
      GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
      -- ROW_COUNT = 0 significa que el INSERT no insertó nada (ya existía)
      -- -> este evento YA se procesó antes; se devuelve false sin tocar
      -- suscripcion_tenant, para que la ruta HTTP responda 200 igual
      -- (Stripe espera 2xx también en un reintento ya conocido) sin
      -- reaplicar el efecto de negocio.
      IF v_filas_insertadas = 0 THEN
        RETURN false;
      END IF;

      UPDATE suscripcion_tenant SET
        estado = _estado,
        proveedor_pago = _proveedor,
        cliente_externo_id = COALESCE(_cliente_externo_id, cliente_externo_id),
        suscripcion_externa_id = COALESCE(_suscripcion_externa_id, suscripcion_externa_id),
        proxima_renovacion_en = CASE WHEN _estado = 'activa' THEN now() + interval '30 days' ELSE proxima_renovacion_en END,
        actualizado_en = now()
      WHERE tenant_id = _tenant;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'suscripcion_tenant no existe para tenant %', _tenant USING ERRCODE = 'no_data_found';
      END IF;
      RETURN true;
    END;
    $$;
    REVOKE ALL ON FUNCTION facturacion_registrar_pago(uuid, text, text, text, text, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION facturacion_registrar_pago(uuid, text, text, text, text, text) TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS facturacion_registrar_pago(uuid, text, text, text, text, text);
    DROP TABLE IF EXISTS evento_pago_procesado;
  `,
};

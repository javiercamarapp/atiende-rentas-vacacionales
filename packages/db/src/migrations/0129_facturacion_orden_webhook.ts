import type { Migracion } from "../runner/tipos.js";

// A3-FACT-01 (docs/auditoria-3/facturacion-onboarding.md): `facturacion_
// registrar_pago()` (0124_facturacion_webhook.ts) deduplica correctamente
// reintentos del MISMO evento de Stripe vía `evento_pago_procesado`
// (ON CONFLICT (proveedor, evento_id) DO NOTHING), pero para un evento
// NUEVO (evento_id distinto) hacía un `UPDATE suscripcion_tenant SET
// estado = _estado ...` INCONDICIONAL, sin comparar contra ningún orden
// cronológico. Stripe advierte explícitamente que los webhooks pueden
// entregarse fuera de orden (reintentos internos, colas, reenvíos
// manuales desde el dashboard) — un evento más viejo entregado tarde
// (p. ej. una `customer.subscription.updated` que en el mundo real
// ocurrió ANTES) podía pisar el estado de un evento más nuevo ya
// aplicado (p. ej. una cancelación real), reactivando una suscripción
// que ya no debía estar activa. Repro: tests/auditoria-3/facturacion/
// webhookFueraDeOrden.test.ts.
//
// Corrección: `suscripcion_tenant.ultimo_evento_stripe_creado_en`
// guarda el epoch (segundos) del campo `created` del ÚLTIMO evento de
// Stripe que efectivamente aplicó un cambio de estado para ese tenant.
// `facturacion_registrar_pago()` gana un parámetro `_evento_creado_en`
// (mismo epoch, `NULL`/omitido si el llamador no lo tiene — con
// `DEFAULT` para no romper los llamadores existentes que ya funcionan
// correctamente sin ordenar nada, ver comentario en el `up` de abajo) y
// solo aplica el `UPDATE` de estado si:
//   - no hay ningún evento previo aplicado para ese tenant (`NULL`,
//     primera vez), o
//   - el evento entrante es estrictamente más nuevo que el último
//     aplicado (`_evento_creado_en > ultimo_evento_stripe_creado_en`).
// Un evento más viejo que llega tarde SIGUE registrándose en
// `evento_pago_procesado` (la idempotencia de reintentos del MISMO
// evento_id no cambia en absoluto) y la función sigue devolviendo
// `true` (se procesó, es la primera vez que se ve este evento_id) —
// simplemente no pisa un estado más nuevo ya aplicado.
//
// Postgres no permite `CREATE OR REPLACE FUNCTION` cuando cambia la
// lista de parámetros (agregar uno nuevo, aunque tenga `DEFAULT`, es
// literalmente otra firma/sobrecarga) — mismo motivo documentado en
// 0106_auth_funciones_extendidas.ts: se hace `DROP FUNCTION IF EXISTS`
// de la firma vieja de 6 argumentos antes de crear la de 7.
export const migracion0129FacturacionOrdenWebhook: Migracion = {
  id: "0129_facturacion_orden_webhook",
  descripcion:
    "suscripcion_tenant.ultimo_evento_stripe_creado_en + facturacion_registrar_pago() ignora eventos de webhook fuera de orden (A3-FACT-01)",
  up: `
    ALTER TABLE suscripcion_tenant ADD COLUMN ultimo_evento_stripe_creado_en bigint;

    DROP FUNCTION IF EXISTS facturacion_registrar_pago(uuid, text, text, text, text, text);
    CREATE FUNCTION facturacion_registrar_pago(
      _tenant uuid,
      _proveedor text,
      _evento_id text,
      _cliente_externo_id text,
      _suscripcion_externa_id text,
      _estado text,
      -- Epoch (segundos) del campo "created" del evento de Stripe.
      -- DEFAULT a "ahora mismo" (nunca NULL de forma silenciosa) para
      -- que un llamador que todavía no pasa este argumento (pruebas de
      -- integración existentes, ver packages/db/test/integration/
      -- facturacionOnboardingRls.test.ts) siga funcionando exactamente
      -- igual que antes: cada llamada sucesiva en el tiempo real del
      -- proceso tiene un epoch mayor o igual a la anterior, o sea
      -- "siempre el evento más nuevo", que era el comportamiento
      -- (correcto, sin reordenar nada) previo a esta migración.
      _evento_creado_en bigint DEFAULT extract(epoch FROM clock_timestamp())::bigint
    ) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_filas_insertadas integer;
      v_ultimo_evento_creado_en bigint;
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
      -- reaplicar el efecto de negocio. Esta comprobación va SIEMPRE
      -- primero, antes de mirar ningún orden cronológico: la idempotencia
      -- de un reintento del MISMO evento_id nunca depende de timestamps.
      IF v_filas_insertadas = 0 THEN
        RETURN false;
      END IF;

      SELECT ultimo_evento_stripe_creado_en INTO v_ultimo_evento_creado_en
      FROM suscripcion_tenant WHERE tenant_id = _tenant;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'suscripcion_tenant no existe para tenant %', _tenant USING ERRCODE = 'no_data_found';
      END IF;

      -- La comparación es NULL-safe a propósito en AMBOS lados: un
      -- _evento_creado_en NULL explícito (el llamador HTTP pasa "null"
      -- cuando evento.creadoEnEpoch no vino en el payload — un NULL
      -- explícito NO dispara el DEFAULT de Postgres, solo omitir el
      -- argumento lo hace) significa "sin información de orden" y debe
      -- aplicar de todas formas, igual que si nunca hubiera habido un
      -- evento previo (v_ultimo_evento_creado_en NULL).
      IF v_ultimo_evento_creado_en IS NOT NULL
         AND _evento_creado_en IS NOT NULL
         AND _evento_creado_en <= v_ultimo_evento_creado_en THEN
        -- A3-FACT-01: evento NUEVO (evento_id nunca antes visto, ya
        -- registrado arriba) pero CRONOLÓGICAMENTE más viejo que el
        -- último que sí aplicó un cambio de estado — Stripe lo entregó
        -- fuera de orden. Se conserva el estado ya aplicado (más nuevo)
        -- y NO se pisa con este.
        RETURN true;
      END IF;

      UPDATE suscripcion_tenant SET
        estado = _estado,
        proveedor_pago = _proveedor,
        cliente_externo_id = COALESCE(_cliente_externo_id, cliente_externo_id),
        suscripcion_externa_id = COALESCE(_suscripcion_externa_id, suscripcion_externa_id),
        proxima_renovacion_en = CASE WHEN _estado = 'activa' THEN now() + interval '30 days' ELSE proxima_renovacion_en END,
        -- COALESCE: un evento sin timestamp (NULL) nunca borra la marca
        -- de agua de un evento anterior que sí la traía — de lo
        -- contrario, un solo evento sin "created" desactivaría
        -- silenciosamente la protección de orden para este tenant en
        -- adelante.
        ultimo_evento_stripe_creado_en = COALESCE(_evento_creado_en, ultimo_evento_stripe_creado_en),
        actualizado_en = now()
      WHERE tenant_id = _tenant;

      RETURN true;
    END;
    $$;
    REVOKE ALL ON FUNCTION facturacion_registrar_pago(uuid, text, text, text, text, text, bigint) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION facturacion_registrar_pago(uuid, text, text, text, text, text, bigint) TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS facturacion_registrar_pago(uuid, text, text, text, text, text, bigint);
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

    ALTER TABLE suscripcion_tenant DROP COLUMN ultimo_evento_stripe_creado_en;
  `,
};

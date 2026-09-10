import type { Migracion } from "../runner/tipos.js";

// Lote 3.3 (RV16): esquema de planes/facturación.
//
// `plan_facturacion` es un CATÁLOGO GLOBAL (no tiene tenant_id) editable
// SOLO por Superadmin — la fuente de verdad de precios/límites en runtime,
// sembrada aquí con los mismos valores de
// `packages/domain/src/facturacion/planes.ts` (`planesPorDefecto`) pero
// NUNCA hardcodeada en código de negocio: cambiar un precio es un
// `PATCH /facturacion/planes/:codigo` (Superadmin), no un despliegue.
// `escalones`/`add_ons` en JSONB (mismo criterio que otras
// configuraciones flexibles del repo, p. ej. `alerta.metadata`) — la
// forma exacta la valida `zod` en la capa de rutas
// (`apps/api/src/contrato/tipos.ts`), no un CHECK de Postgres.
//
// BORRADOR COMERCIAL (RV16) — el seed de abajo son las mismas cifras
// de `planesPorDefecto`, ancladas en rangos de mercado observados, NUNCA
// precios definitivos (ver el comentario de cabecera de
// `packages/domain/src/facturacion/planes.ts`).
export const migracion0122FacturacionEsquema: Migracion = {
  id: "0122_facturacion_esquema",
  descripcion: "plan_facturacion, suscripcion_tenant, medicion_uso_mensaje_ia + seed borrador comercial",
  up: `
    CREATE TABLE plan_facturacion (
      codigo                      text PRIMARY KEY,
      nombre                      text NOT NULL,
      descripcion                 text NOT NULL DEFAULT '',
      escalones                   jsonb NOT NULL,
      add_ons                     jsonb NOT NULL DEFAULT '[]'::jsonb,
      limite_unidades_activas     integer,
      limite_mensajes_ia_mes      integer,
      limite_cuentas_canal        integer,
      dias_prueba                 integer NOT NULL DEFAULT 14 CHECK (dias_prueba >= 0),
      moneda                      text NOT NULL DEFAULT 'USD' CHECK (moneda ~ '^[A-Z]{3}$'),
      -- Único valor permitido hoy (RV16): ningún plan puede marcarse como
      -- precio definitivo hasta que el equipo de pricing cierre RV16.
      etiqueta_precio             text NOT NULL DEFAULT 'borrador_comercial'
                                    CHECK (etiqueta_precio = 'borrador_comercial'),
      activo                      boolean NOT NULL DEFAULT true,
      creado_en                   timestamptz NOT NULL DEFAULT now(),
      actualizado_en              timestamptz NOT NULL DEFAULT now(),
      actualizado_por             uuid REFERENCES usuario(id)
    );

    CREATE TABLE suscripcion_tenant (
      tenant_id                   uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
      plan_codigo                 text NOT NULL REFERENCES plan_facturacion(codigo),
      add_ons_activos             jsonb NOT NULL DEFAULT '[]'::jsonb,
      estado                      text NOT NULL DEFAULT 'prueba'
                                    CHECK (estado IN ('prueba', 'activa', 'pago_pendiente', 'cancelada', 'vencida')),
      inicio_periodo_prueba_en    timestamptz,
      fin_periodo_prueba_en       timestamptz,
      proxima_renovacion_en       timestamptz,
      -- 'simulado' | 'stripe' | NULL (todavía sin ningún checkout completado).
      proveedor_pago              text CHECK (proveedor_pago IS NULL OR proveedor_pago IN ('simulado', 'stripe')),
      cliente_externo_id          text,
      suscripcion_externa_id      text,
      creado_en                   timestamptz NOT NULL DEFAULT now(),
      actualizado_en              timestamptz NOT NULL DEFAULT now()
    );

    -- Contador mensual de mensajes de IA por tenant (RV16: "medición de
    -- uso"). unidades_activas/cuentas_canal NO se duplican aquí -- se
    -- cuentan en vivo desde unidad/cuenta_canal (fuente única de
    -- verdad, cero riesgo de que un contador quede desincronizado de la
    -- tabla real) vía medicion_uso_actual() abajo.
    CREATE TABLE medicion_uso_mensaje_ia (
      tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      periodo     text NOT NULL CHECK (periodo ~ '^\\d{4}-\\d{2}$'),
      contador    integer NOT NULL DEFAULT 0 CHECK (contador >= 0),
      PRIMARY KEY (tenant_id, periodo)
    );

    CREATE OR REPLACE FUNCTION medicion_uso_actual(_tenant uuid, _periodo text)
    RETURNS TABLE(unidades_activas integer, mensajes_ia_mes integer, cuentas_canal integer)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT
        (SELECT count(*)::int FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id WHERE p.tenant_id = _tenant),
        (SELECT COALESCE(contador, 0) FROM medicion_uso_mensaje_ia WHERE tenant_id = _tenant AND periodo = _periodo),
        (SELECT count(*)::int FROM cuenta_canal WHERE tenant_id = _tenant)
    $$;
    GRANT EXECUTE ON FUNCTION medicion_uso_actual(uuid, text) TO app_rv;

    CREATE OR REPLACE FUNCTION medicion_incrementar_mensaje_ia(_tenant uuid, _periodo text, _cantidad integer DEFAULT 1)
    RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      INSERT INTO medicion_uso_mensaje_ia (tenant_id, periodo, contador)
      VALUES (_tenant, _periodo, _cantidad)
      ON CONFLICT (tenant_id, periodo) DO UPDATE SET contador = medicion_uso_mensaje_ia.contador + EXCLUDED.contador
    $$;
    GRANT EXECUTE ON FUNCTION medicion_incrementar_mensaje_ia(uuid, text, integer) TO app_rv;

    -- Alta de la suscripción de PRUEBA de un tenant recién creado, en la
    -- MISMA transacción sin sesión que onboarding_registrar_empresa
    -- (0121) -- mismo motivo: no existe todavía ninguna sesión RLS válida
    -- para ese tenant en el momento del registro self-serve.
    CREATE FUNCTION onboarding_crear_suscripcion_prueba(_tenant uuid, _plan_codigo text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_dias_prueba integer;
    BEGIN
      SELECT dias_prueba INTO v_dias_prueba FROM plan_facturacion WHERE codigo = _plan_codigo AND activo = true;
      IF v_dias_prueba IS NULL THEN
        RAISE EXCEPTION 'plan de facturación "%" no existe o no está activo', _plan_codigo USING ERRCODE = 'check_violation';
      END IF;
      INSERT INTO suscripcion_tenant (tenant_id, plan_codigo, estado, inicio_periodo_prueba_en, fin_periodo_prueba_en)
      VALUES (_tenant, _plan_codigo, 'prueba', now(), now() + (v_dias_prueba || ' days')::interval);
    END;
    $$;
    REVOKE ALL ON FUNCTION onboarding_crear_suscripcion_prueba(uuid, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION onboarding_crear_suscripcion_prueba(uuid, text) TO app_rv;

    -- Seed — BORRADOR COMERCIAL (ver comentario de cabecera de este
    -- archivo y de packages/domain/src/facturacion/planes.ts).
    INSERT INTO plan_facturacion (codigo, nombre, descripcion, escalones, add_ons, limite_unidades_activas, limite_mensajes_ia_mes, limite_cuentas_canal, dias_prueba)
    VALUES
      ('esencial', 'Esencial', 'Para gestoras con un portafolio pequeño empezando en Atiende.',
       '[{"hastaUnidades":5,"precioCentavosPorUnidad":3500},{"hastaUnidades":null,"precioCentavosPorUnidad":3000}]'::jsonb,
       '[{"codigo":"ia_conversacional_500","nombre":"IA conversacional — 500 mensajes/mes","precioCentavosMes":1500,"mensajesIncluidos":500}]'::jsonb,
       15, NULL, 3, 14),
      ('profesional', 'Profesional', 'Para gestoras en crecimiento con varios canales activos.',
       '[{"hastaUnidades":10,"precioCentavosPorUnidad":2800},{"hastaUnidades":30,"precioCentavosPorUnidad":2200},{"hastaUnidades":null,"precioCentavosPorUnidad":1800}]'::jsonb,
       '[{"codigo":"ia_conversacional_500","nombre":"IA conversacional — 500 mensajes/mes","precioCentavosMes":1500,"mensajesIncluidos":500},{"codigo":"ia_conversacional_2000","nombre":"IA conversacional — 2,000 mensajes/mes","precioCentavosMes":4500,"mensajesIncluidos":2000}]'::jsonb,
       75, NULL, 10, 14),
      ('portafolio', 'Portafolio', 'Para operadores establecidos con portafolios grandes — precio a la baja por volumen.',
       '[{"hastaUnidades":30,"precioCentavosPorUnidad":2000},{"hastaUnidades":100,"precioCentavosPorUnidad":1500},{"hastaUnidades":null,"precioCentavosPorUnidad":1000}]'::jsonb,
       '[{"codigo":"ia_conversacional_2000","nombre":"IA conversacional — 2,000 mensajes/mes","precioCentavosMes":4500,"mensajesIncluidos":2000},{"codigo":"ia_conversacional_ilimitada","nombre":"IA conversacional — ilimitada","precioCentavosMes":12000,"mensajesIncluidos":null}]'::jsonb,
       NULL, NULL, NULL, 14);
  `,
  down: `
    DROP FUNCTION IF EXISTS onboarding_crear_suscripcion_prueba(uuid, text);
    DROP FUNCTION IF EXISTS medicion_incrementar_mensaje_ia(uuid, text, integer);
    DROP FUNCTION IF EXISTS medicion_uso_actual(uuid, text);
    DROP TABLE IF EXISTS medicion_uso_mensaje_ia;
    DROP TABLE IF EXISTS suscripcion_tenant;
    DROP TABLE IF EXISTS plan_facturacion;
  `,
};

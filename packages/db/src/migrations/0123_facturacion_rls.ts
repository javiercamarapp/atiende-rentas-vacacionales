import type { Migracion } from "../runner/tipos.js";

// Lote 3.3: RLS de facturación + auditoría de suscripcion_tenant.
//
// `plan_facturacion` es un catálogo GLOBAL sin PII — lectura pública
// (incluida una sesión anónima/limpia, D-017: la página pública de
// precios, apps/web/src/pages/publica/precios, no exige login) pero
// ESCRITURA solo vía `facturacion_actualizar_plan()`, que revalida
// `rol_actual() = 'superadmin'` DENTRO de la función (defensa en
// profundidad: la ruta HTTP también exige el rol con `exigirRol`, nunca
// confía solo en el chequeo de aplicación).
export const migracion0123FacturacionRls: Migracion = {
  id: "0123_facturacion_rls",
  descripcion: "RLS de plan_facturacion/suscripcion_tenant/medicion_uso_mensaje_ia + auditoría",
  up: `
    ALTER TABLE plan_facturacion ENABLE ROW LEVEL SECURITY;
    ALTER TABLE plan_facturacion FORCE ROW LEVEL SECURITY;
    ALTER TABLE suscripcion_tenant ENABLE ROW LEVEL SECURITY;
    ALTER TABLE suscripcion_tenant FORCE ROW LEVEL SECURITY;
    ALTER TABLE medicion_uso_mensaje_ia ENABLE ROW LEVEL SECURITY;
    ALTER TABLE medicion_uso_mensaje_ia FORCE ROW LEVEL SECURITY;

    -- Catálogo público de solo lectura — sin excepción de rol/tenant.
    CREATE POLICY plan_facturacion_select ON plan_facturacion FOR SELECT USING (true);
    -- Ninguna política de escritura para app_rv a propósito: toda
    -- mutación pasa por facturacion_actualizar_plan() (SECURITY
    -- DEFINER), nunca un UPDATE/INSERT directo desde la ruta HTTP.

    CREATE POLICY suscripcion_tenant_select ON suscripcion_tenant FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora'));
    -- admin_gestora puede cambiar el plan/add-ons de SU PROPIO tenant
    -- (autoservicio, RV16); superadmin puede ajustar cualquier tenant
    -- desde backoffice. El webhook de Stripe (0124) actualiza estado/
    -- proveedor de pago vía una función SECURITY DEFINER aparte, no a
    -- través de esta política (un webhook no trae sesión de usuario).
    CREATE POLICY suscripcion_tenant_update ON suscripcion_tenant FOR UPDATE
      USING (rol_actual() = 'superadmin' OR (rol_actual() = 'admin_gestora' AND is_tenant_member(usuario_actual_id(), tenant_id)))
      WITH CHECK (rol_actual() = 'superadmin' OR (rol_actual() = 'admin_gestora' AND is_tenant_member(usuario_actual_id(), tenant_id)));

    CREATE POLICY medicion_uso_mensaje_ia_select ON medicion_uso_mensaje_ia FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora'));

    -- Auditoría (H-045) — solo en suscripcion_tenant: es la única de las
    -- tres tablas de este lote con impacto de negocio/financiero por
    -- fila (cambios de plan/estado). plan_facturacion (catálogo global,
    -- sin tenant_id) y medicion_uso_mensaje_ia (contador de alto
    -- volumen, sin valor de auditoría por incremento individual) quedan
    -- fuera a propósito.
    --
    -- NO reusa fn_auditoria_directa() (0013): esa función genérica hace
    -- COALESCE(NEW.id, OLD.id) para fila_id, y suscripcion_tenant NO
    -- tiene columna "id" — su PK es tenant_id (relación 1:1 real con
    -- tenant, sin necesidad de un uuid propio). Verificado con una
    -- prueba de integración real: usar el trigger genérico sin cambios
    -- fallaba en cada INSERT/UPDATE con
    -- 'record "new" has no field "id"'. Este trigger dedicado usa
    -- tenant_id como fila_id — identifica la fila igual de bien.
    CREATE OR REPLACE FUNCTION fn_auditoria_suscripcion_tenant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_previos jsonb;
      v_nuevos jsonb;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_previos := to_jsonb(OLD);
      END IF;
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_nuevos := to_jsonb(NEW);
      END IF;
      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES ('suscripcion_tenant', v_tenant, TG_OP, v_actor, v_tenant, v_previos, v_nuevos);
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER suscripcion_tenant_auditoria
      AFTER INSERT OR UPDATE OR DELETE ON suscripcion_tenant
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_suscripcion_tenant();

    -- Edición del catálogo — Superadmin únicamente, revalidado dentro de
    -- la función (defensa en profundidad respecto al chequeo de rol de la
    -- ruta HTTP). Reemplaza escalones/add_ons/límites completos (nunca un
    -- PATCH parcial silencioso de JSONB — la ruta HTTP envía el objeto
    -- completo ya validado por zod).
    CREATE FUNCTION facturacion_actualizar_plan(
      _codigo text,
      _nombre text,
      _descripcion text,
      _escalones jsonb,
      _add_ons jsonb,
      _limite_unidades_activas integer,
      _limite_mensajes_ia_mes integer,
      _limite_cuentas_canal integer,
      _dias_prueba integer,
      _activo boolean,
      _actualizado_por uuid
    ) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      -- IS DISTINCT FROM (no <>): verificado con una prueba de
      -- integración real que rol_actual() es NULL para cualquier sesión
      -- sin un usuario_id que exista/esté activo en usuario (incluida
      -- una sesión completamente anónima) — NULL <> 'superadmin'
      -- evalúa a NULL, e IF NULL THEN es SIEMPRE falso en PL/pgSQL, así
      -- que ese guard con <> fallaba ABIERTO (nunca lanzaba) para
      -- cualquier sesión sin identidad resuelta. IS DISTINCT FROM
      -- trata NULL como un valor real y comparable — fail-closed.
      IF rol_actual() IS DISTINCT FROM 'superadmin' THEN
        RAISE EXCEPTION 'solo Superadmin puede editar el catálogo de planes' USING ERRCODE = 'insufficient_privilege';
      END IF;
      UPDATE plan_facturacion SET
        nombre = _nombre,
        descripcion = _descripcion,
        escalones = _escalones,
        add_ons = _add_ons,
        limite_unidades_activas = _limite_unidades_activas,
        limite_mensajes_ia_mes = _limite_mensajes_ia_mes,
        limite_cuentas_canal = _limite_cuentas_canal,
        dias_prueba = _dias_prueba,
        activo = _activo,
        actualizado_en = now(),
        actualizado_por = _actualizado_por
      WHERE codigo = _codigo;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'plan "%" no existe' , _codigo USING ERRCODE = 'no_data_found';
      END IF;
    END;
    $$;
    REVOKE ALL ON FUNCTION facturacion_actualizar_plan(text, text, text, jsonb, jsonb, integer, integer, integer, integer, boolean, uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION facturacion_actualizar_plan(text, text, text, jsonb, jsonb, integer, integer, integer, integer, boolean, uuid) TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS facturacion_actualizar_plan(text, text, text, jsonb, jsonb, integer, integer, integer, integer, boolean, uuid);
    DROP TRIGGER IF EXISTS suscripcion_tenant_auditoria ON suscripcion_tenant;
    DROP FUNCTION IF EXISTS fn_auditoria_suscripcion_tenant();
    DROP POLICY IF EXISTS medicion_uso_mensaje_ia_select ON medicion_uso_mensaje_ia;
    DROP POLICY IF EXISTS suscripcion_tenant_update ON suscripcion_tenant;
    DROP POLICY IF EXISTS suscripcion_tenant_select ON suscripcion_tenant;
    DROP POLICY IF EXISTS plan_facturacion_select ON plan_facturacion;
  `,
};

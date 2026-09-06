import type { Migracion } from "../runner/tipos.js";

// H-045: triggers reales sobre `auditoria_mutacion` (esqueleto de la
// migración 0008, que esta migración no edita). Captura quién
// (`app.user_id`, seteado por apps/api en cada transacción, ver
// apps/api/src/db/contexto.ts), cuándo (`now()` por defecto de la propia
// tabla), qué (tabla + fila + operación) y antes/después — SIN columnas
// sensibles: `usuario.email`/`usuario.password_hash` se excluyen
// explícitamente del JSON auditado (§RV19/21-7: "antes/después sin PII
// sensible" aplica también a la propia tabla de auditoría, no solo a logs
// de texto).
//
// Nota de coordinación entre lotes: el trigger de auditoría sobre
// `cuenta_canal` (tabla creada por el Lote 2 en la migración 0020, que
// corre DESPUÉS de este rango 0010-0019) vive en una migración posterior
// numerada fuera de este rango — ver
// `0090_auditoria_trigger_cuenta_canal.ts` — precisamente porque no puede
// crear un trigger sobre una tabla que todavía no existe en este punto del
// catálogo. `fn_auditoria_directa()` (definida aquí) ya excluye por nombre
// las columnas de cifrado (`credenciales_cifradas`/`_iv`/`_tag`) aunque
// esta migración no las cree todavía, para no tener que volver a tocar
// este archivo cuando ese trigger se active.
//
// También añade el valor `ACCESO_ROMPER_CRISTAL` al CHECK de `operacion`
// (H-045: acceso de Superadmin a datos de un tenant ajeno, insertado desde
// la capa de aplicación —apps/api/src/middleware/tenant.ts— nunca desde un
// trigger, porque no hay una fila mutada que dispare un trigger en un
// simple SELECT).
export const migracion0013AuditoriaTriggers: Migracion = {
  id: "0013_auditoria_triggers",
  descripcion: "triggers de auditoría en ocupacion_unidad/usuario + acceso romper cristal",
  up: `
    ALTER TABLE auditoria_mutacion DROP CONSTRAINT IF EXISTS auditoria_mutacion_operacion_check;
    ALTER TABLE auditoria_mutacion ADD CONSTRAINT auditoria_mutacion_operacion_check CHECK (
      operacion IN ('INSERT', 'UPDATE', 'DELETE', 'ACCESO_ROMPER_CRISTAL')
    );

    -- Trigger genérico para tablas con columna tenant_id directa.
    CREATE OR REPLACE FUNCTION fn_auditoria_directa() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_previos jsonb;
      v_nuevos jsonb;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      IF TG_OP = 'DELETE' THEN
        v_tenant := OLD.tenant_id;
      ELSE
        v_tenant := NEW.tenant_id;
      END IF;

      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_previos := to_jsonb(OLD) - 'password_hash' - 'email'
          - 'credenciales_cifradas' - 'credenciales_iv' - 'credenciales_tag';
      END IF;
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_nuevos := to_jsonb(NEW) - 'password_hash' - 'email'
          - 'credenciales_cifradas' - 'credenciales_iv' - 'credenciales_tag';
      END IF;

      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        v_actor,
        v_tenant,
        v_previos,
        v_nuevos
      );

      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    -- "ocupacion_unidad" no tiene tenant_id directo: se deriva vía
    -- unidad → propiedad. Sin PII de huésped (huesped_minimo_id es solo un
    -- identificador, no el nombre/contacto en sí).
    CREATE OR REPLACE FUNCTION fn_auditoria_ocupacion_unidad() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_unidad uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_unidad := COALESCE(NEW.unidad_id, OLD.unidad_id);
      SELECT p.tenant_id INTO v_tenant
      FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id
      WHERE u.id = v_unidad;

      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        v_actor,
        v_tenant,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );

      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER auditoria_usuario
      AFTER INSERT OR UPDATE OR DELETE ON usuario
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_directa();

    CREATE TRIGGER auditoria_ocupacion_unidad
      AFTER INSERT OR UPDATE OR DELETE ON ocupacion_unidad
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_ocupacion_unidad();
  `,
  down: `
    DROP TRIGGER IF EXISTS auditoria_ocupacion_unidad ON ocupacion_unidad;
    DROP TRIGGER IF EXISTS auditoria_usuario ON usuario;
    DROP FUNCTION IF EXISTS fn_auditoria_ocupacion_unidad();
    DROP FUNCTION IF EXISTS fn_auditoria_directa();
    ALTER TABLE auditoria_mutacion DROP CONSTRAINT IF EXISTS auditoria_mutacion_operacion_check;
    ALTER TABLE auditoria_mutacion ADD CONSTRAINT auditoria_mutacion_operacion_check CHECK (
      operacion IN ('INSERT', 'UPDATE', 'DELETE')
    );
  `,
};

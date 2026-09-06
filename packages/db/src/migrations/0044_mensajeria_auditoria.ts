import type { Migracion } from "../runner/tipos.js";

// Triggers de auditoría (DEFINICION-DE-HECHO §2.1) sobre `mensaje` y
// `borrador_mensaje` — la superficie de mayor impacto de este lote:
// "auditoría de cada envío" (LOTES.md Lote 6) exige poder reconstruir,
// fila por fila, quién aprobó/rechazó cada borrador y cuándo un mensaje
// saliente realmente se insertó.
//
// Decisión explícita sobre PII (RV10-R-08, minimización): esta tabla de
// AUDITORÍA SÍ conserva el texto completo del mensaje/borrador — es la
// única forma de que "auditoría de cada envío" sea verificable (qué se
// aprobó exactamente), y `auditoria_mutacion` ya hereda las mismas
// políticas de acceso restringidas de RLS de Lote 3 (solo roles con
// permiso de mensajería/superadmin). Lo que SÍ está prohibido, y se aplica
// en la capa de aplicación (apps/api, nunca aquí), es que cualquier LÍNEA
// DE LOG de consola/archivo contenga el texto crudo — ver
// `apps/api/src/routes/mensajeria/logSinPii.ts`.
export const migracion0044MensajeriaAuditoria: Migracion = {
  id: "0044_mensajeria_auditoria",
  descripcion: "triggers de auditoría: mensaje + borrador_mensaje",
  up: `
    CREATE OR REPLACE FUNCTION fn_auditoria_mensaje() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_conversacion uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_conversacion := COALESCE(NEW.conversacion_id, OLD.conversacion_id);
      SELECT unidad_tenant_id(c.unidad_id) INTO v_tenant FROM conversacion c WHERE c.id = v_conversacion;

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

    CREATE TRIGGER auditoria_mensaje
      AFTER INSERT OR UPDATE OR DELETE ON mensaje
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_mensaje();

    CREATE TRIGGER auditoria_borrador_mensaje
      AFTER INSERT OR UPDATE OR DELETE ON borrador_mensaje
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_mensaje();
  `,
  down: `
    DROP TRIGGER IF EXISTS auditoria_borrador_mensaje ON borrador_mensaje;
    DROP TRIGGER IF EXISTS auditoria_mensaje ON mensaje;
    DROP FUNCTION IF EXISTS fn_auditoria_mensaje();
  `,
};

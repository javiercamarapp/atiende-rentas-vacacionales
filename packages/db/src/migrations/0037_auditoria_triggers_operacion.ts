import type { Migracion } from "../runner/tipos.js";

// Triggers de auditoría (DEFINICION-DE-HECHO §2.1) sobre las dos tablas de
// mayor impacto de Lote 5: `tarea_operativa` (estado/asignación) e
// `incidencia_mantenimiento` (la confirmación de bloqueo de mantenimiento,
// H-055, es la mutación más sensible de todo el lote — requiere rastro
// explícito de quién/cuándo). Ninguna tiene `tenant_id` directo: se deriva
// vía `unidad_id → propiedad`, mismo patrón que
// `fn_auditoria_ocupacion_unidad` (migración 0013, no editada aquí).
export const migracion0037AuditoriaTriggersOperacion: Migracion = {
  id: "0037_auditoria_triggers_operacion",
  descripcion: "triggers de auditoría: tarea_operativa + incidencia_mantenimiento",
  up: `
    CREATE OR REPLACE FUNCTION fn_auditoria_tarea_operativa() RETURNS trigger
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

    CREATE TRIGGER auditoria_tarea_operativa
      AFTER INSERT OR UPDATE OR DELETE ON tarea_operativa
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_tarea_operativa();

    CREATE TRIGGER auditoria_incidencia_mantenimiento
      AFTER INSERT OR UPDATE OR DELETE ON incidencia_mantenimiento
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_tarea_operativa();
  `,
  down: `
    DROP TRIGGER IF EXISTS auditoria_incidencia_mantenimiento ON incidencia_mantenimiento;
    DROP TRIGGER IF EXISTS auditoria_tarea_operativa ON tarea_operativa;
    DROP FUNCTION IF EXISTS fn_auditoria_tarea_operativa();
  `,
};

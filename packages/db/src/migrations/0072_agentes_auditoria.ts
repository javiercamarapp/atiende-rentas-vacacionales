import type { Migracion } from "../runner/tipos.js";

// H-080 (§Auditoría-1): trigger de auditoría sobre `agente_cuota_tenant`.
// NO reutiliza `fn_auditoria_directa()` (0013) porque esa función asume
// `NEW.id`/`OLD.id` como llave de fila (`COALESCE(NEW.id, OLD.id)`), y
// `agente_cuota_tenant` usa `tenant_id` como PK propia (una fila por
// tenant, sin columna `id` separada) — de ahí la función dedicada, que usa
// `tenant_id` como `fila_id`. `agente_tool_call_log` NO lleva trigger de
// auditoría propio: la propia tabla ES el registro de auditoría exigido
// por H-080 (auditar la auditoría duplicaría el mismo dato dos veces sin
// valor adicional) — es append-only por diseño de RLS (migración 0071, sin
// política de UPDATE/DELETE), que es la garantía real de integridad aquí.
export const migracion0072AgentesAuditoria: Migracion = {
  id: "0072_agentes_auditoria",
  descripcion: "trigger de auditoría en agente_cuota_tenant",
  up: `
    CREATE OR REPLACE FUNCTION fn_auditoria_agente_cuota_tenant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME, v_tenant, TG_OP, v_actor, v_tenant,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER auditoria_agente_cuota_tenant
      AFTER INSERT OR UPDATE OR DELETE ON agente_cuota_tenant
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_agente_cuota_tenant();
  `,
  down: `
    DROP TRIGGER IF EXISTS auditoria_agente_cuota_tenant ON agente_cuota_tenant;
    DROP FUNCTION IF EXISTS fn_auditoria_agente_cuota_tenant();
  `,
};

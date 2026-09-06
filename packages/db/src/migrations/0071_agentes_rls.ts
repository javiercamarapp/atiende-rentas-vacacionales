import type { Migracion } from "../runner/tipos.js";

// H-079/H-080 (D-020, DEFINICION-DE-HECHO §3.4): ENABLE/FORCE ROW LEVEL
// SECURITY sobre las dos tablas de Lote 9. Reutiliza los helpers
// `SECURITY DEFINER` ya existentes de 0014 (`is_tenant_member`,
// `usuario_actual_id`, `rol_actual`) — no se necesitan funciones nuevas
// porque ambas tablas tienen `tenant_id` directo.
//
// Regla de acceso: `contador`/`limpieza`/`propietario` NUNCA ven la
// trazabilidad de IA ni el presupuesto (no son quienes invocan tools de
// agente en este catálogo, ver `packages/domain/agentes/catalogo.ts`);
// `superadmin`/`admin_gestora`/`operador` (cualquier nivel de colaborador,
// incluido `solo_calendario` — puede seguir viendo el panel de "gasto de
// IA este mes" aunque no invoque tools) pueden LEER ambas tablas de su
// propio tenant. La escritura (reservar/liquidar cuota, insertar traza) la
// hace siempre el propio servidor en nombre del actor que disparó la
// ronda — se permite INSERT/UPDATE a cualquier miembro del tenant que
// pueda invocar AL MENOS una tool (mismo conjunto que puede leer, salvo
// que la escritura real la dispara la ronda de ese mismo actor).
export const migracion0071AgentesRls: Migracion = {
  id: "0071_agentes_rls",
  descripcion: "RLS: agente_cuota_tenant / agente_tool_call_log",
  up: `
    ALTER TABLE agente_cuota_tenant ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agente_cuota_tenant FORCE ROW LEVEL SECURITY;
    ALTER TABLE agente_tool_call_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agente_tool_call_log FORCE ROW LEVEL SECURITY;

    CREATE POLICY agente_cuota_tenant_select ON agente_cuota_tenant FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
      );
    CREATE POLICY agente_cuota_tenant_insert ON agente_cuota_tenant FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora')
      );
    CREATE POLICY agente_cuota_tenant_update ON agente_cuota_tenant FOR UPDATE
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
      );

    CREATE POLICY agente_tool_call_log_select ON agente_tool_call_log FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
      );
    CREATE POLICY agente_tool_call_log_insert ON agente_tool_call_log FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
        AND actor_id = usuario_actual_id()
      );
    -- Append-only: ninguna política de UPDATE/DELETE — la trazabilidad
    -- nunca se modifica ni se borra desde la capa de aplicación (mismo
    -- principio que auditoria_mutacion, migración 0008/0013).
  `,
  down: `
    DROP POLICY IF EXISTS agente_tool_call_log_insert ON agente_tool_call_log;
    DROP POLICY IF EXISTS agente_tool_call_log_select ON agente_tool_call_log;
    DROP POLICY IF EXISTS agente_cuota_tenant_update ON agente_cuota_tenant;
    DROP POLICY IF EXISTS agente_cuota_tenant_insert ON agente_cuota_tenant;
    DROP POLICY IF EXISTS agente_cuota_tenant_select ON agente_cuota_tenant;

    ALTER TABLE agente_tool_call_log NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE agente_tool_call_log DISABLE ROW LEVEL SECURITY;
    ALTER TABLE agente_cuota_tenant NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE agente_cuota_tenant DISABLE ROW LEVEL SECURITY;
  `,
};

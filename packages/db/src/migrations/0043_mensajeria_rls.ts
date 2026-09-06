import type { Migracion } from "../runner/tipos.js";

// RLS de mensajería (D-020, DEFINICION-DE-HECHO §3.4): regla explícita del
// encargo — SOLO operador (con colaborador_nivel <> 'solo_calendario') y
// admin_gestora/superadmin del tenant pueden ver/gestionar mensajería;
// propietario y limpieza NO tienen ninguna política (FORCE RLS + sin
// política aplicable = deny-by-default, mismo patrón que la brecha
// documentada de "contador sin acceso a calendario" en la migración 0015).
// `colaborador_nivel = 'calendario_mensajeria'` (0010) es precisamente el
// nivel intermedio de coanfitrión que sí incluye mensajería — ya cubierto
// por `colaborador_nivel_actual() <> 'solo_calendario'` (mismo criterio
// reutilizado de 0036, sin duplicar la lista de niveles).
//
// Funciones helper `SECURITY DEFINER` nuevas: derivan `unidad_id` desde
// `conversacion_id` para que las tablas hijas (mensaje, borrador_mensaje,
// mensaje_programado) compongan con `unidad_tenant_id` (0014) sin
// duplicar el join.
export const migracion0043MensajeriaRls: Migracion = {
  id: "0043_mensajeria_rls",
  descripcion: "RLS: conversacion/mensaje/plantilla/borrador/programado/señal de escalamiento",
  up: `
    CREATE OR REPLACE FUNCTION conversacion_unidad_id(_conversacion uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT unidad_id FROM conversacion WHERE id = _conversacion
    $$;

    CREATE OR REPLACE FUNCTION mensaje_unidad_id(_mensaje uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT c.unidad_id FROM mensaje m JOIN conversacion c ON c.id = m.conversacion_id WHERE m.id = _mensaje
    $$;

    CREATE OR REPLACE FUNCTION borrador_mensaje_unidad_id(_borrador uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT c.unidad_id FROM borrador_mensaje b JOIN conversacion c ON c.id = b.conversacion_id WHERE b.id = _borrador
    $$;

    CREATE OR REPLACE FUNCTION mensaje_programado_unidad_id(_programado uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT c.unidad_id FROM mensaje_programado mp JOIN conversacion c ON c.id = mp.conversacion_id WHERE mp.id = _programado
    $$;

    GRANT EXECUTE ON FUNCTION conversacion_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION mensaje_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION borrador_mensaje_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION mensaje_programado_unidad_id(uuid) TO app_rv;

    ALTER TABLE conversacion ENABLE ROW LEVEL SECURITY;
    ALTER TABLE conversacion FORCE ROW LEVEL SECURITY;
    ALTER TABLE mensaje ENABLE ROW LEVEL SECURITY;
    ALTER TABLE mensaje FORCE ROW LEVEL SECURITY;
    ALTER TABLE plantilla_mensaje ENABLE ROW LEVEL SECURITY;
    ALTER TABLE plantilla_mensaje FORCE ROW LEVEL SECURITY;
    ALTER TABLE mensaje_programado ENABLE ROW LEVEL SECURITY;
    ALTER TABLE mensaje_programado FORCE ROW LEVEL SECURITY;
    ALTER TABLE borrador_mensaje ENABLE ROW LEVEL SECURITY;
    ALTER TABLE borrador_mensaje FORCE ROW LEVEL SECURITY;
    ALTER TABLE senal_escalamiento ENABLE ROW LEVEL SECURITY;
    ALTER TABLE senal_escalamiento FORCE ROW LEVEL SECURITY;

    -- conversacion: solo operador(no solo_calendario)/admin_gestora/superadmin.
    CREATE POLICY conversacion_select ON conversacion FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY conversacion_escritura ON conversacion FOR ALL
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );

    -- mensaje
    CREATE POLICY mensaje_select ON mensaje FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY mensaje_insert ON mensaje FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );

    -- plantilla_mensaje (tenant_id directo)
    CREATE POLICY plantilla_mensaje_select ON plantilla_mensaje FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    -- Solo admin/superadmin pueden crear/editar/aprobar plantillas (H-056:
    -- "aprobadas por el tenant" implica un rol de gestión, no cualquier
    -- operador de mensajería del día a día).
    CREATE POLICY plantilla_mensaje_escritura ON plantilla_mensaje FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    -- mensaje_programado
    CREATE POLICY mensaje_programado_select ON mensaje_programado FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(mensaje_programado_unidad_id(id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY mensaje_programado_escritura ON mensaje_programado FOR ALL
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );

    -- borrador_mensaje: la cola de aprobación humana en sí. El UPDATE que
    -- aprueba/rechaza pasa por esta misma política (no hay un rol
    -- "aprobador" distinto de admin/operador con mensajería — la
    -- restricción de QUIÉN puede aprobar más allá del tenant es de
    -- aplicación, no de RLS, igual que en otras colas de este producto).
    CREATE POLICY borrador_mensaje_select ON borrador_mensaje FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY borrador_mensaje_insert ON borrador_mensaje FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY borrador_mensaje_update ON borrador_mensaje FOR UPDATE
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );

    -- senal_escalamiento (a través de mensaje → conversacion)
    CREATE POLICY senal_escalamiento_select ON senal_escalamiento FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(mensaje_unidad_id(mensaje_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY senal_escalamiento_insert ON senal_escalamiento FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(mensaje_unidad_id(mensaje_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
  `,
  down: `
    DROP POLICY IF EXISTS senal_escalamiento_insert ON senal_escalamiento;
    DROP POLICY IF EXISTS senal_escalamiento_select ON senal_escalamiento;
    DROP POLICY IF EXISTS borrador_mensaje_update ON borrador_mensaje;
    DROP POLICY IF EXISTS borrador_mensaje_insert ON borrador_mensaje;
    DROP POLICY IF EXISTS borrador_mensaje_select ON borrador_mensaje;
    DROP POLICY IF EXISTS mensaje_programado_escritura ON mensaje_programado;
    DROP POLICY IF EXISTS mensaje_programado_select ON mensaje_programado;
    DROP POLICY IF EXISTS plantilla_mensaje_escritura ON plantilla_mensaje;
    DROP POLICY IF EXISTS plantilla_mensaje_select ON plantilla_mensaje;
    DROP POLICY IF EXISTS mensaje_insert ON mensaje;
    DROP POLICY IF EXISTS mensaje_select ON mensaje;
    DROP POLICY IF EXISTS conversacion_escritura ON conversacion;
    DROP POLICY IF EXISTS conversacion_select ON conversacion;

    ALTER TABLE senal_escalamiento NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE senal_escalamiento DISABLE ROW LEVEL SECURITY;
    ALTER TABLE borrador_mensaje NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE borrador_mensaje DISABLE ROW LEVEL SECURITY;
    ALTER TABLE mensaje_programado NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE mensaje_programado DISABLE ROW LEVEL SECURITY;
    ALTER TABLE plantilla_mensaje NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE plantilla_mensaje DISABLE ROW LEVEL SECURITY;
    ALTER TABLE mensaje NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE mensaje DISABLE ROW LEVEL SECURITY;
    ALTER TABLE conversacion NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE conversacion DISABLE ROW LEVEL SECURITY;

    DROP FUNCTION IF EXISTS mensaje_programado_unidad_id(uuid);
    DROP FUNCTION IF EXISTS borrador_mensaje_unidad_id(uuid);
    DROP FUNCTION IF EXISTS mensaje_unidad_id(uuid);
    DROP FUNCTION IF EXISTS conversacion_unidad_id(uuid);
  `,
};

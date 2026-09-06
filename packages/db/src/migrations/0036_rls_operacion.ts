import type { Migracion } from "../runner/tipos.js";

// H-049 a H-055 (D-020, DEFINICION-DE-HECHO §3.4): ENABLE/FORCE ROW LEVEL
// SECURITY + políticas por rol sobre todas las tablas de operación de
// Lote 5. Regla explícita del encargo: el rol `limpieza` SOLO ve/gestiona
// las tareas que tiene asignadas (nunca "todo el tenant"); operador/admin ven
// todo su tenant (salvo el nivel `solo_calendario`, que sigue sin acceso de
// escritura, igual que en calendario, migración 0015); propietario tiene
// SOLO LECTURA de la operación de sus propias unidades — nunca escritura,
// cerrando la brecha documentada en `packages/db/test/integration/rls.test.ts`
// ("limpieza no ve ninguna fila operativa de calendario ... sin tabla de
// tareas aún, Lote 5" — con estas tablas, `limpieza` sigue sin ver
// `unidad`/`ocupacion_unidad` directamente, pero SÍ ve su propia tarea).
//
// Funciones helper `SECURITY DEFINER` nuevas (mismo patrón que 0014, sin
// editar ese archivo): derivan `unidad_id`/`asignado_a`/`reportado_por` a
// partir de una fila de las tablas nuevas, para que las políticas puedan
// componerse con `unidad_tenant_id`/`unidad_owner_id` (0014) sin duplicar
// esa lógica.
export const migracion0036RlsOperacion: Migracion = {
  id: "0036_rls_operacion",
  descripcion: "RLS: tarea_operativa/checklist/incidencia/inventario/configuración operativa",
  up: `
    CREATE OR REPLACE FUNCTION tarea_operativa_unidad_id(_tarea uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT unidad_id FROM tarea_operativa WHERE id = _tarea
    $$;

    CREATE OR REPLACE FUNCTION tarea_operativa_asignado_a(_tarea uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT asignado_a FROM tarea_operativa WHERE id = _tarea
    $$;

    CREATE OR REPLACE FUNCTION incidencia_mantenimiento_unidad_id(_incidencia uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT unidad_id FROM incidencia_mantenimiento WHERE id = _incidencia
    $$;

    CREATE OR REPLACE FUNCTION incidencia_mantenimiento_reportado_por(_incidencia uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT reportado_por FROM incidencia_mantenimiento WHERE id = _incidencia
    $$;

    GRANT EXECUTE ON FUNCTION tarea_operativa_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION tarea_operativa_asignado_a(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION incidencia_mantenimiento_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION incidencia_mantenimiento_reportado_por(uuid) TO app_rv;

    ALTER TABLE tarea_operativa ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tarea_operativa FORCE ROW LEVEL SECURITY;
    ALTER TABLE checklist_item_tarea ENABLE ROW LEVEL SECURITY;
    ALTER TABLE checklist_item_tarea FORCE ROW LEVEL SECURITY;
    ALTER TABLE foto_checklist_item ENABLE ROW LEVEL SECURITY;
    ALTER TABLE foto_checklist_item FORCE ROW LEVEL SECURITY;
    ALTER TABLE incidencia_mantenimiento ENABLE ROW LEVEL SECURITY;
    ALTER TABLE incidencia_mantenimiento FORCE ROW LEVEL SECURITY;
    ALTER TABLE foto_incidencia ENABLE ROW LEVEL SECURITY;
    ALTER TABLE foto_incidencia FORCE ROW LEVEL SECURITY;
    ALTER TABLE item_inventario ENABLE ROW LEVEL SECURITY;
    ALTER TABLE item_inventario FORCE ROW LEVEL SECURITY;
    ALTER TABLE movimiento_inventario ENABLE ROW LEVEL SECURITY;
    ALTER TABLE movimiento_inventario FORCE ROW LEVEL SECURITY;
    ALTER TABLE configuracion_operativa_propiedad ENABLE ROW LEVEL SECURITY;
    ALTER TABLE configuracion_operativa_propiedad FORCE ROW LEVEL SECURITY;
    ALTER TABLE notificacion_tarea ENABLE ROW LEVEL SECURITY;
    ALTER TABLE notificacion_tarea FORCE ROW LEVEL SECURITY;
    ALTER TABLE outbox_evento_consumido_limpieza ENABLE ROW LEVEL SECURITY;
    ALTER TABLE outbox_evento_consumido_limpieza FORCE ROW LEVEL SECURITY;

    -- tarea_operativa
    CREATE POLICY tarea_operativa_select ON tarea_operativa FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND asignado_a = usuario_actual_id())
          OR (rol_actual() = 'propietario' AND unidad_owner_id(unidad_id) = owner_actual())
        )
      );
    CREATE POLICY tarea_operativa_insert ON tarea_operativa FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (rol_actual() IN ('superadmin', 'admin_gestora')
             OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario'))
      );
    CREATE POLICY tarea_operativa_update ON tarea_operativa FOR UPDATE
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND asignado_a = usuario_actual_id())
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND asignado_a = usuario_actual_id())
        )
      );
    CREATE POLICY tarea_operativa_delete ON tarea_operativa FOR DELETE
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    -- checklist_item_tarea (misma visibilidad/escritura que su tarea)
    CREATE POLICY checklist_item_tarea_select ON checklist_item_tarea FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(tarea_operativa_unidad_id(tarea_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND tarea_operativa_asignado_a(tarea_id) = usuario_actual_id())
          OR (rol_actual() = 'propietario' AND unidad_owner_id(tarea_operativa_unidad_id(tarea_id)) = owner_actual())
        )
      );
    CREATE POLICY checklist_item_tarea_escritura ON checklist_item_tarea FOR ALL
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(tarea_operativa_unidad_id(tarea_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND tarea_operativa_asignado_a(tarea_id) = usuario_actual_id())
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(tarea_operativa_unidad_id(tarea_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND tarea_operativa_asignado_a(tarea_id) = usuario_actual_id())
        )
      );

    -- foto_checklist_item (a través de checklist_item_tarea.tarea_id)
    CREATE POLICY foto_checklist_item_select ON foto_checklist_item FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM checklist_item_tarea c WHERE c.id = foto_checklist_item.checklist_item_id
        )
      );
    CREATE POLICY foto_checklist_item_escritura ON foto_checklist_item FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM checklist_item_tarea c
          WHERE c.id = foto_checklist_item.checklist_item_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(tarea_operativa_unidad_id(c.tarea_id)))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND tarea_operativa_asignado_a(c.tarea_id) = usuario_actual_id())
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM checklist_item_tarea c
          WHERE c.id = foto_checklist_item.checklist_item_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(tarea_operativa_unidad_id(c.tarea_id)))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND tarea_operativa_asignado_a(c.tarea_id) = usuario_actual_id())
            )
        )
      );

    -- incidencia_mantenimiento: limpieza solo ve/reporta LAS SUYAS.
    CREATE POLICY incidencia_mantenimiento_select ON incidencia_mantenimiento FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND reportado_por = usuario_actual_id())
          OR (rol_actual() = 'propietario' AND unidad_owner_id(unidad_id) = owner_actual())
        )
      );
    CREATE POLICY incidencia_mantenimiento_insert ON incidencia_mantenimiento FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND reportado_por = usuario_actual_id())
        )
      );
    -- La confirmación de bloqueo (H-055) exige rol con permiso de escritura
    -- de calendario — nunca 'limpieza' (solo puede reportar, no confirmar).
    CREATE POLICY incidencia_mantenimiento_update ON incidencia_mantenimiento FOR UPDATE
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (rol_actual() IN ('superadmin', 'admin_gestora')
             OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario'))
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (rol_actual() IN ('superadmin', 'admin_gestora')
             OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario'))
      );
    CREATE POLICY incidencia_mantenimiento_delete ON incidencia_mantenimiento FOR DELETE
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    -- foto_incidencia
    CREATE POLICY foto_incidencia_select ON foto_incidencia FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM incidencia_mantenimiento i
          WHERE i.id = foto_incidencia.incidencia_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(i.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND i.reportado_por = usuario_actual_id())
              OR (rol_actual() = 'propietario' AND unidad_owner_id(i.unidad_id) = owner_actual())
            )
        )
      );
    CREATE POLICY foto_incidencia_insert ON foto_incidencia FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM incidencia_mantenimiento i
          WHERE i.id = foto_incidencia.incidencia_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(i.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND i.reportado_por = usuario_actual_id())
            )
        )
      );

    -- item_inventario / movimiento_inventario: limpieza solo si tiene una
    -- tarea activa asignada en esa unidad (necesario para el descuento
    -- automático al completar checklist, H-052).
    CREATE POLICY item_inventario_select ON item_inventario FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
          OR (rol_actual() = 'propietario' AND unidad_owner_id(unidad_id) = owner_actual())
          OR (rol_actual() = 'limpieza' AND EXISTS (
                SELECT 1 FROM tarea_operativa t
                WHERE t.unidad_id = item_inventario.unidad_id
                  AND t.asignado_a = usuario_actual_id()
                  AND t.estado NOT IN ('completada', 'cancelada')
              ))
        )
      );
    CREATE POLICY item_inventario_escritura ON item_inventario FOR ALL
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND EXISTS (
                SELECT 1 FROM tarea_operativa t
                WHERE t.unidad_id = item_inventario.unidad_id
                  AND t.asignado_a = usuario_actual_id()
                  AND t.estado NOT IN ('completada', 'cancelada')
              ))
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND EXISTS (
                SELECT 1 FROM tarea_operativa t
                WHERE t.unidad_id = item_inventario.unidad_id
                  AND t.asignado_a = usuario_actual_id()
                  AND t.estado NOT IN ('completada', 'cancelada')
              ))
        )
      );

    CREATE POLICY movimiento_inventario_select ON movimiento_inventario FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM item_inventario it
          WHERE it.id = movimiento_inventario.item_inventario_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(it.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
              OR (rol_actual() = 'propietario' AND unidad_owner_id(it.unidad_id) = owner_actual())
              OR (rol_actual() = 'limpieza' AND EXISTS (
                    SELECT 1 FROM tarea_operativa t
                    WHERE t.unidad_id = it.unidad_id AND t.asignado_a = usuario_actual_id()
                      AND t.estado NOT IN ('completada', 'cancelada')
                  ))
            )
        )
      );
    CREATE POLICY movimiento_inventario_insert ON movimiento_inventario FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM item_inventario it
          WHERE it.id = movimiento_inventario.item_inventario_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(it.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND EXISTS (
                    SELECT 1 FROM tarea_operativa t
                    WHERE t.unidad_id = it.unidad_id AND t.asignado_a = usuario_actual_id()
                      AND t.estado NOT IN ('completada', 'cancelada')
                  ))
            )
        )
      );

    -- configuracion_operativa_propiedad
    CREATE POLICY configuracion_operativa_propiedad_select ON configuracion_operativa_propiedad FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id))
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador', 'propietario')
      );
    CREATE POLICY configuracion_operativa_propiedad_escritura ON configuracion_operativa_propiedad FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id)));

    -- notificacion_tarea (misma visibilidad que la tarea; escritura = quien puede escribir tareas)
    CREATE POLICY notificacion_tarea_select ON notificacion_tarea FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM tarea_operativa t
          WHERE t.id = notificacion_tarea.tarea_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(t.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND t.asignado_a = usuario_actual_id())
            )
        )
      );
    CREATE POLICY notificacion_tarea_insert ON notificacion_tarea FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM tarea_operativa t
          WHERE t.id = notificacion_tarea.tarea_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(t.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              -- El propio personal de limpieza dispara el evento
              -- 'completada' al completar su tarea (aplicacion/tareas.ts);
              -- solo puede notificar sobre su PROPIA tarea asignada.
              OR (rol_actual() = 'limpieza' AND t.asignado_a = usuario_actual_id())
            )
        )
      );

    -- outbox_evento_consumido_limpieza: cola interna del consumidor de este
    -- lote. SELECT visible a superadmin y a quien puede escribir calendario
    -- (el mismo rol que dispara el procesamiento manual del checkout) —
    -- necesario para que el propio INSERT ... ON CONFLICT (outbox_evento_id)
    -- DO NOTHING del consumidor pueda evaluar el conflicto sin ser
    -- rechazado por RLS al no tener ninguna política de lectura aplicable.
    CREATE POLICY outbox_evento_consumido_limpieza_select ON outbox_evento_consumido_limpieza FOR SELECT
      USING (
        rol_actual() = 'superadmin'
        OR rol_actual() = 'admin_gestora'
        OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
      );
    CREATE POLICY outbox_evento_consumido_limpieza_insert ON outbox_evento_consumido_limpieza FOR INSERT
      WITH CHECK (
        rol_actual() IN ('superadmin', 'admin_gestora')
        OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
      );
  `,
  down: `
    DROP POLICY IF EXISTS outbox_evento_consumido_limpieza_insert ON outbox_evento_consumido_limpieza;
    DROP POLICY IF EXISTS outbox_evento_consumido_limpieza_select ON outbox_evento_consumido_limpieza;
    DROP POLICY IF EXISTS notificacion_tarea_insert ON notificacion_tarea;
    DROP POLICY IF EXISTS notificacion_tarea_select ON notificacion_tarea;
    DROP POLICY IF EXISTS configuracion_operativa_propiedad_escritura ON configuracion_operativa_propiedad;
    DROP POLICY IF EXISTS configuracion_operativa_propiedad_select ON configuracion_operativa_propiedad;
    DROP POLICY IF EXISTS movimiento_inventario_insert ON movimiento_inventario;
    DROP POLICY IF EXISTS movimiento_inventario_select ON movimiento_inventario;
    DROP POLICY IF EXISTS item_inventario_escritura ON item_inventario;
    DROP POLICY IF EXISTS item_inventario_select ON item_inventario;
    DROP POLICY IF EXISTS foto_incidencia_insert ON foto_incidencia;
    DROP POLICY IF EXISTS foto_incidencia_select ON foto_incidencia;
    DROP POLICY IF EXISTS incidencia_mantenimiento_delete ON incidencia_mantenimiento;
    DROP POLICY IF EXISTS incidencia_mantenimiento_update ON incidencia_mantenimiento;
    DROP POLICY IF EXISTS incidencia_mantenimiento_insert ON incidencia_mantenimiento;
    DROP POLICY IF EXISTS incidencia_mantenimiento_select ON incidencia_mantenimiento;
    DROP POLICY IF EXISTS foto_checklist_item_escritura ON foto_checklist_item;
    DROP POLICY IF EXISTS foto_checklist_item_select ON foto_checklist_item;
    DROP POLICY IF EXISTS checklist_item_tarea_escritura ON checklist_item_tarea;
    DROP POLICY IF EXISTS checklist_item_tarea_select ON checklist_item_tarea;
    DROP POLICY IF EXISTS tarea_operativa_delete ON tarea_operativa;
    DROP POLICY IF EXISTS tarea_operativa_update ON tarea_operativa;
    DROP POLICY IF EXISTS tarea_operativa_insert ON tarea_operativa;
    DROP POLICY IF EXISTS tarea_operativa_select ON tarea_operativa;

    ALTER TABLE outbox_evento_consumido_limpieza NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE outbox_evento_consumido_limpieza DISABLE ROW LEVEL SECURITY;
    ALTER TABLE notificacion_tarea NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE notificacion_tarea DISABLE ROW LEVEL SECURITY;
    ALTER TABLE configuracion_operativa_propiedad NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE configuracion_operativa_propiedad DISABLE ROW LEVEL SECURITY;
    ALTER TABLE movimiento_inventario NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE movimiento_inventario DISABLE ROW LEVEL SECURITY;
    ALTER TABLE item_inventario NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE item_inventario DISABLE ROW LEVEL SECURITY;
    ALTER TABLE foto_incidencia NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE foto_incidencia DISABLE ROW LEVEL SECURITY;
    ALTER TABLE incidencia_mantenimiento NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE incidencia_mantenimiento DISABLE ROW LEVEL SECURITY;
    ALTER TABLE foto_checklist_item NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE foto_checklist_item DISABLE ROW LEVEL SECURITY;
    ALTER TABLE checklist_item_tarea NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE checklist_item_tarea DISABLE ROW LEVEL SECURITY;
    ALTER TABLE tarea_operativa NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarea_operativa DISABLE ROW LEVEL SECURITY;

    DROP FUNCTION IF EXISTS incidencia_mantenimiento_reportado_por(uuid);
    DROP FUNCTION IF EXISTS incidencia_mantenimiento_unidad_id(uuid);
    DROP FUNCTION IF EXISTS tarea_operativa_asignado_a(uuid);
    DROP FUNCTION IF EXISTS tarea_operativa_unidad_id(uuid);
  `,
};

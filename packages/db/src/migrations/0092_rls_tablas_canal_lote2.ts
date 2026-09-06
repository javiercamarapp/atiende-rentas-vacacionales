import type { Migracion } from "../runner/tipos.js";

// H-041/H-042: extiende el mismo modelo de RLS de `0015_rls_politicas.ts`
// a las cuatro tablas de canal creadas por el Lote 2 (`0020_cuenta_canal`,
// `0021_sincronizacion_canal`) — numerada 0092 por la misma razón de
// dependencia de orden documentada en `0090_cuenta_canal_cifrado.ts`.
// Reutiliza `is_tenant_member`/`rol_actual`/`unidad_tenant_id`/
// `ocupacion_unidad_de` (definidas en 0014, dentro del rango propio de
// este lote, y por tanto ya disponibles aquí).
export const migracion0092RlsTablasCanalLote2: Migracion = {
  id: "0092_rls_tablas_canal_lote2",
  descripcion: "ENABLE/FORCE ROW LEVEL SECURITY en cuenta_canal/unidad_canal_feed/evento_canal_importado/bloqueo_exportado",
  up: `
    ALTER TABLE cuenta_canal ENABLE ROW LEVEL SECURITY;
    ALTER TABLE cuenta_canal FORCE ROW LEVEL SECURITY;
    ALTER TABLE unidad_canal_feed ENABLE ROW LEVEL SECURITY;
    ALTER TABLE unidad_canal_feed FORCE ROW LEVEL SECURITY;
    ALTER TABLE evento_canal_importado ENABLE ROW LEVEL SECURITY;
    ALTER TABLE evento_canal_importado FORCE ROW LEVEL SECURITY;
    ALTER TABLE bloqueo_exportado ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bloqueo_exportado FORCE ROW LEVEL SECURITY;

    -- cuenta_canal: credenciales/estado de conexión — nunca visibles para
    -- propietario/contador/limpieza (minimización, RV19).
    CREATE POLICY cuenta_canal_select ON cuenta_canal FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador'));
    CREATE POLICY cuenta_canal_escritura ON cuenta_canal FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    CREATE POLICY unidad_canal_feed_select ON unidad_canal_feed FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)) AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador'));
    CREATE POLICY unidad_canal_feed_escritura ON unidad_canal_feed FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    CREATE POLICY evento_canal_importado_select ON evento_canal_importado FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)) AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador'));
    CREATE POLICY evento_canal_importado_escritura ON evento_canal_importado FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    CREATE POLICY bloqueo_exportado_select ON bloqueo_exportado FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id))) AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador'));
    CREATE POLICY bloqueo_exportado_escritura ON bloqueo_exportado FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id))))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id))));
  `,
  down: `
    DROP POLICY IF EXISTS bloqueo_exportado_escritura ON bloqueo_exportado;
    DROP POLICY IF EXISTS bloqueo_exportado_select ON bloqueo_exportado;
    DROP POLICY IF EXISTS evento_canal_importado_escritura ON evento_canal_importado;
    DROP POLICY IF EXISTS evento_canal_importado_select ON evento_canal_importado;
    DROP POLICY IF EXISTS unidad_canal_feed_escritura ON unidad_canal_feed;
    DROP POLICY IF EXISTS unidad_canal_feed_select ON unidad_canal_feed;
    DROP POLICY IF EXISTS cuenta_canal_escritura ON cuenta_canal;
    DROP POLICY IF EXISTS cuenta_canal_select ON cuenta_canal;

    ALTER TABLE bloqueo_exportado NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE bloqueo_exportado DISABLE ROW LEVEL SECURITY;
    ALTER TABLE evento_canal_importado NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE evento_canal_importado DISABLE ROW LEVEL SECURITY;
    ALTER TABLE unidad_canal_feed NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE unidad_canal_feed DISABLE ROW LEVEL SECURITY;
    ALTER TABLE cuenta_canal NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE cuenta_canal DISABLE ROW LEVEL SECURITY;
  `,
};

import type { Migracion } from "../runner/tipos.js";

// H-041/H-042/H-043/H-044 (D-020): `ENABLE` + `FORCE ROW LEVEL SECURITY` en
// todas las tablas de tenant, con políticas que combinan:
//  1. Aislamiento multitenant (caso adversarial 18): `is_tenant_member`
//     sobre el tenant REAL de la fila (nunca sobre un `app.tenant_id`
//     declarado por el cliente sin verificar contra `usuario`).
//  2. Alcance por rol (Roles-1/Roles-4): propietario limitado a sus propias
//     unidades (`unidad_owner_id(...) = owner_actual()`); contador y
//     limpieza sin acceso a las tablas operativas de calendario (§3.1: sin
//     tablas de finanzas/tareas todavía —Lote 7/Lote 5—, así que su alcance
//     hoy es "ninguno" en vez de "solo lo suyo"; documentado como brecha
//     conocida a cerrar en esos lotes, nunca como acceso amplio por
//     omisión — fail-closed).
//  3. Escalada de privilegios rechazada en capa de servicio (H-044): las
//     políticas de escritura exigen rol >= operador con
//     `colaborador_nivel` distinto de `solo_calendario`; el detalle fino
//     (solo `acceso_total` puede cancelar) se exige además en
//     apps/api/src/middleware/roles.ts — RLS es el respaldo si ese chequeo
//     de aplicación se olvidara alguna vez, no el único lugar donde vive.
const TABLAS_TENANT = [
  "tenant",
  "empresa_gestora",
  "owner",
  "usuario",
  "propiedad",
  "unidad",
  "ocupacion_unidad",
  "conflicto_calendario",
  "outbox_evento",
  "auditoria_mutacion",
  "refresh_token",
] as const;
// `cuenta_canal` (y las demás tablas de canal del Lote 2: unidad_canal_feed,
// evento_canal_importado, bloqueo_exportado) reciben su propio ENABLE/FORCE
// + políticas en `0092_rls_tablas_canal_lote2.ts`, numerada fuera de este
// rango porque esas tablas las crea el Lote 2 en 0020/0021, DESPUÉS de esta
// migración — no pueden tener RLS antes de existir.

const HABILITAR_RLS = TABLAS_TENANT.map(
  (tabla) => `
    ALTER TABLE ${tabla} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${tabla} FORCE ROW LEVEL SECURITY;
  `,
).join("\n");

const DESHABILITAR_RLS = TABLAS_TENANT.map(
  (tabla) => `ALTER TABLE ${tabla} NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE ${tabla} DISABLE ROW LEVEL SECURITY;`,
).join("\n");

// Roles que pueden escribir sobre las tablas operativas de calendario
// (propiedad/unidad/ocupacion_unidad/conflicto_calendario/outbox_evento):
// superadmin y admin_gestora siempre; operador solo si su nivel de
// colaborador no es 'solo_calendario' (RV01/RV03 §3 niveles de cohost).
const PUEDE_ESCRIBIR_CALENDARIO = `(
  rol_actual() IN ('superadmin', 'admin_gestora')
  OR (rol_actual() = 'operador' AND colaborador_nivel_actual() IN ('acceso_total', 'calendario_mensajeria'))
)`;

export const migracion0015RlsPoliticas: Migracion = {
  id: "0015_rls_politicas",
  descripcion: "ENABLE/FORCE ROW LEVEL SECURITY + políticas por rol en tablas de tenant",
  up: `
    ${HABILITAR_RLS}

    -- tenant: cada usuario ve solo su propio tenant (superadmin ve todos
    -- vía is_tenant_member, que trata a superadmin como miembro honorario).
    CREATE POLICY tenant_select ON tenant FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), id));
    CREATE POLICY tenant_escritura ON tenant FOR ALL
      USING (rol_actual() = 'superadmin')
      WITH CHECK (rol_actual() = 'superadmin');

    -- empresa_gestora
    CREATE POLICY empresa_gestora_select ON empresa_gestora FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() <> 'limpieza');
    CREATE POLICY empresa_gestora_escritura ON empresa_gestora FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    -- owner: un propietario solo ve su propia fila; contador/limpieza sin acceso
    -- (§Roles-4: multi-empresa-gestora nunca fuga la fila de owner de otro tenant).
    CREATE POLICY owner_select ON owner FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), owner_tenant_id(id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR id = owner_actual())
      );
    CREATE POLICY owner_escritura ON owner FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), owner_tenant_id(id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora'));

    -- usuario: cada quien ve su propia fila; superadmin/admin_gestora ven
    -- el resto de usuarios de su tenant (gestión de equipo/roles).
    CREATE POLICY usuario_select ON usuario FOR SELECT
      USING (
        id = usuario_actual_id()
        OR (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      );
    CREATE POLICY usuario_escritura ON usuario FOR INSERT
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));
    CREATE POLICY usuario_actualizacion ON usuario FOR UPDATE
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    -- propiedad
    CREATE POLICY propiedad_select ON propiedad FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (
          rol_actual() <> 'propietario'
          OR EXISTS (SELECT 1 FROM unidad u WHERE u.propiedad_id = propiedad.id AND u.owner_id = owner_actual())
        )
      );
    CREATE POLICY propiedad_escritura ON propiedad FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    -- unidad
    CREATE POLICY unidad_select ON unidad FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR owner_id = owner_actual())
      );
    CREATE POLICY unidad_escritura ON unidad FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id)));

    -- ocupacion_unidad (reservas y bloqueos): caso adversarial 18/19 core.
    CREATE POLICY ocupacion_unidad_select ON ocupacion_unidad FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR unidad_owner_id(unidad_id) = owner_actual())
      );
    CREATE POLICY ocupacion_unidad_escritura ON ocupacion_unidad FOR ALL
      USING (${PUEDE_ESCRIBIR_CALENDARIO} AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (${PUEDE_ESCRIBIR_CALENDARIO} AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    -- conflicto_calendario
    CREATE POLICY conflicto_calendario_select ON conflicto_calendario FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
      );
    CREATE POLICY conflicto_calendario_escritura ON conflicto_calendario FOR ALL
      USING (${PUEDE_ESCRIBIR_CALENDARIO} AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (${PUEDE_ESCRIBIR_CALENDARIO} AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    -- outbox_evento: cola interna (workers de Lote 2/10), no expuesta por
    -- ningún GET de este lote — SELECT restringido a superadmin; INSERT
    -- permitido a quien ya puede escribir calendario (la propia capa de
    -- aplicación de packages/domain encola el evento en la misma
    -- transacción que la mutación de ocupacion_unidad).
    CREATE POLICY outbox_evento_select ON outbox_evento FOR SELECT
      USING (rol_actual() = 'superadmin');
    CREATE POLICY outbox_evento_insercion ON outbox_evento FOR INSERT
      WITH CHECK (${PUEDE_ESCRIBIR_CALENDARIO});

    -- auditoria_mutacion: solo superadmin/admin_gestora de ese tenant
    -- (§Auditoría-1). El INSERT manual (fuera de los triggers, que corren
    -- SECURITY DEFINER y por tanto ignoran esta política) es exclusivo del
    -- registro de acceso "romper cristal" (H-045).
    CREATE POLICY auditoria_mutacion_select ON auditoria_mutacion FOR SELECT
      USING (
        rol_actual() IN ('superadmin', 'admin_gestora')
        AND (tenant_id IS NULL OR is_tenant_member(usuario_actual_id(), tenant_id))
      );
    CREATE POLICY auditoria_mutacion_romper_cristal ON auditoria_mutacion FOR INSERT
      WITH CHECK (rol_actual() = 'superadmin' AND operacion = 'ACCESO_ROMPER_CRISTAL');

    -- refresh_token: cada usuario solo administra sus propios tokens.
    CREATE POLICY refresh_token_propio ON refresh_token FOR ALL
      USING (usuario_id = usuario_actual_id() OR rol_actual() = 'superadmin')
      WITH CHECK (usuario_id = usuario_actual_id() OR rol_actual() = 'superadmin');
  `,
  down: `
    DROP POLICY IF EXISTS refresh_token_propio ON refresh_token;
    DROP POLICY IF EXISTS auditoria_mutacion_romper_cristal ON auditoria_mutacion;
    DROP POLICY IF EXISTS auditoria_mutacion_select ON auditoria_mutacion;
    DROP POLICY IF EXISTS outbox_evento_insercion ON outbox_evento;
    DROP POLICY IF EXISTS outbox_evento_select ON outbox_evento;
    DROP POLICY IF EXISTS conflicto_calendario_escritura ON conflicto_calendario;
    DROP POLICY IF EXISTS conflicto_calendario_select ON conflicto_calendario;
    DROP POLICY IF EXISTS ocupacion_unidad_escritura ON ocupacion_unidad;
    DROP POLICY IF EXISTS ocupacion_unidad_select ON ocupacion_unidad;
    DROP POLICY IF EXISTS unidad_escritura ON unidad;
    DROP POLICY IF EXISTS unidad_select ON unidad;
    DROP POLICY IF EXISTS propiedad_escritura ON propiedad;
    DROP POLICY IF EXISTS propiedad_select ON propiedad;
    DROP POLICY IF EXISTS usuario_actualizacion ON usuario;
    DROP POLICY IF EXISTS usuario_escritura ON usuario;
    DROP POLICY IF EXISTS usuario_select ON usuario;
    DROP POLICY IF EXISTS owner_escritura ON owner;
    DROP POLICY IF EXISTS owner_select ON owner;
    DROP POLICY IF EXISTS empresa_gestora_escritura ON empresa_gestora;
    DROP POLICY IF EXISTS empresa_gestora_select ON empresa_gestora;
    DROP POLICY IF EXISTS tenant_escritura ON tenant;
    DROP POLICY IF EXISTS tenant_select ON tenant;

    ${DESHABILITAR_RLS}
  `,
};

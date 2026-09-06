import type { Migracion } from "../runner/tipos.js";

// H-075/H-076 (Lote 8): "romper cristal" deja de ser un acceso honorario
// incondicional de `superadmin` (D-020 original, `0014_rls_funciones_helper.ts`)
// y pasa a requerir una CONCESIÓN explícita, con motivo y ventana temporal
// acotada, registrada en esta tabla — sin fila vigente aquí,
// `is_tenant_member` para un `superadmin` es `false` sobre CUALQUIER
// tenant, así que toda tabla de negocio con RLS (`propiedad`, `unidad`,
// `usuario`, `owner`, `empresa_gestora`, `ocupacion_unidad`,
// `cuenta_canal`, ...) devuelve 0 filas para ese superadmin (§Roles-4,
// §Auditoría-1, entregable verificable de LOTES.md Lote 8).
//
// Excepción deliberada: el DIRECTORIO de tenants (nombre/tipo/estado en
// la tabla `tenant` en sí, sin ningún dato de negocio del tenant) sigue
// siendo visible para todo `superadmin` sin concesión — la política nueva
// `tenant_select_superadmin_directorio` es una política PERMISSIVE
// adicional (Postgres las combina con OR), necesaria para que el panel
// "listado de tenants" (H-074) pueda existir: no tendría sentido exigir un
// motivo de "romper cristal" para enterarse de que un tenant llamado
// "Acme" existe y está `activo`/`suspendido` — eso es administración de
// cuentas de plataforma, no lectura de contenido de un tenant.
//
// La concesión la escribe `apps/api/src/routes/backoffice/romperCristal.ts`
// (motivo obligatorio no vacío, `expira_en` obligatorio) y, en la MISMA
// transacción, reutiliza `registrarAccesoRomperCristal`
// (`apps/api/src/middleware/tenant.ts`, ya existente desde Lote 3) para
// dejar la entrada en `auditoria_mutacion` con motivo — esta tabla es el
// "permiso vigente", `auditoria_mutacion` es el registro histórico
// inmutable de que se usó.
export const migracion0061AccesoRomperCristal: Migracion = {
  id: "0061_acceso_romper_cristal",
  descripcion: "acceso_romper_cristal (concesión auditada y acotada) + is_tenant_member exige concesión vigente para superadmin",
  up: `
    CREATE TABLE acceso_romper_cristal (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      superadmin_id   uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      motivo          text NOT NULL CHECK (btrim(motivo) <> ''),
      alcance         text NOT NULL DEFAULT 'general',
      creado_en       timestamptz NOT NULL DEFAULT now(),
      expira_en       timestamptz NOT NULL,
      revocado_en     timestamptz,
      CHECK (expira_en > creado_en)
    );
    CREATE INDEX acceso_romper_cristal_vigencia_idx
      ON acceso_romper_cristal (superadmin_id, tenant_id, expira_en)
      WHERE revocado_en IS NULL;

    ALTER TABLE acceso_romper_cristal ENABLE ROW LEVEL SECURITY;
    ALTER TABLE acceso_romper_cristal FORCE ROW LEVEL SECURITY;

    -- Solo el propio superadmin ve/crea/revoca sus concesiones (el banner
    -- persistente de la UI y el listado "accesos activos" del back office
    -- se sirven de este SELECT). SECURITY DEFINER de is_tenant_member
    -- (más abajo) lee esta tabla igual sin depender de esta política.
    CREATE POLICY acceso_romper_cristal_select ON acceso_romper_cristal FOR SELECT
      USING (rol_actual() = 'superadmin' AND superadmin_id = usuario_actual_id());
    CREATE POLICY acceso_romper_cristal_insercion ON acceso_romper_cristal FOR INSERT
      WITH CHECK (rol_actual() = 'superadmin' AND superadmin_id = usuario_actual_id());
    CREATE POLICY acceso_romper_cristal_revocacion ON acceso_romper_cristal FOR UPDATE
      USING (rol_actual() = 'superadmin' AND superadmin_id = usuario_actual_id())
      WITH CHECK (rol_actual() = 'superadmin' AND superadmin_id = usuario_actual_id());

    -- Redefine is_tenant_member (0014): un superadmin ya NO es miembro
    -- honorario incondicional — solo lo es del tenant sobre el que tiene
    -- una concesión vigente (no revocada, no expirada).
    CREATE OR REPLACE FUNCTION is_tenant_member(_usuario uuid, _tenant uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM usuario u
        WHERE u.id = _usuario AND u.activo
          AND (
            u.tenant_id = _tenant
            OR (
              u.rol = 'superadmin'
              AND EXISTS (
                SELECT 1 FROM acceso_romper_cristal g
                WHERE g.superadmin_id = _usuario
                  AND g.tenant_id = _tenant
                  AND g.revocado_en IS NULL
                  AND g.expira_en > now()
              )
            )
          )
      )
    $$;

    -- Directorio de tenants: política PERMISSIVE adicional (se combina con
    -- OR junto a tenant_select de 0015) — nunca requiere concesión.
    CREATE POLICY tenant_select_superadmin_directorio ON tenant FOR SELECT
      USING (rol_actual() = 'superadmin');
  `,
  down: `
    DROP POLICY IF EXISTS tenant_select_superadmin_directorio ON tenant;

    CREATE OR REPLACE FUNCTION is_tenant_member(_usuario uuid, _tenant uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM usuario u
        WHERE u.id = _usuario AND u.activo
          AND (u.tenant_id = _tenant OR u.rol = 'superadmin')
      )
    $$;

    DROP POLICY IF EXISTS acceso_romper_cristal_revocacion ON acceso_romper_cristal;
    DROP POLICY IF EXISTS acceso_romper_cristal_insercion ON acceso_romper_cristal;
    DROP POLICY IF EXISTS acceso_romper_cristal_select ON acceso_romper_cristal;
    DROP TABLE IF EXISTS acceso_romper_cristal;
  `,
};

import type { Migracion } from "../runner/tipos.js";

// Lote 3.2 (H-096+): funciones SECURITY DEFINER que faltaban para dos
// flujos pre-sesión adicionales:
//   1. Aceptar una invitación (Lote 8, `invitacion_usuario` — migración
//      0062) desde `POST /auth/registro`/el callback de Google: esa tabla
//      tiene RLS FORCE (política `invitacion_usuario_select`/`_escritura`
//      exige `rol_actual() IN ('superadmin','admin_gestora')`, migración
//      0062) — leer/marcar una invitación por su token, ANTES de que
//      exista sesión, necesita el mismo patrón "puerta trasera auditable"
//      que 0016/0106 ya usan para `usuario`/`refresh_token`.
//   2. Consultar la política de alta de un tenant (`permite_registro`/
//      `politica_vinculacion_google`/`dominios_google_permitidos`,
//      migración 0101) antes de decidir si un login de Google puede
//      crear una cuenta nueva — `tenant` también tiene RLS (política
//      `tenant`: "cada usuario ve solo su propio tenant", migración 0015),
//      inaccesible sin sesión.
//
// También añade `oidc_flow.tenant_id_registro` (migración 0105): el
// tenant explícito con el que se inició un flujo de registro abierto de
// Google (`GET /auth/google/inicio?tenantId=...`), distinto de
// `invitacion_token_hash` (que ya cubre el caso de aceptar invitación).
export const migracion0107AuthInvitacionYPoliticaTenant: Migracion = {
  id: "0107_auth_invitacion_y_politica_tenant",
  descripcion: "funciones security definer: aceptar invitación + política de tenant; oidc_flow.tenant_id_registro",
  up: `
    ALTER TABLE oidc_flow ADD COLUMN tenant_id_registro uuid REFERENCES tenant(id) ON DELETE SET NULL;

    CREATE FUNCTION autenticar_buscar_invitacion(_token_hash text)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      email text,
      rol text,
      colaborador_nivel text,
      owner_id uuid,
      expira_en timestamptz,
      aceptada_en timestamptz,
      revocada_en timestamptz
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT i.id, i.tenant_id, i.email, i.rol, i.colaborador_nivel, i.owner_id, i.expira_en, i.aceptada_en, i.revocada_en
      FROM invitacion_usuario i
      WHERE i.token_hash = _token_hash
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_invitacion(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_invitacion(text) TO app_rv;

    CREATE FUNCTION autenticar_aceptar_invitacion(_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE invitacion_usuario SET aceptada_en = now()
      WHERE id = _id AND aceptada_en IS NULL AND revocada_en IS NULL
    $$;
    REVOKE ALL ON FUNCTION autenticar_aceptar_invitacion(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_aceptar_invitacion(uuid) TO app_rv;

    CREATE FUNCTION autenticar_buscar_politica_tenant(_tenant_id uuid)
    RETURNS TABLE (
      permite_registro boolean,
      politica_vinculacion_google text,
      dominios_google_permitidos text[]
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT t.permite_registro, t.politica_vinculacion_google, t.dominios_google_permitidos
      FROM tenant t
      WHERE t.id = _tenant_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_politica_tenant(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_politica_tenant(uuid) TO app_rv;

    CREATE FUNCTION autenticar_existe_tenant_con_registro_abierto() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM tenant WHERE permite_registro)
    $$;
    REVOKE ALL ON FUNCTION autenticar_existe_tenant_con_registro_abierto() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_existe_tenant_con_registro_abierto() TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS autenticar_existe_tenant_con_registro_abierto();
    DROP FUNCTION IF EXISTS autenticar_buscar_politica_tenant(uuid);
    DROP FUNCTION IF EXISTS autenticar_aceptar_invitacion(uuid);
    DROP FUNCTION IF EXISTS autenticar_buscar_invitacion(text);
    ALTER TABLE oidc_flow DROP COLUMN IF EXISTS tenant_id_registro;
  `,
};

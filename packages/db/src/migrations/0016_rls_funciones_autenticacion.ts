import type { Migracion } from "../runner/tipos.js";

// H-040: el login y el refresh de token ocurren ANTES de que exista una
// sesión de aplicación (`app.user_id` todavía no está seteado, D-020) —
// las políticas RLS normales de `usuario`/`refresh_token` (migración 0015)
// devolverían 0 filas para cualquier búsqueda por email/hash de token, por
// diseño (fail-closed). Estas dos funciones son la única puerta trasera
// deliberada y auditable: `SECURITY DEFINER`, `REVOKE ALL FROM PUBLIC`,
// `GRANT EXECUTE` solo a `app_rv` — nunca `BYPASSRLS` en el rol de
// conexión (que seguiría exponiendo TODA tabla, no solo esta consulta
// puntual y explícita). Ninguna de las dos funciones devuelve más columnas
// de las estrictamente necesarias para autenticar.
export const migracion0016RlsFuncionesAutenticacion: Migracion = {
  id: "0016_rls_funciones_autenticacion",
  descripcion: "funciones de autenticación (security definer) para login/refresh sin sesión previa",
  up: `
    CREATE OR REPLACE FUNCTION autenticar_buscar_usuario(_email text)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      rol text,
      colaborador_nivel text,
      owner_id uuid,
      password_hash text,
      activo boolean
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.tenant_id, u.rol, u.colaborador_nivel, u.owner_id, u.password_hash, u.activo
      FROM usuario u
      WHERE lower(u.email) = lower(_email)
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_usuario(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_usuario(text) TO app_rv;

    CREATE OR REPLACE FUNCTION autenticar_buscar_refresh_token(_hash text)
    RETURNS TABLE (
      id uuid,
      usuario_id uuid,
      expira_en timestamptz,
      revocado_en timestamptz
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT r.id, r.usuario_id, r.expira_en, r.revocado_en
      FROM refresh_token r
      WHERE r.token_hash = _hash
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_refresh_token(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_refresh_token(text) TO app_rv;

    -- Usada por el flujo de refresh (H-040): tras validar el hash del
    -- refresh token se re-consulta el usuario POR ID (nunca se confía en
    -- claims viejos del propio token) para emitir el nuevo access token
    -- con el rol/tenant/nivel ACTUALES — si un admin cambió el rol de
    -- alguien entre medias, el siguiente refresh ya refleja ese cambio.
    CREATE OR REPLACE FUNCTION autenticar_buscar_usuario_por_id(_id uuid)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      rol text,
      colaborador_nivel text,
      owner_id uuid,
      activo boolean
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.tenant_id, u.rol, u.colaborador_nivel, u.owner_id, u.activo
      FROM usuario u
      WHERE u.id = _id
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_usuario_por_id(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_usuario_por_id(uuid) TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS autenticar_buscar_usuario_por_id(uuid);
    DROP FUNCTION IF EXISTS autenticar_buscar_refresh_token(text);
    DROP FUNCTION IF EXISTS autenticar_buscar_usuario(text);
  `,
};

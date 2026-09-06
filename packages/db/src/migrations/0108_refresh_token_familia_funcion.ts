import type { Migracion } from "../runner/tipos.js";

// Lote 3.2 (H-096+): `autenticar_buscar_refresh_token` (0016) es la única
// vía para leer un `refresh_token` por su hash ANTES de que exista sesión
// (RLS `refresh_token_propio`, migración 0015, exige `usuario_id =
// usuario_actual_id()` — imposible de satisfacer todavía en ese punto del
// flujo de `POST /auth/refresh`). Se extiende con `familia_id`/`aud` para
// poder implementar rotación con detección de reutilización: si el token
// presentado ya está revocado, `familia_id` es lo que permite revocar el
// resto de la cadena (`UPDATE ... WHERE familia_id = $1`, ejecutado DESPUÉS
// de `fijarSesion` con el usuario dueño de esa familia — esa escritura en
// sí NO necesita `SECURITY DEFINER` porque ya hay sesión fijada en ese
// punto y la política RLS de `refresh_token` la permite igual que ya
// permite la inserción del propio login).
export const migracion0108RefreshTokenFamiliaFuncion: Migracion = {
  id: "0108_refresh_token_familia_funcion",
  descripcion: "autenticar_buscar_refresh_token: añade familia_id/aud (rotación con detección de reutilización)",
  up: `
    DROP FUNCTION IF EXISTS autenticar_buscar_refresh_token(text);
    CREATE FUNCTION autenticar_buscar_refresh_token(_hash text)
    RETURNS TABLE (
      id uuid,
      usuario_id uuid,
      expira_en timestamptz,
      revocado_en timestamptz,
      familia_id uuid,
      aud text
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT r.id, r.usuario_id, r.expira_en, r.revocado_en, r.familia_id, r.aud
      FROM refresh_token r
      WHERE r.token_hash = _hash
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_refresh_token(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_refresh_token(text) TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS autenticar_buscar_refresh_token(text);
    CREATE FUNCTION autenticar_buscar_refresh_token(_hash text)
    RETURNS TABLE (id uuid, usuario_id uuid, expira_en timestamptz, revocado_en timestamptz)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT r.id, r.usuario_id, r.expira_en, r.revocado_en FROM refresh_token r WHERE r.token_hash = _hash
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_refresh_token(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_refresh_token(text) TO app_rv;
  `,
};

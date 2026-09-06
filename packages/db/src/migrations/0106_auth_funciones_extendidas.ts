import type { Migracion } from "../runner/tipos.js";

// Lote 3.2 (H-096+): extiende las funciones `SECURITY DEFINER` de
// 0016_rls_funciones_autenticacion.ts con las columnas nuevas de 0101
// (verificación de correo, MFA, bloqueo temporal) y añade las funciones
// `SECURITY DEFINER` que faltan para los flujos que, igual que login/
// refresh, ocurren SIN sesión de aplicación todavía (`app.user_id` no
// seteado): registro, verificación de correo, olvidé/restablecer
// contraseña, y el paso 2 de login con MFA. `usuario` tiene RLS `FORCE`
// (0014/0015) — sin estas funciones, cualquier `UPDATE`/`INSERT` directo
// sobre `usuario` antes de que exista sesión devolvería 0 filas en
// silencio (fail-closed correcto, pero inservible para estos flujos).
//
// Postgres no permite `CREATE OR REPLACE FUNCTION` cuando cambian las
// columnas de salida de una función que devuelve `TABLE(...)` — por eso
// `autenticar_buscar_usuario`/`autenticar_buscar_usuario_por_id` se
// `DROP`ean y se recrean aquí en vez de reemplazarse in place.
export const migracion0106AuthFuncionesExtendidas: Migracion = {
  id: "0106_auth_funciones_extendidas",
  descripcion: "funciones security definer: registro, verificación de correo, reset de password, MFA, bloqueo temporal",
  up: `
    DROP FUNCTION IF EXISTS autenticar_buscar_usuario(text);
    CREATE FUNCTION autenticar_buscar_usuario(_email text)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      rol text,
      colaborador_nivel text,
      owner_id uuid,
      password_hash text,
      activo boolean,
      email text,
      email_verificado_en timestamptz,
      mfa_totp_habilitado boolean,
      intentos_fallidos integer,
      bloqueado_hasta timestamptz
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.tenant_id, u.rol, u.colaborador_nivel, u.owner_id, u.password_hash, u.activo,
             u.email, u.email_verificado_en, u.mfa_totp_habilitado, u.intentos_fallidos, u.bloqueado_hasta
      FROM usuario u
      WHERE lower(u.email) = lower(_email)
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_usuario(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_usuario(text) TO app_rv;

    DROP FUNCTION IF EXISTS autenticar_buscar_usuario_por_id(uuid);
    CREATE FUNCTION autenticar_buscar_usuario_por_id(_id uuid)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      rol text,
      colaborador_nivel text,
      owner_id uuid,
      activo boolean,
      email text,
      email_verificado_en timestamptz,
      mfa_totp_habilitado boolean,
      mfa_totp_secret_cifrado bytea,
      mfa_totp_secret_iv bytea,
      mfa_totp_secret_tag bytea,
      mfa_totp_secret_clave_version text,
      mfa_recovery_codes jsonb,
      intentos_fallidos integer,
      bloqueado_hasta timestamptz
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.tenant_id, u.rol, u.colaborador_nivel, u.owner_id, u.activo,
             u.email, u.email_verificado_en, u.mfa_totp_habilitado,
             u.mfa_totp_secret_cifrado, u.mfa_totp_secret_iv, u.mfa_totp_secret_tag, u.mfa_totp_secret_clave_version,
             u.mfa_recovery_codes, u.intentos_fallidos, u.bloqueado_hasta
      FROM usuario u
      WHERE u.id = _id
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_usuario_por_id(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_usuario_por_id(uuid) TO app_rv;

    -- Registro/alta pre-sesión (auto-registro abierto, aceptar invitación,
    -- o alta automática al vincular Google por primera vez). El parámetro
    -- _password_hash para una cuenta creada solo por Google es un
    -- centinela fijo que NUNCA coincide con el formato
    -- "scrypt-N-r-p-sal-derivada" que exige verificarContrasena
    -- (apps/api/src/seguridad/contrasenas.ts) -- ese login por password
    -- queda bloqueado de forma segura (no hay contraseña que probar)
    -- hasta que la propia cuenta configure una.
    CREATE FUNCTION autenticar_registrar_usuario(
      _tenant_id uuid,
      _email text,
      _password_hash text,
      _rol text,
      _colaborador_nivel text,
      _owner_id uuid,
      _email_verificado boolean
    ) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_id uuid;
    BEGIN
      INSERT INTO usuario (tenant_id, email, password_hash, rol, colaborador_nivel, owner_id, email_verificado_en)
      VALUES (_tenant_id, _email, _password_hash, _rol, _colaborador_nivel, _owner_id,
              CASE WHEN _email_verificado THEN now() ELSE NULL END)
      RETURNING id INTO v_id;
      RETURN v_id;
    END;
    $$;
    REVOKE ALL ON FUNCTION autenticar_registrar_usuario(uuid, text, text, text, text, uuid, boolean) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_registrar_usuario(uuid, text, text, text, text, uuid, boolean) TO app_rv;

    CREATE FUNCTION autenticar_marcar_email_verificado(_usuario_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET email_verificado_en = now() WHERE id = _usuario_id AND email_verificado_en IS NULL
    $$;
    REVOKE ALL ON FUNCTION autenticar_marcar_email_verificado(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_marcar_email_verificado(uuid) TO app_rv;

    -- Bloqueo temporal (además del rate limit por IP+email, S-06): al
    -- llegar a _max_intentos consecutivos, bloqueado_hasta se fija
    -- _bloqueo_ms en el futuro; cualquier intento exitoso resetea el
    -- contador vía autenticar_resetear_intentos.
    CREATE FUNCTION autenticar_registrar_intento_fallido(_usuario_id uuid, _max_intentos integer, _bloqueo_ms bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_intentos integer;
    BEGIN
      UPDATE usuario SET intentos_fallidos = intentos_fallidos + 1
      WHERE id = _usuario_id
      RETURNING intentos_fallidos INTO v_intentos;
      IF v_intentos IS NOT NULL AND v_intentos >= _max_intentos THEN
        UPDATE usuario SET bloqueado_hasta = now() + (_bloqueo_ms || ' milliseconds')::interval
        WHERE id = _usuario_id;
      END IF;
    END;
    $$;
    REVOKE ALL ON FUNCTION autenticar_registrar_intento_fallido(uuid, integer, bigint) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_registrar_intento_fallido(uuid, integer, bigint) TO app_rv;

    CREATE FUNCTION autenticar_resetear_intentos(_usuario_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = _usuario_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_resetear_intentos(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_resetear_intentos(uuid) TO app_rv;

    CREATE FUNCTION autenticar_actualizar_password(_usuario_id uuid, _hash text) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET password_hash = _hash, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = _usuario_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_actualizar_password(uuid, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_actualizar_password(uuid, text) TO app_rv;

    CREATE FUNCTION autenticar_actualizar_mfa(
      _usuario_id uuid,
      _habilitado boolean,
      _secret_cifrado bytea,
      _iv bytea,
      _tag bytea,
      _clave_version text,
      _recovery_codes jsonb
    ) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET
        mfa_totp_habilitado = _habilitado,
        mfa_totp_secret_cifrado = _secret_cifrado,
        mfa_totp_secret_iv = _iv,
        mfa_totp_secret_tag = _tag,
        mfa_totp_secret_clave_version = _clave_version,
        mfa_recovery_codes = _recovery_codes
      WHERE id = _usuario_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_actualizar_mfa(uuid, boolean, bytea, bytea, bytea, text, jsonb) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_actualizar_mfa(uuid, boolean, bytea, bytea, bytea, text, jsonb) TO app_rv;

    CREATE FUNCTION autenticar_deshabilitar_mfa(_usuario_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET
        mfa_totp_habilitado = false,
        mfa_totp_secret_cifrado = NULL,
        mfa_totp_secret_iv = NULL,
        mfa_totp_secret_tag = NULL,
        mfa_totp_secret_clave_version = NULL,
        mfa_recovery_codes = '[]'::jsonb
      WHERE id = _usuario_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_deshabilitar_mfa(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_deshabilitar_mfa(uuid) TO app_rv;

    CREATE FUNCTION autenticar_marcar_recovery_codes(_usuario_id uuid, _recovery_codes jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET mfa_recovery_codes = _recovery_codes WHERE id = _usuario_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_marcar_recovery_codes(uuid, jsonb) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_marcar_recovery_codes(uuid, jsonb) TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS autenticar_marcar_recovery_codes(uuid, jsonb);
    DROP FUNCTION IF EXISTS autenticar_deshabilitar_mfa(uuid);
    DROP FUNCTION IF EXISTS autenticar_actualizar_mfa(uuid, boolean, bytea, bytea, bytea, text, jsonb);
    DROP FUNCTION IF EXISTS autenticar_actualizar_password(uuid, text);
    DROP FUNCTION IF EXISTS autenticar_resetear_intentos(uuid);
    DROP FUNCTION IF EXISTS autenticar_registrar_intento_fallido(uuid, integer, bigint);
    DROP FUNCTION IF EXISTS autenticar_marcar_email_verificado(uuid);
    DROP FUNCTION IF EXISTS autenticar_registrar_usuario(uuid, text, text, text, text, uuid, boolean);
    DROP FUNCTION IF EXISTS autenticar_buscar_usuario_por_id(uuid);
    DROP FUNCTION IF EXISTS autenticar_buscar_usuario(text);

    -- Restaura las firmas de 0016 (sin las columnas de 0101) para que un
    -- rollback deje el esquema exactamente como 0016 lo dejó.
    CREATE FUNCTION autenticar_buscar_usuario(_email text)
    RETURNS TABLE (
      id uuid, tenant_id uuid, rol text, colaborador_nivel text, owner_id uuid, password_hash text, activo boolean
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.tenant_id, u.rol, u.colaborador_nivel, u.owner_id, u.password_hash, u.activo
      FROM usuario u WHERE lower(u.email) = lower(_email)
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_usuario(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_usuario(text) TO app_rv;

    CREATE FUNCTION autenticar_buscar_usuario_por_id(_id uuid)
    RETURNS TABLE (
      id uuid, tenant_id uuid, rol text, colaborador_nivel text, owner_id uuid, activo boolean
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.tenant_id, u.rol, u.colaborador_nivel, u.owner_id, u.activo
      FROM usuario u WHERE u.id = _id
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_usuario_por_id(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_usuario_por_id(uuid) TO app_rv;
  `,
};

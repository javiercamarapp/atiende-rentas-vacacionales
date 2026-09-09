import type { Migracion } from "../runner/tipos.js";

// A3-AUTH-01 (docs/auditoria-3/seguridad-auth.md, ALTO): `LimitadorVentana`
// (apps/api/src/seguridad/rateLimit.ts) es un `Map` en memoria del proceso
// Node — documentado explícitamente como "suficiente para un solo proceso...
// un despliegue multi-instancia necesita un backend compartido". El
// despliegue real (Vercel serverless, `apps/api/api/index.ts`) instancia un
// proceso Node nuevo por cold start, cada uno con su propio `Map` vacío:
// el límite de intentos de `POST /auth/mfa/verificar` (segundo factor,
// código TOTP de 6 dígitos o código de recuperación) NO es efectivo en
// producción — a diferencia de `/auth/login`, que sí tiene un contador
// persistente en Postgres (`usuario.intentos_fallidos`/`bloqueado_hasta`,
// migración 0106).
//
// `rate_limit_bucket` es un backend de rate-limit genérico y reutilizable
// persistido en Postgres (mismo concepto que ya se usó en
// atiende-licitaciones): una fila por clave lógica de negocio
// (`<ruta>:<dimensión>:<identificador>`, p. ej.
// "mfa_verificar:usuario:<uuid>" o "mfa_verificar:ip:<sha256>"), ventana
// FIJA (mismo algoritmo que `LimitadorVentana`, solo que el contador vive
// en una fila de tabla en vez de una entrada de `Map`) con el incremento
// atómico en una sola sentencia `INSERT ... ON CONFLICT DO UPDATE`
// protegida por el lock de fila estándar de Postgres — dos invocaciones
// concurrentes en instancias serverless DISTINTAS, cada una con su propia
// conexión, nunca pisan el conteo de la otra porque ambas pasan por la
// MISMA fila en la MISMA base de datos.
//
// Sin `tenant_id`/RLS a propósito: igual que `auditoria_auth_evento`
// (0104) y `token_un_uso` (0103), esta tabla se usa en flujos
// PRE-sesión (`app.user_id` aún no fijado) donde RLS `FORCE` bloquearía
// cualquier operación — el aislamiento aquí lo da la propia `clave`
// (namespaced por ruta + dimensión + identificador), no RLS.
export const migracion0127RateLimitBucket: Migracion = {
  id: "0127_rate_limit_bucket",
  descripcion: "rate_limit_bucket + rate_limit_registrar_intento/limpiar_expirados (backend persistido para A3-AUTH-01)",
  up: `
    CREATE TABLE rate_limit_bucket (
      clave         text PRIMARY KEY,
      cuenta        integer NOT NULL,
      reinicia_en   timestamptz NOT NULL,
      actualizado_en timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX rate_limit_bucket_reinicia_en_idx ON rate_limit_bucket (reinicia_en);

    -- Registra un intento para _clave. Devuelve TRUE (permitido) o FALSE
    -- (bloqueado: ya se alcanzó _maximo dentro de la ventana vigente).
    -- Misma semántica que LimitadorVentana.registrarIntento: al llegar al
    -- máximo, los intentos siguientes DENTRO de la misma ventana no
    -- incrementan más el contador, solo se rechazan.
    --
    -- Atomicidad: el primer INSERT ... ON CONFLICT ... DO UPDATE ... WHERE
    -- solo tiene efecto (y devuelve fila) si la ventana anterior ya
    -- expiró — Postgres serializa esto vía el lock de fila del propio
    -- UPSERT, así que dos llamadas concurrentes para la MISMA clave
    -- nunca reinician el contador dos veces. Si esa primera sentencia no
    -- afectó ninguna fila (ventana vigente), el segundo UPDATE intenta
    -- incrementar solo si cuenta < _maximo.
    CREATE FUNCTION rate_limit_registrar_intento(_clave text, _ventana_ms bigint, _maximo integer)
    RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_afectadas integer;
    BEGIN
      INSERT INTO rate_limit_bucket (clave, cuenta, reinicia_en, actualizado_en)
      VALUES (_clave, 1, now() + (_ventana_ms || ' milliseconds')::interval, now())
      ON CONFLICT (clave) DO UPDATE SET
        cuenta = 1,
        reinicia_en = now() + (_ventana_ms || ' milliseconds')::interval,
        actualizado_en = now()
      WHERE rate_limit_bucket.reinicia_en <= now();

      GET DIAGNOSTICS v_afectadas = ROW_COUNT;
      IF v_afectadas > 0 THEN
        RETURN true; -- ventana nueva (o recién expirada): primer intento, permitido.
      END IF;

      -- Ventana vigente: incrementa solo si aún no llegó al máximo.
      UPDATE rate_limit_bucket SET cuenta = cuenta + 1, actualizado_en = now()
      WHERE clave = _clave AND cuenta < _maximo;

      GET DIAGNOSTICS v_afectadas = ROW_COUNT;
      RETURN v_afectadas > 0;
    END;
    $$;
    REVOKE ALL ON FUNCTION rate_limit_registrar_intento(text, bigint, integer) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION rate_limit_registrar_intento(text, bigint, integer) TO app_rv;

    -- Limpieza de entradas viejas: borra buckets cuya ventana expiró hace
    -- más de _margen_ms (margen para no borrar una fila justo antes de
    -- que otra instancia la lea). Se invoca de forma perezosa/
    -- probabilística desde la propia app (ver
    -- apps/api/src/seguridad/rateLimitPostgres.ts) en vez de requerir un
    -- cron dedicado solo para esta tabla — evita que crezca sin límite
    -- sin añadir infraestructura de despliegue nueva fuera de alcance de
    -- este hallazgo.
    CREATE FUNCTION rate_limit_limpiar_expirados(_margen_ms bigint) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_borradas integer;
    BEGIN
      DELETE FROM rate_limit_bucket
      WHERE reinicia_en < now() - (_margen_ms || ' milliseconds')::interval;
      GET DIAGNOSTICS v_borradas = ROW_COUNT;
      RETURN v_borradas;
    END;
    $$;
    REVOKE ALL ON FUNCTION rate_limit_limpiar_expirados(bigint) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION rate_limit_limpiar_expirados(bigint) TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS rate_limit_limpiar_expirados(bigint);
    DROP FUNCTION IF EXISTS rate_limit_registrar_intento(text, bigint, integer);
    DROP TABLE IF EXISTS rate_limit_bucket;
  `,
};

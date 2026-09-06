import type { Migracion } from "../runner/tipos.js";

// Lote 3.2 (H-096+, auth extendida: Google OIDC + cuenta local completa
// de producción sobre el esqueleto de Lote 3/0010). Rango 0101-0106
// asignado a este lote (0100 ya lo usa Lote 11B, 0100_feed_ical_token.ts
// — ver comentario de cabecera en packages/db/src/migrations/index.ts).
//
// Añade a `usuario`:
//   - email_verificado_en: NULL hasta que el correo se verifica por token
//     de un solo uso (`token_un_uso`, migración 0103). Cuentas creadas por
//     invitación de Lote 8 ya vienen con email verificado implícitamente
//     (el invitador conocía el correo) — se marca en el momento de aceptar.
//   - mfa_totp_*: secreto TOTP (RFC 6238) cifrado en reposo con el mismo
//     esquema AES-256-GCM que `KeyringCifradoCanal`
//     (apps/api/src/seguridad/cifrado.ts) — NUNCA en texto plano, ni
//     siquiera en un backup de la base de datos. `mfa_recovery_codes` guarda
//     únicamente HASHES sha256 de los códigos de recuperación (mismo patrón
//     de una sola vía que `refresh_token.token_hash`/`invitacion_usuario.
//     token_hash`) — un código de recuperación es un secreto de un solo uso
//     de alta entropía, nunca necesita ser recuperado en claro por el
//     servidor, así que hashear (irreversible) es estrictamente más seguro
//     que cifrar (reversible) para este dato.
//   - intentos_fallidos/bloqueado_hasta: bloqueo temporal de cuenta tras N
//     intentos fallidos consecutivos (S-06 ya cubre fuerza bruta con rate
//     limit por IP+email; esto es una segunda capa independiente y
//     persistente que sobrevive a un cambio de IP/reinicio del proceso).
//
// Añade a `tenant` la política de alta de cuentas (REQ auth/roles,
// docs/REQUISITOS.md): sin una fila explícita, ningún tenant permite
// registro abierto ni vinculación abierta de Google — fail-closed, un
// tenant nuevo exige que un admin_gestora/superadmin decida la política
// explícitamente (mismo criterio D-020 que el resto del esquema RLS).
//
// Añade a `refresh_token` lo necesario para rotación con detección de
// reutilización (H-096, RV19/21-7): `familia_id` agrupa toda la cadena de
// tokens nacida de un mismo login (cada refresh sucesivo hereda la misma
// familia); si un token ya revocado se vuelve a presentar, TODA la familia
// se revoca (señal de robo). `aud` distingue clientes (web con cookie
// httpOnly vs. api con bearer) para que un token emitido para un cliente
// nunca sea aceptado como si viniera de otro.
export const migracion0101UsuarioAuthExtendida: Migracion = {
  id: "0101_usuario_auth_extendida",
  descripcion: "usuario: verificación de correo, MFA TOTP, bloqueo temporal; tenant: política de alta; refresh_token: familia/aud",
  up: `
    ALTER TABLE usuario
      ADD COLUMN email_verificado_en timestamptz,
      ADD COLUMN mfa_totp_habilitado boolean NOT NULL DEFAULT false,
      ADD COLUMN mfa_totp_secret_cifrado bytea,
      ADD COLUMN mfa_totp_secret_iv bytea,
      ADD COLUMN mfa_totp_secret_tag bytea,
      ADD COLUMN mfa_totp_secret_clave_version text,
      ADD COLUMN mfa_recovery_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN intentos_fallidos integer NOT NULL DEFAULT 0,
      ADD COLUMN bloqueado_hasta timestamptz;

    ALTER TABLE usuario ADD CONSTRAINT usuario_mfa_secreto_completo CHECK (
      (mfa_totp_secret_cifrado IS NULL AND mfa_totp_secret_iv IS NULL AND mfa_totp_secret_tag IS NULL AND mfa_totp_secret_clave_version IS NULL)
      OR (mfa_totp_secret_cifrado IS NOT NULL AND mfa_totp_secret_iv IS NOT NULL AND mfa_totp_secret_tag IS NOT NULL AND mfa_totp_secret_clave_version IS NOT NULL)
    );

    ALTER TABLE tenant
      ADD COLUMN permite_registro boolean NOT NULL DEFAULT false,
      ADD COLUMN politica_vinculacion_google text NOT NULL DEFAULT 'invitado_solo' CHECK (
        politica_vinculacion_google IN ('invitado_solo', 'dominio_permitido', 'abierto')
      ),
      ADD COLUMN dominios_google_permitidos text[] NOT NULL DEFAULT '{}';

    ALTER TABLE refresh_token
      ADD COLUMN familia_id uuid NOT NULL DEFAULT gen_random_uuid(),
      ADD COLUMN reemplazado_por uuid REFERENCES refresh_token(id) ON DELETE SET NULL,
      ADD COLUMN revocado_motivo text,
      ADD COLUMN aud text NOT NULL DEFAULT 'api' CHECK (aud IN ('api', 'web')),
      ADD COLUMN dispositivo_etiqueta text,
      ADD COLUMN creado_ip_hash text;

    CREATE INDEX refresh_token_familia_id_idx ON refresh_token (familia_id);
  `,
  down: `
    DROP INDEX IF EXISTS refresh_token_familia_id_idx;
    ALTER TABLE refresh_token
      DROP COLUMN IF EXISTS creado_ip_hash,
      DROP COLUMN IF EXISTS dispositivo_etiqueta,
      DROP COLUMN IF EXISTS aud,
      DROP COLUMN IF EXISTS revocado_motivo,
      DROP COLUMN IF EXISTS reemplazado_por,
      DROP COLUMN IF EXISTS familia_id;

    ALTER TABLE tenant
      DROP COLUMN IF EXISTS dominios_google_permitidos,
      DROP COLUMN IF EXISTS politica_vinculacion_google,
      DROP COLUMN IF EXISTS permite_registro;

    ALTER TABLE usuario
      DROP CONSTRAINT IF EXISTS usuario_mfa_secreto_completo,
      DROP COLUMN IF EXISTS bloqueado_hasta,
      DROP COLUMN IF EXISTS intentos_fallidos,
      DROP COLUMN IF EXISTS mfa_recovery_codes,
      DROP COLUMN IF EXISTS mfa_totp_secret_clave_version,
      DROP COLUMN IF EXISTS mfa_totp_secret_tag,
      DROP COLUMN IF EXISTS mfa_totp_secret_iv,
      DROP COLUMN IF EXISTS mfa_totp_secret_cifrado,
      DROP COLUMN IF EXISTS mfa_totp_habilitado,
      DROP COLUMN IF EXISTS email_verificado_en;
  `,
};

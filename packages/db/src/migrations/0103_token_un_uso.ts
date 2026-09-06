import type { Migracion } from "../runner/tipos.js";

// Lote 3.2 (H-096+): token de un solo uso genérico para los dos flujos que
// lo necesitan — verificación de correo y restablecimiento de contraseña
// (mismo patrón de un solo hash SHA-256 guardado, nunca el token en claro,
// que ya usan `refresh_token.token_hash`/`invitacion_usuario.token_hash`).
// Una sola tabla con `tipo` en vez de dos tablas casi idénticas: ambos
// flujos comparten exactamente la misma forma (usuario dueño, expiración,
// uso único) y las mismas invariantes de seguridad.
export const migracion0103TokenUnUso: Migracion = {
  id: "0103_token_un_uso",
  descripcion: "token_un_uso (verificación de correo + restablecimiento de contraseña)",
  up: `
    CREATE TABLE token_un_uso (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      tipo        text NOT NULL CHECK (tipo IN ('verificacion_email', 'restablecer_password')),
      token_hash  text NOT NULL,
      expira_en   timestamptz NOT NULL,
      usado_en    timestamptz,
      creado_en   timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX token_un_uso_hash_idx ON token_un_uso (token_hash);
    CREATE INDEX token_un_uso_usuario_tipo_idx ON token_un_uso (usuario_id, tipo);
  `,
  down: `
    DROP TABLE IF EXISTS token_un_uso;
  `,
};

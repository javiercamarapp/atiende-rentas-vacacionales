import type { Migracion } from "../runner/tipos.js";

// Lote 3 (H-040, H-043): modelo de roles internos + credenciales de acceso
// sobre el esqueleto mínimo de `usuario` que dejó Lote 1 (migración 0003,
// que esta migración NO edita). Seis roles (RV12 §1, reconciliados con los
// 3 niveles de colaborador verificados con fuente primaria en RV01/RV03):
// superadmin (Atiende, sin tenant_id), admin_gestora, operador, limpieza,
// propietario (vinculado a `owner`), contador. `colaborador_nivel` solo es
// significativo para 'operador' (acceso_total | calendario_mensajeria |
// solo_calendario, RV01/RV03/RV18 §3.1) — NULL para el resto de roles.
export const migracion0010UsuarioRolesCredenciales: Migracion = {
  id: "0010_usuario_roles_credenciales",
  descripcion: "usuario: rol, colaborador_nivel, owner_id, password_hash, activo + refresh_token",
  up: `
    ALTER TABLE usuario
      ADD COLUMN rol text NOT NULL DEFAULT 'operador' CHECK (
        rol IN ('superadmin', 'admin_gestora', 'operador', 'limpieza', 'propietario', 'contador')
      ),
      ADD COLUMN colaborador_nivel text CHECK (
        colaborador_nivel IN ('acceso_total', 'calendario_mensajeria', 'solo_calendario')
      ),
      ADD COLUMN owner_id uuid REFERENCES owner(id) ON DELETE SET NULL,
      ADD COLUMN password_hash text NOT NULL DEFAULT '',
      ADD COLUMN activo boolean NOT NULL DEFAULT true;

    ALTER TABLE usuario ALTER COLUMN password_hash DROP DEFAULT;

    -- Coherencia de rol: superadmin nunca tiene tenant_id (opera sobre toda
    -- la plataforma); todos los demás roles SIEMPRE tienen tenant_id
    -- (D-020: RLS es fail-closed, un usuario sin tenant no puede pertenecer
    -- a ningún tenant por accidente). propietario/owner_id: solo el rol
    -- 'propietario' referencia una fila de owner.
    ALTER TABLE usuario ADD CONSTRAINT usuario_superadmin_sin_tenant CHECK (
      (rol = 'superadmin' AND tenant_id IS NULL) OR (rol <> 'superadmin' AND tenant_id IS NOT NULL)
    );
    ALTER TABLE usuario ADD CONSTRAINT usuario_owner_solo_propietario CHECK (
      (rol = 'propietario') OR (owner_id IS NULL)
    );
    ALTER TABLE usuario ADD CONSTRAINT usuario_colaborador_nivel_solo_operador CHECK (
      (rol = 'operador') OR (colaborador_nivel IS NULL)
    );

    CREATE INDEX usuario_tenant_id_idx ON usuario (tenant_id);
    CREATE INDEX usuario_owner_id_idx ON usuario (owner_id);

    -- Tokens de refresco (H-040): se guarda el HASH del token, nunca el
    -- token en claro (REQ-142/§RV19/21-7 — ni siquiera en la propia base de
    -- datos de la aplicación). Rotación: cada uso exitoso revoca el token
    -- anterior e inserta uno nuevo (ver apps/api/src/seguridad/jwt.ts).
    CREATE TABLE refresh_token (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id    uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      token_hash    text NOT NULL,
      expira_en     timestamptz NOT NULL,
      revocado_en   timestamptz,
      creado_en     timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX refresh_token_hash_idx ON refresh_token (token_hash);
    CREATE INDEX refresh_token_usuario_id_idx ON refresh_token (usuario_id);
  `,
  down: `
    DROP TABLE IF EXISTS refresh_token;
    ALTER TABLE usuario
      DROP CONSTRAINT IF EXISTS usuario_colaborador_nivel_solo_operador,
      DROP CONSTRAINT IF EXISTS usuario_owner_solo_propietario,
      DROP CONSTRAINT IF EXISTS usuario_superadmin_sin_tenant,
      DROP COLUMN IF EXISTS activo,
      DROP COLUMN IF EXISTS password_hash,
      DROP COLUMN IF EXISTS owner_id,
      DROP COLUMN IF EXISTS colaborador_nivel,
      DROP COLUMN IF EXISTS rol;
  `,
};

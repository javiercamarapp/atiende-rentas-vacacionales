import type { Migracion } from "../runner/tipos.js";

// Esqueleto mínimo de usuario, solo lo necesario para las FK de
// conflicto_calendario.resuelto_por y auditoria_mutacion.actor_id. El
// modelo real de roles/colaboradores (H-043) y RLS (H-041) llegan en
// Lote 3 vía nuevas migraciones (nunca editando esta).
export const migracion0003Usuario: Migracion = {
  id: "0003_usuario",
  descripcion: "usuario (esqueleto mínimo para FKs de auditoría/conflictos)",
  up: `
    CREATE TABLE usuario (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  uuid REFERENCES tenant(id) ON DELETE CASCADE,
      email      text NOT NULL,
      creado_en  timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX usuario_email_key ON usuario (lower(email));
  `,
  down: `
    DROP TABLE IF EXISTS usuario;
  `,
};

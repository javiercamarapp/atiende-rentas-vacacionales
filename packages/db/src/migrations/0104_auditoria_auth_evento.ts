import type { Migracion } from "../runner/tipos.js";

// Lote 3.2 (H-096+): auditoría de eventos de autenticación, separada de
// `auditoria_mutacion` (0008/0013) porque estos eventos no son siempre
// mutaciones de una fila existente (p. ej. "login_fallido" contra un email
// que no existe no muta nada, pero SÍ es un evento de seguridad que se
// debe poder investigar). `metadata` NUNCA debe llevar el email, IP en
// claro, contraseña, token ni cualquier otro dato personal (§RV19/21-7) —
// solo campos ya no identificantes por sí mismos (p. ej. `proveedor`,
// `motivo`, `aud`); la IP se guarda ya hasheada en `ip_hash` (mismo
// criterio que `refresh_token.creado_ip_hash`, migración 0101) para poder
// correlacionar sin poder reconstruir la IP real desde un backup filtrado.
export const migracion0104AuditoriaAuthEvento: Migracion = {
  id: "0104_auditoria_auth_evento",
  descripcion: "auditoria_auth_evento (eventos de auth sin PII, para investigar incidentes)",
  up: `
    CREATE TABLE auditoria_auth_evento (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id  uuid REFERENCES usuario(id) ON DELETE SET NULL,
      tenant_id   uuid REFERENCES tenant(id) ON DELETE SET NULL,
      tipo        text NOT NULL,
      ip_hash     text,
      metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
      creado_en   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX auditoria_auth_evento_usuario_id_idx ON auditoria_auth_evento (usuario_id);
    CREATE INDEX auditoria_auth_evento_tenant_id_idx ON auditoria_auth_evento (tenant_id);
    CREATE INDEX auditoria_auth_evento_tipo_creado_en_idx ON auditoria_auth_evento (tipo, creado_en);
  `,
  down: `
    DROP TABLE IF EXISTS auditoria_auth_evento;
  `,
};

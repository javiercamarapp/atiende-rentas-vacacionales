import type { Migracion } from "../runner/tipos.js";

// H-054 (BACKLOG E08/E15, REQ-117, §Limpieza-2, Lote 3.0): esquema mínimo
// para notificaciones multicanal. Numerado en 0120 (no 0112+, inmediato a
// 0111) porque el rango 0110-0119 está reservado explícitamente al Lote
// 3.4 concurrente (RV22, ver cabecera de 0110_catalogo_canales_mexico.ts)
// — 0120-0129 queda como el siguiente bloque libre para este lote.
//
// `preferencia_notificacion_usuario`: opt-in explícito por usuario+tipo de
// evento+canal (correo/webhook — nunca in_app, que siempre está activo,
// ver `packages/domain/src/notificaciones/preferencias.ts`).
//
// `webhook_tenant`: UN webhook por tenant (no por usuario — H-054 lo pide
// "por tenant"), secreto HMAC cifrado en reposo con el mismo patrón
// AES-256-GCM que `cuenta_canal.credenciales_cifradas` (migración 0090),
// implementación independiente en `apps/api/src/workers/notificaciones/
// cifradoSecreto.ts` para no tocar `apps/api/src/seguridad/` (en edición
// activa del Lote 3.2 concurrente).
export const migracion0120NotificacionesMulticanal: Migracion = {
  id: "0120_notificaciones_multicanal",
  descripcion: "preferencia_notificacion_usuario + webhook_tenant (H-054)",
  up: `
    CREATE TABLE preferencia_notificacion_usuario (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id   uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      tipo_evento  text NOT NULL CHECK (tipo_evento IN ('alerta_observabilidad', 'paridad_precio', 'tarea_limpieza')),
      canal        text NOT NULL CHECK (canal IN ('correo', 'webhook')),
      activo       boolean NOT NULL DEFAULT true,
      creado_en    timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now(),
      UNIQUE (usuario_id, tipo_evento, canal)
    );
    CREATE INDEX preferencia_notificacion_usuario_usuario_id_idx ON preferencia_notificacion_usuario (usuario_id);

    CREATE TABLE webhook_tenant (
      tenant_id         uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
      url               text NOT NULL,
      -- AES-256-GCM del secreto HMAC (nunca en claro) — mismo patrón de
      -- 3 columnas que cuenta_canal.credenciales_cifradas (migración 0090).
      secreto_cifrado   bytea NOT NULL,
      secreto_iv        bytea NOT NULL,
      secreto_tag       bytea NOT NULL,
      activo            boolean NOT NULL DEFAULT false,
      creado_en         timestamptz NOT NULL DEFAULT now(),
      actualizado_en    timestamptz NOT NULL DEFAULT now()
    );
  `,
  down: `
    DROP TABLE IF EXISTS webhook_tenant;
    DROP TABLE IF EXISTS preferencia_notificacion_usuario;
  `,
};

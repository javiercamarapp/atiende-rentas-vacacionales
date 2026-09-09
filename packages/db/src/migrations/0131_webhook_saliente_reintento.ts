import type { Migracion } from "../runner/tipos.js";

// A3-NOTIF-03 (BAJO, docs/auditoria-3/calidad.md): la entrega de webhooks
// salientes de tenant (H-054, `apps/api/src/workers/notificaciones/
// dispatcher.ts`) era "best-effort" de UN solo intento — un fallo
// transitorio del endpoint del tenant (su servidor caído 30 segundos)
// descartaba la notificación para siempre.
//
// Esta tabla es la cola de reintento, siguiendo el MISMO patrón que
// `outbox_evento` (0007_outbox_evento.ts) ya usa para otros eventos: una
// fila persistida por entrega pendiente, consumida periódicamente por un
// worker (`apps/api/src/workers/notificaciones/webhookReintento.ts`).
// Deliberadamente NO reutiliza la tabla `outbox_evento` en sí — esa tabla
// modela "un evento de negocio que aplica un efecto exactamente una vez"
// (§0080), mientras que esto modela "un envío HTTP concreto que puede
// reintentarse varias veces con backoff creciente hasta agotar intentos",
// con su propio ciclo de vida (pendiente → entregado [fila borrada] o
// pendiente → agotado [fila conservada para revisión humana]).
//
// Sin RLS a propósito, mismo criterio que `outbox_evento` y `webhook_tenant`
// (0120_notificaciones_multicanal.ts): es una tabla interna de
// infraestructura de mensajería, nunca leída/escrita directamente por una
// ruta HTTP autenticada de usuario — solo por `dispatcher.ts` (encola) y
// por el worker de reintento (procesa), ambos código de servidor con el
// pool de `app_rv` directo, nunca a través de una sesión RLS de tenant.
//
// `payload` guarda el `PayloadWebhookNotificacion` YA construido (mismo
// shape que `enviarWebhookFirmado` firma) — el reintento reconstruye la
// firma HMAC en el momento del envío (timestamp nuevo, igual que el envío
// original, A3-NOTIF-01) pero nunca reinterpreta ni reconstruye el
// contenido de negocio. La URL/secreto del tenant se resuelven en el
// momento del reintento contra `webhook_tenant` (nunca se copian aquí):
// si el tenant desactivó su webhook entre el fallo original y el
// reintento, ese reintento se cuenta como fallido (no hay a quién
// entregarle) en vez de re-leer una URL/secreto potencialmente obsoletos.
export const migracion0131WebhookSalienteReintento: Migracion = {
  id: "0131_webhook_saliente_reintento",
  descripcion: "webhook_saliente_reintento: cola de reintento con backoff acotado para webhooks salientes fallidos (A3-NOTIF-03)",
  up: `
    CREATE TABLE webhook_saliente_reintento (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id             uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      payload               jsonb NOT NULL,
      -- Intentos YA realizados, incluyendo el intento síncrono original de
      -- dispatcher.ts (la fila nace con intentos=1, nunca 0 — ver
      -- encolarReintentoWebhook).
      intentos              integer NOT NULL DEFAULT 1 CHECK (intentos >= 1),
      proximo_intento_en    timestamptz NOT NULL,
      estado                text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'agotado')),
      -- motivoRechazo de ResultadoEnvioWebhook (p. ej. 'status_no_2xx',
      -- 'error_red_o_timeout') — nunca cuerpo de respuesta ni stack.
      ultimo_motivo_rechazo text,
      creado_en             timestamptz NOT NULL DEFAULT now(),
      actualizado_en        timestamptz NOT NULL DEFAULT now()
    );
    -- El worker de reintento solo necesita "lo pendiente cuya hora ya
    -- llegó", ordenado por antigüedad de turno — índice parcial, igual
    -- criterio que outbox_evento_pendientes_idx.
    CREATE INDEX webhook_saliente_reintento_pendiente_idx
      ON webhook_saliente_reintento (proximo_intento_en)
      WHERE estado = 'pendiente';
  `,
  down: `
    DROP TABLE IF EXISTS webhook_saliente_reintento;
  `,
};

import type { Migracion } from "../runner/tipos.js";

// Notificaciones huésped-facing (confirmación de reserva / recordatorio de
// check-in / alerta de pago fallido): esta columna es la marca de "ya se
// envió" del recordatorio de check-in — sin ella, un cron que corre cada
// pocas horas reenviaría el mismo recordatorio en cada corrida mientras la
// reserva siga cayendo dentro de la ventana de anticipación.
//
// Columna nullable en `ocupacion_unidad` en vez de una tabla aparte
// (distinto criterio que `webhook_saliente_reintento`, 0131): esto no es
// una cola con reintentos/backoff, es un flag de "una vez, para siempre"
// sobre una fila que ya existe — una tabla de dedup 1:1 solo añadiría un
// JOIN a cada lectura sin ganar nada. Se limita a `capa = 'reserva'` en el
// índice parcial porque solo las reservas (nunca los bloqueos) tienen
// check-in.
//
// Sin cambios de RLS: hereda las políticas ya existentes de
// `ocupacion_unidad` (0015_rls_politicas.ts) — el cron que la actualiza
// corre con una sesión de superadmin con delegación de servicio activa
// (mismo mecanismo que `cron_sync_ical`, 0128_delegacion_servicio_
// sistema.ts), que ya satisface `PUEDE_ESCRIBIR_CALENDARIO`.
export const migracion0132RecordatorioCheckinHuesped: Migracion = {
  id: "0132_recordatorio_checkin_huesped",
  descripcion:
    "ocupacion_unidad.recordatorio_checkin_correo_enviado_en: marca de envío único del recordatorio de check-in al huésped",
  up: `
    ALTER TABLE ocupacion_unidad
      ADD COLUMN recordatorio_checkin_correo_enviado_en timestamptz;

    -- El cron ordena/filtra por "check-in próximo" (lower(rango)) sobre
    -- exactamente las filas pendientes — índice parcial sobre ese
    -- predicado + esa expresión (mismo criterio de índice parcial que
    -- webhook_saliente_reintento_pendiente_idx, 0131).
    CREATE INDEX ocupacion_unidad_checkin_pendiente_idx
      ON ocupacion_unidad (lower(rango))
      WHERE capa = 'reserva' AND estado = 'confirmado' AND bloqueante
        AND recordatorio_checkin_correo_enviado_en IS NULL;
  `,
  down: `
    DROP INDEX IF EXISTS ocupacion_unidad_checkin_pendiente_idx;
    ALTER TABLE ocupacion_unidad
      DROP COLUMN IF EXISTS recordatorio_checkin_correo_enviado_en;
  `,
};

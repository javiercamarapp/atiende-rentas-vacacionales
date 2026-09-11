import type { Migracion } from "../runner/tipos.js";

// REQ-095 (SHOULD, RV02-R-06, docs/REQUISITOS.md): "el motor de calendario
// genera el evento de liberación de instrucciones de acceso anclado a T-48h
// antes del check-in, sin depender de marca de cerradura específica".
//
// Mismo límite de esquema ya documentado en
// `apps/api/src/workers/notificacionesHuesped/recordatorioCheckin.ts`
// (0132): `ocupacion_unidad.rango` es un `daterange` — SOLO FECHA, sin hora
// de check-in en ningún lado del dominio (D-002). "T-48h" tal cual lo pide
// el enunciado no es representable con precisión horaria real. En vez de
// fingir esa precisión (inventar una hora de check-in por reserva que el
// esquema no tiene, o simplemente redondear a "2 días" como hace el
// recordatorio de correo), este REQ se resuelve con la aproximación que la
// auditoría marcó como aceptable: T-48h ≈ 48 horas antes de "el día de
// check-in a una HORA DE CORTE configurable", usando la zona horaria REAL
// de la propiedad (`propiedad.zona_horaria`, IANA, NOT NULL desde D-013,
// migración 0004) en vez de UTC/hora de servidor — esto SÍ es dato real del
// esquema, a diferencia de una hora de check-in inventada.
//
// El "evento" que pide el enunciado se modela reutilizando el bus de
// eventos de calendario YA existente (`outbox_evento`, 0007) en vez de
// crear una tabla paralela — mismo criterio que los tipos ya encolados por
// `packages/domain/src/aplicacion/reservas.ts`
// (`cerrar_disponibilidad`/`modificar_disponibilidad`/`liberar_
// disponibilidad`, consumidos por `packages/domain/src/limpieza/aplicacion/
// tareas.ts`). Deliberadamente esta migración NO añade un consumidor: el
// tipo `liberar_instrucciones_acceso` queda, por ahora, en el mismo estado
// que `sync_manual_solicitado` (encolado, sin efecto automático todavía) —
// exactamente lo que pide "sin depender de marca de cerradura específica":
// el motor de calendario solo GENERA el evento; qué sistema externo
// (cerradura inteligente de la marca X, o un simple correo con el código)
// lo consume es una integración futura y deliberadamente desacoplada.
//
// Columna de idempotencia en `ocupacion_unidad` (mismo criterio que
// `recordatorio_checkin_correo_enviado_en`, 0132, en vez de un ledger de
// consumidor aparte): esto es "generar el evento una sola vez por reserva",
// no "un envío HTTP con reintentos" (eso sería `webhook_saliente_
// reintento`, 0131) ni "un efecto aplicado por un consumidor sobre un
// evento ya encolado" (eso ya tiene su propio ledger, `outbox_evento_
// consumido_*`). Limitado a `capa = 'reserva'` en el índice parcial por la
// misma razón que 0132: solo las reservas tienen check-in.
//
// Sin cambios de RLS: hereda las políticas ya existentes de
// `ocupacion_unidad` (0015_rls_politicas.ts) y de `outbox_evento` (sin RLS
// propio, tabla interna de infraestructura de eventos) — el cron que
// escribe ambas corre con una sesión de superadmin con delegación de
// servicio activa (mismo mecanismo que `cron_sync_ical`/
// `recordatorio_checkin_huesped`, 0128), que ya satisface
// `PUEDE_ESCRIBIR_CALENDARIO`.
export const migracion0135LiberacionInstruccionesAcceso: Migracion = {
  id: "0135_liberacion_instrucciones_acceso",
  descripcion:
    "ocupacion_unidad.instrucciones_acceso_liberadas_en: marca de generación única del evento de liberación de instrucciones de acceso (REQ-095, T-48h aproximado)",
  up: `
    ALTER TABLE ocupacion_unidad
      ADD COLUMN instrucciones_acceso_liberadas_en timestamptz;

    -- El cron ordena/filtra por "check-in próximo" sobre exactamente las
    -- filas pendientes — mismo criterio de índice parcial que
    -- ocupacion_unidad_checkin_pendiente_idx (0132). El filtro fino de
    -- T-48h (con zona horaria + hora de corte) se resuelve en la
    -- aplicación sobre este subconjunto ya acotado, nunca en el índice.
    CREATE INDEX ocupacion_unidad_instrucciones_acceso_pendiente_idx
      ON ocupacion_unidad (lower(rango))
      WHERE capa = 'reserva' AND estado = 'confirmado' AND bloqueante
        AND instrucciones_acceso_liberadas_en IS NULL;
  `,
  down: `
    DROP INDEX IF EXISTS ocupacion_unidad_instrucciones_acceso_pendiente_idx;
    ALTER TABLE ocupacion_unidad
      DROP COLUMN IF EXISTS instrucciones_acceso_liberadas_en;
  `,
};

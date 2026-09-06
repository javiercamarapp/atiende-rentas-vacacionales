import type { Migracion } from "../runner/tipos.js";

// Lote 10 (H-037, E06): tabla de alertas con ack. El motor de reglas vive
// en `apps/api/src/workers/observabilidad/alertas.ts` — esta tabla es
// solo el estado persistente (activa/reconocida/resuelta), nunca ejecuta
// ninguna acción por sí misma. `tipo` enumera exactamente las 6 reglas de
// LOTES.md/H-090 (sync sin éxito, feed en cuarentena, conflicto
// pendiente, outbox atascada, drift, token de canal revocado); cada una
// tiene su runbook en docs/runbooks/*.md (§Operación-1: "nunca cancela ni
// contacta").
export const migracion0081Alerta: Migracion = {
  id: "0081_alerta",
  descripcion: "alerta: tabla de alertas de observabilidad con ack (nunca ejecuta acciones irreversibles)",
  up: `
    CREATE TABLE alerta (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo               text NOT NULL CHECK (
                           tipo IN (
                             'sync_sin_exito',
                             'feed_en_cuarentena',
                             'conflicto_pendiente',
                             'outbox_atascada',
                             'drift',
                             'token_canal_revocado'
                           )
                         ),
      severidad          text NOT NULL DEFAULT 'alta' CHECK (severidad IN ('baja', 'media', 'alta')),
      canal_id           uuid REFERENCES canal(id),
      unidad_id          uuid REFERENCES unidad(id),
      mensaje            text NOT NULL,
      -- Metadatos operativos sin PII (H-047 aplica también aquí): solo
      -- ids/umbrales/conteos, nunca email/teléfono/nombre de huésped.
      metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
      -- Acción reversible efectivamente tomada por el motor de alertas al
      -- dispararse (nunca una cancelación/contacto — §Operación-1). NULL
      -- si la regla solo notifica, sin pausar nada.
      accion_reversible  text,
      estado             text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'reconocida', 'resuelta')),
      creado_en          timestamptz NOT NULL DEFAULT now(),
      reconocida_por     uuid REFERENCES usuario(id),
      reconocida_en      timestamptz,
      resuelta_en        timestamptz
    );
    CREATE INDEX alerta_estado_idx ON alerta (estado);
    CREATE INDEX alerta_tipo_idx ON alerta (tipo);
  `,
  down: `
    DROP TABLE IF EXISTS alerta;
  `,
};

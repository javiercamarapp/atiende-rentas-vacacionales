import type { Migracion } from "../runner/tipos.js";

// Lote 6 (BACKLOG E09, H-056 a H-061): esquema base de mensajería con
// huéspedes. Rango 0040-0049 reservado a este lote (coordinación de rangos
// documentada en la cabecera de packages/db/src/migrations/index.ts: 0010-
// 0019 Lote 3, 0020-0029 Lote 2, 0030-0039 Lote 5, 0050-0059 Lote 7,
// 0080-0089 Lote 10, 0090-0092 extensión de Lote 3 sobre Lote 2).
//
// `conversacion`: agrupa mensajes por unidad/reserva/huésped —
// `ocupacion_unidad_id` es NULLABLE porque una conversación puede empezar
// antes de que exista una reserva confirmada (pregunta previa a reservar,
// RV10 (e)). `huesped_minimo_id` reutiliza la tabla mínima de Lote 1
// (D-014) — nunca se crea un CRM de huésped nuevo aquí.
//
// `mensaje`: entrante (del huésped, dato NO confiable — RV19-R-16, nunca
// interpretado como instrucción) o saliente (aprobado y realmente enviado,
// nunca uno "en borrador" — eso vive en `borrador_mensaje`, migración
// 0042). `origen`: `simulador` (packages/sim/src/mensajeria) o `manual`
// (un operador transcribe un mensaje recibido fuera de banda); `canal` se
// deja declarado para cuando exista un adaptador real (ninguno hoy).
export const migracion0040MensajeriaEsquema: Migracion = {
  id: "0040_mensajeria_esquema",
  descripcion: "mensajeria: conversacion + mensaje (entrante/saliente)",
  up: `
    CREATE TABLE conversacion (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id             uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      ocupacion_unidad_id   uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      canal_id              uuid NOT NULL REFERENCES canal(id),
      huesped_minimo_id     uuid REFERENCES huesped_minimo(id) ON DELETE SET NULL,
      idioma                text NOT NULL DEFAULT 'es' CHECK (idioma IN ('es', 'en')),
      creado_en             timestamptz NOT NULL DEFAULT now(),
      actualizado_en        timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX conversacion_unidad_id_idx ON conversacion (unidad_id);
    CREATE INDEX conversacion_ocupacion_unidad_id_idx ON conversacion (ocupacion_unidad_id);

    CREATE TABLE mensaje (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversacion_id   uuid NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
      direccion         text NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
      origen            text NOT NULL CHECK (origen IN ('canal', 'simulador', 'manual')),
      texto             text NOT NULL,
      redactado         boolean NOT NULL DEFAULT false,
      creado_en         timestamptz NOT NULL DEFAULT now(),

      -- Un mensaje saliente real siempre proviene de un borrador aprobado
      -- (migración 0042 añade la FK inversa desde borrador_mensaje); un
      -- mensaje saliente jamás se inserta directamente por un proceso
      -- automático (D-006) — apps/api solo inserta aquí dentro de la misma
      -- transacción que marca el borrador como 'enviado'.
      CONSTRAINT mensaje_saliente_no_vacio CHECK (direccion <> 'saliente' OR length(texto) > 0)
    );
    CREATE INDEX mensaje_conversacion_id_idx ON mensaje (conversacion_id);
    CREATE INDEX mensaje_conversacion_creado_en_idx ON mensaje (conversacion_id, creado_en);
  `,
  down: `
    DROP TABLE IF EXISTS mensaje;
    DROP TABLE IF EXISTS conversacion;
  `,
};

import type { Migracion } from "../runner/tipos.js";

// `evento_canal_importado`: idempotencia de import por (canal, unidad, UID)
// (H-030, REQ-036) — guarda la última versión conocida (SEQUENCE/DTSTAMP/
// hash) de cada evento de canal para que `resolverVersion` de
// `@atiende-rv/domain` decida aplicar/descartar/revisar en el siguiente
// ciclo, y para la reconciliación completa (comparar contra el conjunto de
// UIDs presentes en el feed actual, H-032).
//
// `bloqueo_exportado`: metadato "exportado_a" por bloqueo+canal (D-004
// capa 3 del anti-eco) — también guarda el hash de contenido exportado
// (capa 2).
export const migracion0021SincronizacionCanal: Migracion = {
  id: "0021_sincronizacion_canal",
  descripcion: "evento_canal_importado (idempotencia), bloqueo_exportado (anti-eco capas 2/3)",
  up: `
    CREATE TABLE evento_canal_importado (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id              uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      canal_id               uuid NOT NULL REFERENCES canal(id),
      uid_evento             text NOT NULL,
      sequence               integer,
      dtstamp                timestamptz NOT NULL,
      hash_contenido         text NOT NULL,
      ocupacion_unidad_id    uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      ultima_accion          text NOT NULL CHECK (
                               ultima_accion IN (
                                 'aplicar', 'descartar', 'sin_cambio',
                                 'revisar_uid_reciclado', 'eco'
                               )
                             ),
      creado_en              timestamptz NOT NULL DEFAULT now(),
      actualizado_en         timestamptz NOT NULL DEFAULT now(),
      UNIQUE (unidad_id, canal_id, uid_evento)
    );
    CREATE INDEX evento_canal_importado_unidad_canal_idx
      ON evento_canal_importado (unidad_id, canal_id);

    CREATE TABLE bloqueo_exportado (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ocupacion_unidad_id    uuid NOT NULL REFERENCES ocupacion_unidad(id) ON DELETE CASCADE,
      canal_id               uuid NOT NULL REFERENCES canal(id),
      uid_exportado          text NOT NULL,
      hash_contenido         text NOT NULL,
      -- SEQUENCE iCal incremental propio de este bloqueo hacia este canal
      -- (H-026): se incrementa solo cuando el hash de contenido cambia
      -- respecto al último export (el bloqueo se movió/modificó).
      sequence               integer NOT NULL DEFAULT 0,
      exportado_en           timestamptz NOT NULL DEFAULT now(),
      UNIQUE (ocupacion_unidad_id, canal_id)
    );
    CREATE INDEX bloqueo_exportado_canal_idx ON bloqueo_exportado (canal_id);
  `,
  down: `
    DROP TABLE IF EXISTS bloqueo_exportado;
    DROP TABLE IF EXISTS evento_canal_importado;
  `,
};

import type { Migracion } from "../runner/tipos.js";

// Tabla única de ocupación con discriminador `capa` (D-002/D-012, BLUEPRINT
// §3.1-3.2, corrección de auditoría independiente BC1). `huesped_minimo`
// (D-014) es una tabla propia y minimalista, referenciada opcionalmente
// desde una reserva — nunca un CRM de huéspedes.
//
// El EXCLUDE corre SOLO sobre capa='reserva' con estado<>'cancelado' y
// bloqueante=true (reservas confirmadas y holds que sí cierran la noche,
// REQ-048). Bloqueos de propietario/mantenimiento/buffer (capa='bloqueo')
// NUNCA participan del EXCLUDE — su INSERT nunca es rechazado por la base
// de datos, sin importar el solape; el conflicto entre capas se detecta en
// la capa de aplicación (packages/domain) y se registra en
// conflicto_calendario (migración 0006), nunca se resuelve cancelando la
// reserva de mayor precedencia.
export const migracion0005OcupacionUnidad: Migracion = {
  id: "0005_ocupacion_unidad",
  descripcion: "huesped_minimo, ocupacion_unidad + EXCLUDE USING gist",
  up: `
    CREATE TABLE huesped_minimo (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre     text,
      contacto   text,
      creado_en  timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ocupacion_unidad (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id          uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      rango              daterange NOT NULL,
      capa               text NOT NULL CHECK (capa IN ('reserva', 'bloqueo')),
      razon              text NOT NULL CHECK (
                           razon IN (
                             'RESERVA_CANAL',
                             'BLOQUEO_PROPIETARIO',
                             'MANTENIMIENTO',
                             'BUFFER_LIMPIEZA'
                           )
                         ),
      canal_origen_id    uuid REFERENCES canal(id),
      external_id        text,
      estado             text NOT NULL DEFAULT 'confirmado' CHECK (
                           estado IN ('confirmado', 'provisional', 'cancelado', 'conflicto_pendiente')
                         ),
      bloqueante         boolean NOT NULL DEFAULT true,
      huesped_minimo_id  uuid REFERENCES huesped_minimo(id) ON DELETE SET NULL,
      version            integer NOT NULL DEFAULT 1,
      creado_en          timestamptz NOT NULL DEFAULT now(),
      actualizado_en     timestamptz NOT NULL DEFAULT now(),

      -- H-002: rango semiabierto [check_in, check_out) forzado, nunca vacío.
      -- daterange normaliza automáticamente a la forma canónica '[)', pero
      -- el CHECK lo hace explícito y defensivo (documenta el invariante en
      -- el propio esquema, no solo en el tipo de columna).
      CONSTRAINT ocupacion_unidad_rango_no_vacio CHECK (NOT isempty(rango)),
      CONSTRAINT ocupacion_unidad_rango_semiabierto CHECK (
        lower_inc(rango) AND NOT upper_inc(rango)
      ),
      -- capa y razon deben ser consistentes: RESERVA_CANAL es la única razón
      -- de capa='reserva'; las otras tres son exclusivas de capa='bloqueo'.
      CONSTRAINT ocupacion_unidad_capa_razon_coherente CHECK (
        (capa = 'reserva' AND razon = 'RESERVA_CANAL')
        OR (capa = 'bloqueo' AND razon IN ('BLOQUEO_PROPIETARIO', 'MANTENIMIENTO', 'BUFFER_LIMPIEZA'))
      )
    );

    CREATE INDEX ocupacion_unidad_unidad_id_idx ON ocupacion_unidad (unidad_id);
    CREATE INDEX ocupacion_unidad_rango_idx ON ocupacion_unidad USING gist (rango);

    ALTER TABLE ocupacion_unidad
      ADD CONSTRAINT ocupacion_unidad_sin_solape
      EXCLUDE USING gist (
        unidad_id WITH =,
        rango WITH &&
      ) WHERE (capa = 'reserva' AND estado <> 'cancelado' AND bloqueante);
  `,
  down: `
    DROP TABLE IF EXISTS ocupacion_unidad;
    DROP TABLE IF EXISTS huesped_minimo;
  `,
};

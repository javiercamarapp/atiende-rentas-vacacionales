import type { Migracion } from "../runner/tipos.js";

// H-068 (RV13 §1, BACKLOG E11): esquema mínimo de pricing básico —
// precio base por unidad, temporadas, descuentos por duración (umbrales
// estándar 7/28 noches confirmados con fuente primaria, RV13-R-02),
// min-stay dinámico por rango/día de check-in (RV13-R-03), y reglas por
// canal (markup, RV13-R-04). Todo en centavos (bigint), consistente con
// packages/domain/src/pricing (motor puro, sin float). `fuente` es
// obligatorio en `tarifa_descuento_duracion` para nunca mostrar un
// porcentaje sin cita (RV13-R-02: umbrales declarados con fuente).
export const migracion0053PricingEsquema: Migracion = {
  id: "0053_pricing_esquema",
  descripcion: "tarifa_base, tarifa_temporada, tarifa_descuento_duracion, tarifa_min_stay, tarifa_regla_canal",
  up: `
    CREATE TABLE tarifa_base (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id                 uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      precio_noche_centavos     bigint NOT NULL CHECK (precio_noche_centavos >= 0),
      moneda                    text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      vigente_desde             date NOT NULL DEFAULT CURRENT_DATE,
      creado_por                uuid REFERENCES usuario(id),
      creado_en                 timestamptz NOT NULL DEFAULT now(),
      UNIQUE (unidad_id, vigente_desde)
    );
    CREATE INDEX tarifa_base_unidad_idx ON tarifa_base (unidad_id);

    CREATE TABLE tarifa_temporada (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id                uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      nombre                   text NOT NULL,
      fecha_inicio             date NOT NULL,
      fecha_fin                date NOT NULL,
      precio_noche_centavos    bigint NOT NULL CHECK (precio_noche_centavos >= 0),
      moneda                   text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      creado_por               uuid REFERENCES usuario(id),
      creado_en                timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT tarifa_temporada_rango_valido CHECK (fecha_inicio < fecha_fin)
    );
    CREATE INDEX tarifa_temporada_unidad_idx ON tarifa_temporada (unidad_id);

    CREATE TABLE tarifa_descuento_duracion (
      id                                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id                             uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      noches_minimas                        integer NOT NULL CHECK (noches_minimas > 0),
      porcentaje_descuento_basis_points     integer NOT NULL CHECK (porcentaje_descuento_basis_points BETWEEN 0 AND 10000),
      fuente                                text NOT NULL,
      creado_en                             timestamptz NOT NULL DEFAULT now(),
      UNIQUE (unidad_id, noches_minimas)
    );
    CREATE INDEX tarifa_descuento_duracion_unidad_idx ON tarifa_descuento_duracion (unidad_id);

    CREATE TABLE tarifa_min_stay (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id           uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      fecha_inicio        date NOT NULL,
      fecha_fin           date NOT NULL,
      dia_semana_checkin  integer CHECK (dia_semana_checkin BETWEEN 0 AND 6),
      noches_minimas      integer NOT NULL CHECK (noches_minimas > 0),
      creado_en           timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT tarifa_min_stay_rango_valido CHECK (fecha_inicio < fecha_fin)
    );
    CREATE INDEX tarifa_min_stay_unidad_idx ON tarifa_min_stay (unidad_id);

    -- RV13-R-04/R-06: markup por canal, INACTIVO por defecto — activarlo es
    -- una decisión explícita del tenant, nunca implícita al crear la fila.
    CREATE TABLE tarifa_regla_canal (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id              uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      canal_id               uuid NOT NULL REFERENCES canal(id),
      markup_basis_points    integer NOT NULL DEFAULT 0 CHECK (markup_basis_points >= 0),
      activo                 boolean NOT NULL DEFAULT false,
      creado_en              timestamptz NOT NULL DEFAULT now(),
      UNIQUE (unidad_id, canal_id)
    );
    CREATE INDEX tarifa_regla_canal_unidad_idx ON tarifa_regla_canal (unidad_id);
  `,
  down: `
    DROP TABLE IF EXISTS tarifa_regla_canal;
    DROP TABLE IF EXISTS tarifa_min_stay;
    DROP TABLE IF EXISTS tarifa_descuento_duracion;
    DROP TABLE IF EXISTS tarifa_temporada;
    DROP TABLE IF EXISTS tarifa_base;
  `,
};

import type { Migracion } from "../runner/tipos.js";

// Rango 0050-0059 reservado a Lote 7 (finanzas/owners/statements + pricing +
// reporting, BACKLOG E10/E11/E12), en paralelo con Lote 4/5/6/8/9/10 —
// LOTES.md, nota de cabecera "punto de fusión compartido". Esta migración
// añade `propiedad.moneda` (ALTER, nunca reescribe 0004) y `unidad.rfc_
// propietario` (ALTER, nunca reescribe 0004) + el núcleo de "movimiento
// financiero por reserva" (RV12 §2.1, H-062/H-063/H-065): `reserva_
// financiero` es 1:1 con una fila de `ocupacion_unidad` de capa='reserva'
// (creada por Lote 1/Lote 2), nunca una tabla paralela de "reservas" — la
// fuente de verdad de fechas/unidad/canal sigue siendo `ocupacion_unidad`
// (H-062: "calculado desde reserva, nunca al revés").
//
// Todos los montos se guardan en CENTAVOS (bigint), nunca en `numeric`
// decimal ni en tipos de punto flotante — el motor puro de
// packages/domain/src/finanzas ya trabaja exclusivamente en centavos
// (redondeo determinista, sin float); esta migración solo persiste el
// mismo tipo de dato.
export const migracion0050FinanzasEsquema: Migracion = {
  id: "0050_finanzas_esquema",
  descripcion: "propiedad.moneda, unidad.rfc_propietario, regla_comision_canal, reserva_financiero, linea_gasto, linea_impuesto",
  up: `
    ALTER TABLE propiedad ADD COLUMN moneda text NOT NULL DEFAULT 'MXN' CHECK (moneda ~ '^[A-Z]{3}$');

    -- H-067 (RV12 §5, B-005): captura de RFC, SIN calcular ningún impuesto.
    ALTER TABLE unidad ADD COLUMN rfc_propietario text;

    -- H-063/H-065 (RV12-R-01/R-05): configuración de comisión de canal por
    -- tenant/canal, opcionalmente acotada a una propiedad — NUNCA
    -- hardcodeada en código. ya_neto_de_comision=true es el caso Airbnb
    -- confirmado (L-RV12-02); Booking.com/Vrbo quedan en false con
    -- porcentaje editable hasta tener fuente oficial (R1 de RV12).
    CREATE TABLE regla_comision_canal (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id               uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      canal_id                uuid NOT NULL REFERENCES canal(id),
      propiedad_id            uuid REFERENCES propiedad(id) ON DELETE CASCADE,
      ya_neto_de_comision     boolean NOT NULL DEFAULT false,
      comision_basis_points   integer NOT NULL DEFAULT 0 CHECK (comision_basis_points BETWEEN 0 AND 10000),
      fuente                  text NOT NULL,
      vigente_desde           date NOT NULL DEFAULT CURRENT_DATE,
      creado_en               timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, canal_id, propiedad_id, vigente_desde)
    );
    CREATE INDEX regla_comision_canal_tenant_idx ON regla_comision_canal (tenant_id, canal_id);

    CREATE TABLE reserva_financiero (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ocupacion_unidad_id           uuid NOT NULL UNIQUE REFERENCES ocupacion_unidad(id) ON DELETE CASCADE,
      moneda                        text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      monto_bruto_centavos          bigint NOT NULL CHECK (monto_bruto_centavos >= 0),
      ya_neto_de_comision           boolean NOT NULL DEFAULT false,
      comision_canal_basis_points   integer NOT NULL DEFAULT 0,
      comision_canal_fuente         text NOT NULL DEFAULT '',
      comision_canal_centavos       bigint NOT NULL DEFAULT 0 CHECK (comision_canal_centavos >= 0),
      comision_gestor_basis_points  integer NOT NULL DEFAULT 0,
      comision_gestor_base          text NOT NULL DEFAULT 'neto_de_canal' CHECK (comision_gestor_base IN ('bruto', 'neto_de_canal')),
      comision_gestor_centavos      bigint NOT NULL DEFAULT 0 CHECK (comision_gestor_centavos >= 0),
      monto_recibido_centavos       bigint NOT NULL DEFAULT 0,
      neto_centavos                 bigint NOT NULL DEFAULT 0,
      creado_por                    uuid REFERENCES usuario(id),
      creado_en                     timestamptz NOT NULL DEFAULT now(),
      actualizado_en                timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX reserva_financiero_ocupacion_idx ON reserva_financiero (ocupacion_unidad_id);

    CREATE TABLE linea_gasto (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reserva_financiero_id    uuid NOT NULL REFERENCES reserva_financiero(id) ON DELETE CASCADE,
      tipo                     text NOT NULL,
      descripcion              text,
      monto_centavos           bigint NOT NULL CHECK (monto_centavos >= 0),
      moneda                   text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      creado_por               uuid REFERENCES usuario(id),
      creado_en                timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX linea_gasto_reserva_financiero_idx ON linea_gasto (reserva_financiero_id);

    -- H-067/D-023/B-005: SIEMPRE marcada para revisión legal/fiscal — el
    -- CHECK hace explícito en el propio esquema que esta tabla nunca
    -- presenta una cifra fiscal como definitiva sin ese flag en true.
    CREATE TABLE linea_impuesto (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reserva_financiero_id    uuid NOT NULL REFERENCES reserva_financiero(id) ON DELETE CASCADE,
      tipo                     text NOT NULL,
      monto_centavos           bigint NOT NULL CHECK (monto_centavos >= 0),
      moneda                   text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      revision_fiscal          boolean NOT NULL DEFAULT true CHECK (revision_fiscal = true),
      nota                     text NOT NULL DEFAULT 'Revisión legal/fiscal pendiente (B-005) — cifra no verificada con fuente oficial del SAT',
      creado_por               uuid REFERENCES usuario(id),
      creado_en                timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX linea_impuesto_reserva_financiero_idx ON linea_impuesto (reserva_financiero_id);
  `,
  down: `
    DROP TABLE IF EXISTS linea_impuesto;
    DROP TABLE IF EXISTS linea_gasto;
    DROP TABLE IF EXISTS reserva_financiero;
    DROP TABLE IF EXISTS regla_comision_canal;
    ALTER TABLE unidad DROP COLUMN IF EXISTS rfc_propietario;
    ALTER TABLE propiedad DROP COLUMN IF EXISTS moneda;
  `,
};

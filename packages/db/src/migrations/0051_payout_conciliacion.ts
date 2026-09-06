import type { Migracion } from "../runner/tipos.js";

// H-064 (RV12 §4, Finanzas-2): payout de canal + conciliación payout↔
// reservas. `payout_linea.estado_conciliacion` es el estado explícito que
// exige el encargo (conciliado/pendiente/discrepancia) — calculado por
// packages/domain/src/finanzas/conciliacion.ts y persistido aquí, nunca al
// revés. `ocupacion_unidad_id` es NULLABLE porque una línea sin reserva
// candidata queda `pendiente` con la fila sin asociar (revisión manual).
export const migracion0051PayoutConciliacion: Migracion = {
  id: "0051_payout_conciliacion",
  descripcion: "payout_canal, payout_linea (conciliación por canal)",
  up: `
    CREATE TABLE payout_canal (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id              uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      canal_id               uuid NOT NULL REFERENCES canal(id),
      cuenta_canal_id        uuid REFERENCES cuenta_canal(id) ON DELETE SET NULL,
      referencia_externa     text,
      moneda                 text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      monto_total_centavos   bigint NOT NULL,
      fecha_payout           date NOT NULL,
      origen_importacion     text NOT NULL DEFAULT 'manual' CHECK (origen_importacion IN ('manual', 'csv_vrbo', 'csv_generico')),
      creado_por             uuid REFERENCES usuario(id),
      creado_en              timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX payout_canal_tenant_idx ON payout_canal (tenant_id);

    CREATE TABLE payout_linea (
      id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payout_id                      uuid NOT NULL REFERENCES payout_canal(id) ON DELETE CASCADE,
      ocupacion_unidad_id            uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      referencia_externa_reserva     text,
      monto_centavos                 bigint NOT NULL,
      monto_esperado_centavos        bigint,
      estado_conciliacion            text NOT NULL DEFAULT 'pendiente' CHECK (
                                        estado_conciliacion IN ('conciliado', 'pendiente', 'discrepancia')
                                      ),
      nota                           text,
      creado_en                      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX payout_linea_payout_idx ON payout_linea (payout_id);
    CREATE INDEX payout_linea_ocupacion_idx ON payout_linea (ocupacion_unidad_id);
  `,
  down: `
    DROP TABLE IF EXISTS payout_linea;
    DROP TABLE IF EXISTS payout_canal;
  `,
};

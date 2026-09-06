import type { Migracion } from "../runner/tipos.js";

// H-062 (RV12 §2, Finanzas-1): owner statement mensual por propietario,
// versionado (nunca sobreescrito — DEFINICION-DE-HECHO §Auditoría-1/§6:
// "un ajuste manual a un statement ya generado debe versionar, no
// sobrescribir"). `UNIQUE (owner_id, periodo_inicio, periodo_fin, version)`
// permite múltiples versiones del mismo periodo; la versión "vigente" es
// siempre `MAX(version)` para ese `(owner_id, periodo)` — resuelto en la
// capa de aplicación (apps/api), nunca con una columna `es_vigente` mutable
// (evita el error de dos filas "vigentes" simultáneas).
export const migracion0052OwnerStatement: Migracion = {
  id: "0052_owner_statement",
  descripcion: "owner_statement (versionado, idempotente por hash), owner_statement_linea",
  up: `
    CREATE TABLE owner_statement (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id                    uuid NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
      tenant_id                   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      periodo_inicio               date NOT NULL,
      periodo_fin                  date NOT NULL,
      version                     integer NOT NULL DEFAULT 1 CHECK (version >= 1),
      moneda                      text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      ingresos_brutos_centavos    bigint NOT NULL,
      comision_canal_centavos     bigint NOT NULL,
      comision_gestor_centavos    bigint NOT NULL,
      gastos_centavos             bigint NOT NULL,
      impuestos_centavos          bigint NOT NULL,
      neto_centavos               bigint NOT NULL,
      hash_contenido              text NOT NULL,
      motivo_version              text,
      generado_por                uuid REFERENCES usuario(id),
      generado_en                 timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT owner_statement_periodo_valido CHECK (periodo_inicio < periodo_fin),
      UNIQUE (owner_id, periodo_inicio, periodo_fin, version)
    );
    CREATE INDEX owner_statement_owner_periodo_idx ON owner_statement (owner_id, periodo_inicio, periodo_fin);
    CREATE INDEX owner_statement_tenant_idx ON owner_statement (tenant_id);

    CREATE TABLE owner_statement_linea (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      statement_id           uuid NOT NULL REFERENCES owner_statement(id) ON DELETE CASCADE,
      ocupacion_unidad_id    uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      tipo                   text NOT NULL CHECK (tipo IN ('ingreso', 'comision_canal', 'comision_gestor', 'gasto', 'impuesto')),
      descripcion            text NOT NULL,
      monto_centavos         bigint NOT NULL,
      moneda                 text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      creado_en              timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX owner_statement_linea_statement_idx ON owner_statement_linea (statement_id);
  `,
  down: `
    DROP TABLE IF EXISTS owner_statement_linea;
    DROP TABLE IF EXISTS owner_statement;
  `,
};

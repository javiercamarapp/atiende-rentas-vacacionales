import type { Migracion } from "../runner/tipos.js";

// `canal` es un catálogo mínimo (solo lo necesario como FK de
// ocupacion_unidad.canal_origen_id); las credenciales/estado de conexión
// por cuenta (`cuenta_canal`) son de Lote 2/3, no de este archivo.
//
// `propiedad.zona_horaria` es IANA obligatoria (D-013): el CHECK aquí solo
// impide vacío/NULL; la validación real contra la base de datos IANA vive
// en packages/domain (validarZonaHorariaIana), porque PGlite y
// embedded-postgres pueden traer catálogos tzdata ligeramente distintos y
// no queremos que el esquema dependa de eso para portabilidad entre
// motores (D-009/D-022).
export const migracion0004CanalPropiedadUnidad: Migracion = {
  id: "0004_canal_propiedad_unidad",
  descripcion: "canal (catálogo), propiedad, unidad",
  up: `
    CREATE TABLE canal (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      codigo     text NOT NULL UNIQUE,
      nombre     text NOT NULL,
      creado_en  timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO canal (codigo, nombre) VALUES
      ('airbnb', 'Airbnb'),
      ('vrbo', 'Vrbo'),
      ('booking', 'Booking.com'),
      ('manual', 'Bloqueo manual interno');

    CREATE TABLE propiedad (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      nombre         text NOT NULL,
      zona_horaria   text NOT NULL CHECK (zona_horaria <> ''),
      creado_en      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX propiedad_tenant_id_idx ON propiedad (tenant_id);

    -- REQ-071/REQ-136: multi-unidad — varias unidades bajo una misma
    -- propiedad, cada una con su propio invariante de exclusión (RV17 §14).
    CREATE TABLE unidad (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      propiedad_id              uuid NOT NULL REFERENCES propiedad(id) ON DELETE CASCADE,
      owner_id                  uuid REFERENCES owner(id) ON DELETE SET NULL,
      nombre                    text NOT NULL,
      duracion_minima_noches    integer NOT NULL DEFAULT 1
                                  CHECK (duracion_minima_noches >= 1),
      creado_en                 timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX unidad_propiedad_id_idx ON unidad (propiedad_id);
  `,
  down: `
    DROP TABLE IF EXISTS unidad;
    DROP TABLE IF EXISTS propiedad;
    DROP TABLE IF EXISTS canal;
  `,
};

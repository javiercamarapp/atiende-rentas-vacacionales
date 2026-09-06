import type { Migracion } from "../runner/tipos.js";

// btree_gist es obligatoria para el EXCLUDE USING gist de ocupacion_unidad
// (D-012/BLUEPRINT §3.2): GiST no indexa nativamente el operador de
// igualdad sobre uuid sin ella. gen_random_uuid() es nativa desde
// PostgreSQL 13 (y desde la versión de PGlite usada aquí), no requiere
// pgcrypto.
export const migracion0001Extensiones: Migracion = {
  id: "0001_extensiones",
  descripcion: "Extensión btree_gist requerida por el EXCLUDE de ocupacion_unidad",
  up: `
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  `,
  down: `
    DROP EXTENSION IF EXISTS btree_gist;
  `,
};

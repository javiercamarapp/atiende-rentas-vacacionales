import { createHash } from "node:crypto";
import type { Migracion } from "../src/runner/tipos.js";

/**
 * D-DSD-14: hash de contenido por migración para cerrar el drift de
 * esquema invisible que permitía el runner original — que rastreaba
 * aplicación SOLO por el string `id` en `schema_migrations`, sin ningún
 * hash de contenido. Si alguien reutilizaba un `id` ya aplicado con un
 * `up` distinto (rebase/merge descuidado que reescribe el archivo de una
 * migración ya desplegada, en vez de numerar una nueva), el runner lo
 * saltaba en silencio — el segundo `up` nunca se aplicaba y nunca se
 * reportaba ninguna advertencia, dejando el esquema real permanentemente
 * divergido del código fuente.
 *
 * Función pura, sin IO: tanto el runner en tiempo de ejecución
 * (`packages/db/src/runner/migrar.ts`, que falla fuerte en cuanto detecta
 * drift) como el comando `npm run db:verificar-migraciones`
 * (`scripts/verificar-migraciones.mjs`, que audita un ambiente ya
 * desplegado sin aplicar nada) importan `calcularHashMigracion`/
 * `verificarHashesMigraciones` de aquí — un único cálculo de hash, nunca
 * reimplementado por separado en dos sitios.
 */
export function calcularHashMigracion(migracion: Migracion): string {
  return createHash("sha256").update(migracion.up, "utf8").digest("hex");
}

export interface FilaMigracionAplicada {
  id: string;
  /** `null` cuando la fila se aplicó antes de que el runner rastreara
   * hashes de contenido (adopción retroactiva de esta protección en un
   * ambiente ya desplegado) — se trata como "sin verificar todavía",
   * nunca como drift; el runner la adopta (persiste el hash actual) la
   * próxima vez que corre sobre ese ambiente. */
  hash: string | null;
}

export interface DriftHashMigracion {
  id: string;
  hashEsperado: string;
  hashAlmacenado: string;
}

export interface ReporteVerificacionHash {
  ok: boolean;
  /** ids ya aplicados cuyo hash almacenado NO coincide con el hash del
   * `up` actual en el catálogo en memoria — drift real de contenido bajo
   * el mismo id, el escenario central de D-DSD-14. */
  drift: DriftHashMigracion[];
  /** ids aplicados sin hash almacenado todavía (adoptados antes de que
   * existiera esta verificación) — informativo, no es un error. */
  sinHashRegistrado: string[];
  /** ids aplicados en la base de datos que ya no existen en el catálogo
   * en memoria (código desincronizado del esquema real) — distinto de
   * drift de contenido, pero también digno de revisión humana. */
  aplicadasFueraDeCatalogo: string[];
}

export function verificarHashesMigraciones(
  catalogo: Migracion[],
  aplicadas: readonly FilaMigracionAplicada[],
): ReporteVerificacionHash {
  const porId = new Map(catalogo.map((m) => [m.id, m]));
  const drift: DriftHashMigracion[] = [];
  const sinHashRegistrado: string[] = [];
  const aplicadasFueraDeCatalogo: string[] = [];

  for (const fila of aplicadas) {
    const migracion = porId.get(fila.id);
    if (!migracion) {
      aplicadasFueraDeCatalogo.push(fila.id);
      continue;
    }
    if (fila.hash === null) {
      sinHashRegistrado.push(fila.id);
      continue;
    }
    const hashEsperado = calcularHashMigracion(migracion);
    if (hashEsperado !== fila.hash) {
      drift.push({ id: fila.id, hashEsperado, hashAlmacenado: fila.hash });
    }
  }

  return { ok: drift.length === 0, drift, sinHashRegistrado, aplicadasFueraDeCatalogo };
}

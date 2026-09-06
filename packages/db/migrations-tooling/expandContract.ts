import type { Migracion } from "../src/runner/tipos.js";

/**
 * Tooling de migraciones seguras (Lote 10, H-088). Patrón expand/contract:
 * una migración solo puede hacer un `DROP`/`ALTER` destructivo (pérdida de
 * datos/estructura irreversible sin backup) si declara explícitamente esa
 * intención en su `descripcion` con el marcador `[permite-destructivo]`
 * (ver `MARCADOR_PERMITE_DESTRUCTIVO`). Sin el marcador, el chequeo falla
 * — pensado para correr en CI antes de aplicar cualquier migración nueva
 * (`verificarCatalogo`/`scripts/verificar-lotes.mjs`).
 *
 * Deliberadamente NO se modifica `Migracion` (tipo de Lote 1) para añadir
 * un campo `permiteDestructivo: boolean` — el marcador vive en el texto de
 * `descripcion`, que ya es parte del contrato existente y no requiere
 * tocar `packages/db/src/runner/tipos.ts` (fuera de las carpetas
 * exclusivas de Lote 10).
 */

export const MARCADOR_PERMITE_DESTRUCTIVO = "[permite-destructivo]";

export interface PatronDestructivo {
  nombre: string;
  regex: RegExp;
}

/**
 * Patrones detectados sobre el SQL crudo de `up`. Casados sin distinguir
 * mayúsculas/minúsculas; no es un parser SQL completo (esta base de datos
 * usa SQL hecho a mano en migraciones .ts, no un ORM) — es un chequeo de
 * intención declarada, complementario a la revisión humana, no un
 * reemplazo de ella.
 *
 * Deliberadamente NO incluye `DROP CONSTRAINT` ni `DROP INDEX`: ninguna de
 * las dos pierde datos (una restricción o un índice se pueden recrear sin
 * tocar las filas existentes) y el patrón "DROP CONSTRAINT ... ADD
 * CONSTRAINT <mismo nombre>" para ampliar un CHECK ya existe de forma
 * legítima en el catálogo real (`0013_auditoria_triggers.ts`, `up`, para
 * añadir `ACCESO_ROMPER_CRISTAL` al CHECK de `operacion`). El criterio
 * aquí es pérdida de DATOS irreversible, no cualquier `DROP`.
 */
export const PATRONES_DESTRUCTIVOS: PatronDestructivo[] = [
  { nombre: "DROP TABLE", regex: /\bDROP\s+TABLE\b/i },
  { nombre: "DROP COLUMN", regex: /\bDROP\s+COLUMN\b/i },
  { nombre: "ALTER COLUMN ... TYPE", regex: /\bALTER\s+COLUMN\s+\S+\s+TYPE\b/i },
  { nombre: "TRUNCATE", regex: /\bTRUNCATE\b/i },
  { nombre: "DROP EXTENSION", regex: /\bDROP\s+EXTENSION\b/i },
];

export interface AnalisisMigracion {
  id: string;
  patronesEncontrados: string[];
  esDestructiva: boolean;
  autorizada: boolean;
}

/**
 * Analiza el `up` de una migración. `down` nunca cuenta como destructivo
 * — revertir una migración expand (p. ej. `DROP TABLE` de una tabla que la
 * propia migración creó) es la operación de rollback esperada, no una
 * pérdida de datos de producción.
 */
export function analizarMigracion(migracion: Migracion): AnalisisMigracion {
  const patronesEncontrados = PATRONES_DESTRUCTIVOS.filter((p) => p.regex.test(migracion.up)).map((p) => p.nombre);
  const esDestructiva = patronesEncontrados.length > 0;
  const autorizada = !esDestructiva || migracion.descripcion.includes(MARCADOR_PERMITE_DESTRUCTIVO);
  return { id: migracion.id, patronesEncontrados, esDestructiva, autorizada };
}

export interface ReporteExpandContract {
  analizadas: AnalisisMigracion[];
  violaciones: AnalisisMigracion[];
  ok: boolean;
}

/** Corre `analizarMigracion` sobre todo el catálogo; `ok=false` si alguna
 * migración destructiva no está autorizada explícitamente. */
export function verificarCatalogoExpandContract(catalogo: Migracion[]): ReporteExpandContract {
  const analizadas = catalogo.map(analizarMigracion);
  const violaciones = analizadas.filter((a) => a.esDestructiva && !a.autorizada);
  return { analizadas, violaciones, ok: violaciones.length === 0 };
}

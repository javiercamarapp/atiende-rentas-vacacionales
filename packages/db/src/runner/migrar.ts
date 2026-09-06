import type { EjecutorSql } from "./ejecutorSql.js";
import type { Migracion } from "./tipos.js";
import { calcularHashMigracion, type FilaMigracionAplicada } from "../../migrations-tooling/verificacionHash.js";

const TABLA_VERSIONES = "schema_migrations";

async function asegurarTablaVersiones(executor: EjecutorSql): Promise<void> {
  await executor.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLA_VERSIONES} (
      id           text PRIMARY KEY,
      descripcion  text NOT NULL DEFAULT '',
      hash_up      text,
      aplicada_en  timestamptz NOT NULL DEFAULT now()
    )
  `);
  // D-DSD-14: ALTER idempotente para bases ya existentes creadas por una
  // versión anterior de este runner, antes de que rastreara hashes de
  // contenido — `CREATE TABLE IF NOT EXISTS` de arriba no añade columnas a
  // una tabla que ya existe.
  await executor.exec(`ALTER TABLE ${TABLA_VERSIONES} ADD COLUMN IF NOT EXISTS hash_up text`);
}

export async function migracionesAplicadas(executor: EjecutorSql): Promise<string[]> {
  await asegurarTablaVersiones(executor);
  const resultado = await executor.query<{ id: string }>(
    `SELECT id FROM ${TABLA_VERSIONES} ORDER BY id`,
  );
  return resultado.rows.map((fila) => fila.id);
}

/** Igual que `migracionesAplicadas`, pero además trae el hash de contenido
 * persistido (D-DSD-14) — usado tanto por `aplicarMigraciones` (para
 * detectar drift al aplicar) como por `npm run db:verificar-migraciones`
 * (auditoría de solo lectura de un ambiente ya desplegado). */
export async function migracionesAplicadasConHash(
  executor: EjecutorSql,
): Promise<FilaMigracionAplicada[]> {
  await asegurarTablaVersiones(executor);
  const resultado = await executor.query<{ id: string; hash_up: string | null }>(
    `SELECT id, hash_up FROM ${TABLA_VERSIONES} ORDER BY id`,
  );
  return resultado.rows.map((fila) => ({ id: fila.id, hash: fila.hash_up }));
}

/**
 * Aplica, en orden, todas las migraciones del catálogo que todavía no
 * figuren en la tabla de versiones. Cada migración corre en su propia
 * transacción: si su `up` falla, se revierte solo esa migración (no las ya
 * aplicadas) y se relanza el error.
 *
 * D-DSD-14: para cada `id` YA aplicado, se compara el hash de contenido
 * persistido contra el hash del `up` actual en el catálogo en memoria. Si
 * difieren, es un `id` reutilizado con contenido distinto (rebase/merge
 * descuidado, error humano) — el esquema real de esta base de datos podría
 * no coincidir con lo que el código fuente actual asume que existe. Nunca
 * se reaplica en silencio ni se ignora: se falla fuerte con un mensaje
 * explícito, forzando intervención humana (renumerar la migración
 * corregida con un id nuevo). Un `id` ya aplicado SIN hash persistido
 * (ambiente que adoptó esta protección después de desplegar esa
 * migración) no cuenta como drift — se adopta automáticamente,
 * persistiendo el hash actual como línea base.
 */
export async function aplicarMigraciones(
  executor: EjecutorSql,
  catalogo: Migracion[],
): Promise<string[]> {
  await asegurarTablaVersiones(executor);
  const aplicadas = await migracionesAplicadasConHash(executor);
  const hashPorIdAplicado = new Map(aplicadas.map((fila) => [fila.id, fila.hash]));
  const aplicadasEnEstaCorrida: string[] = [];

  for (const migracion of catalogo) {
    const hashActual = calcularHashMigracion(migracion);

    if (hashPorIdAplicado.has(migracion.id)) {
      const hashPersistido = hashPorIdAplicado.get(migracion.id)!;
      if (hashPersistido === null) {
        // Adopción retroactiva: esta fila se aplicó antes de que el
        // runner rastreara hashes. Se persiste el hash actual como línea
        // base — a partir de ahora, cualquier reescritura de este mismo
        // id sí se detecta.
        await executor.query(`UPDATE ${TABLA_VERSIONES} SET hash_up = $2 WHERE id = $1`, [
          migracion.id,
          hashActual,
        ]);
      } else if (hashPersistido !== hashActual) {
        throw new Error(
          `Migración "${migracion.id}" ya fue aplicada con un contenido DISTINTO al actual del ` +
            `catálogo (hash almacenado=${hashPersistido}, hash actual=${hashActual}). No se reaplica ` +
            `ni se ignora: el esquema real de esta base de datos puede no coincidir con el código ` +
            `fuente. Si el contenido de "${migracion.id}" cambió intencionalmente, créala como una ` +
            `migración NUEVA con un id distinto en vez de reescribir una ya desplegada. Verificación ` +
            `manual: npm run db:verificar-migraciones.`,
        );
      }
      continue;
    }

    await executor.exec("BEGIN");
    try {
      await executor.exec(migracion.up);
      await executor.query(
        `INSERT INTO ${TABLA_VERSIONES} (id, descripcion, hash_up) VALUES ($1, $2, $3)`,
        [migracion.id, migracion.descripcion, hashActual],
      );
      await executor.exec("COMMIT");
      aplicadasEnEstaCorrida.push(migracion.id);
    } catch (error) {
      await executor.exec("ROLLBACK");
      throw new Error(
        `Migración ${migracion.id} falló, revertida: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }

  return aplicadasEnEstaCorrida;
}

/**
 * Revierte la última migración aplicada (por orden de `schema_migrations`,
 * no por orden del catálogo en memoria) ejecutando su `down`. Lanza si la
 * última migración registrada ya no existe en el catálogo en memoria
 * (código desincronizado de la base de datos).
 */
export async function revertirUltima(
  executor: EjecutorSql,
  catalogo: Migracion[],
): Promise<string | null> {
  await asegurarTablaVersiones(executor);
  const aplicadas = await migracionesAplicadas(executor);
  const ultima = aplicadas[aplicadas.length - 1];
  if (!ultima) return null;

  const migracion = catalogo.find((m) => m.id === ultima);
  if (!migracion) {
    throw new Error(
      `La migración aplicada más reciente (${ultima}) no está en el catálogo en memoria`,
    );
  }

  await executor.exec("BEGIN");
  try {
    await executor.exec(migracion.down);
    await executor.query(`DELETE FROM ${TABLA_VERSIONES} WHERE id = $1`, [ultima]);
    await executor.exec("COMMIT");
  } catch (error) {
    await executor.exec("ROLLBACK");
    throw new Error(
      `Reversión de ${ultima} falló: ${(error as Error).message}`,
      { cause: error },
    );
  }

  return ultima;
}

export async function revertirTodas(
  executor: EjecutorSql,
  catalogo: Migracion[],
): Promise<string[]> {
  const revertidas: string[] = [];
  for (;;) {
    const id = await revertirUltima(executor, catalogo);
    if (!id) break;
    revertidas.push(id);
  }
  return revertidas;
}

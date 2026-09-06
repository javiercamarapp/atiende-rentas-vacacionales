import type { EjecutorSql } from "./ejecutorSql.js";
import type { Migracion } from "./tipos.js";

const TABLA_VERSIONES = "schema_migrations";

async function asegurarTablaVersiones(executor: EjecutorSql): Promise<void> {
  await executor.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLA_VERSIONES} (
      id           text PRIMARY KEY,
      descripcion  text NOT NULL DEFAULT '',
      aplicada_en  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function migracionesAplicadas(executor: EjecutorSql): Promise<string[]> {
  await asegurarTablaVersiones(executor);
  const resultado = await executor.query<{ id: string }>(
    `SELECT id FROM ${TABLA_VERSIONES} ORDER BY id`,
  );
  return resultado.rows.map((fila) => fila.id);
}

/**
 * Aplica, en orden, todas las migraciones del catálogo que todavía no
 * figuren en la tabla de versiones. Cada migración corre en su propia
 * transacción: si su `up` falla, se revierte solo esa migración (no las ya
 * aplicadas) y se relanza el error.
 */
export async function aplicarMigraciones(
  executor: EjecutorSql,
  catalogo: Migracion[],
): Promise<string[]> {
  await asegurarTablaVersiones(executor);
  const yaAplicadas = new Set(await migracionesAplicadas(executor));
  const aplicadasEnEstaCorrida: string[] = [];

  for (const migracion of catalogo) {
    if (yaAplicadas.has(migracion.id)) continue;

    await executor.exec("BEGIN");
    try {
      await executor.exec(migracion.up);
      await executor.query(
        `INSERT INTO ${TABLA_VERSIONES} (id, descripcion) VALUES ($1, $2)`,
        [migracion.id, migracion.descripcion],
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

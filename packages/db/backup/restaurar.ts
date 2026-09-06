import type { EjecutorSql } from "../src/runner/ejecutorSql.js";
import { deserializarValor } from "./serializacion.js";
import type { BackupLogico } from "./tiposBackup.js";

export class BackupIncompatibleError extends Error {
  constructor(motivo: string) {
    super(`Backup incompatible con el destino: ${motivo}`);
    this.name = "BackupIncompatibleError";
  }
}

export interface ReporteRestauracion {
  tablasRestauradas: string[];
  filasInsertadasPorTabla: Record<string, number>;
}

/**
 * Restaura un backup lógico en un destino cuyo ESQUEMA ya existe (creado
 * corriendo el mismo catálogo de migraciones con `aplicarMigraciones` —
 * esta función nunca crea tablas, solo datos, siguiendo el mismo espíritu
 * de "una sola fuente de verdad del esquema" que el runner de migraciones,
 * H-086/H-087).
 *
 * Uso previsto: SIEMPRE contra una instancia AISLADA (nunca el primario en
 * producción) — el llamador (`recuperacion.ts`) es responsable de eso.
 *
 * Orden: `TRUNCATE` de todas las tablas en una sola sentencia con
 * `CASCADE` (evita el problema de orden de FK en el borrado — Postgres
 * resuelve las dependencias internamente dentro de un único `TRUNCATE`
 * con `CASCADE`), después `INSERT` fila por fila respetando
 * `backup.ordenTablas` (padres antes que hijos, ya calculado en el
 * export) para que las FK sí se satisfagan al insertar.
 */
export async function restaurarBackupLogico(ejecutor: EjecutorSql, backup: BackupLogico): Promise<ReporteRestauracion> {
  if (backup.tablas.length === 0) {
    return { tablasRestauradas: [], filasInsertadasPorTabla: {} };
  }

  const nombresTablas = backup.tablas.map((t) => t.nombre);
  const listaEscapada = nombresTablas.map((n) => `"${n}"`).join(", ");
  await ejecutor.exec(`TRUNCATE ${listaEscapada} RESTART IDENTITY CASCADE`);

  const filasInsertadasPorTabla: Record<string, number> = {};
  const porNombre = new Map(backup.tablas.map((t) => [t.nombre, t]));

  // `session_replication_role = replica` (mismo mecanismo que usa
  // `pg_dump --data-only` al restaurar): desactiva los triggers de
  // usuario (auditoría, etc.) y las comprobaciones de FK inline durante la
  // carga masiva, para que el conteo de filas resultante sea EXACTAMENTE
  // el del backup — sin filas de auditoría fantasma generadas por el
  // propio proceso de restauración, y sin depender de un orden de FK
  // perfecto (`backup.ordenTablas` ya lo calcula igual, como defensa en
  // profundidad si `session_replication_role` no estuviera disponible).
  await ejecutor.exec("SET session_replication_role = replica");
  try {
    for (const nombre of backup.ordenTablas) {
      const tabla = porNombre.get(nombre);
      if (!tabla) continue;

      let insertadas = 0;
      for (const fila of tabla.filas) {
        const columnas = tabla.columnas;
        const valores = columnas.map((c) => deserializarValor(fila[c] ?? null));
        const placeholders = columnas.map((_, i) => `$${i + 1}`).join(", ");
        const listaColumnas = columnas.map((c) => `"${c}"`).join(", ");
        await ejecutor.query(
          `INSERT INTO "${nombre}" (${listaColumnas}) VALUES (${placeholders})`,
          valores,
        );
        insertadas++;
      }
      filasInsertadasPorTabla[nombre] = insertadas;
    }
  } finally {
    await ejecutor.exec("SET session_replication_role = origin");
  }

  return { tablasRestauradas: backup.ordenTablas, filasInsertadasPorTabla };
}

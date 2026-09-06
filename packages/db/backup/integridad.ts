import type { EjecutorSql, FilaSql } from "../src/runner/ejecutorSql.js";
import type { BackupLogico } from "./tiposBackup.js";

interface FilaConteo extends FilaSql {
  n: string;
}

interface FilaExclude extends FilaSql {
  conname: string;
}

export interface DiscrepanciaConteo {
  tabla: string;
  esperado: number;
  real: number;
}

export interface ReporteIntegridad {
  conteosOk: boolean;
  discrepanciasConteo: DiscrepanciaConteo[];
  /** `true` si `ocupacion_unidad` tiene su restricción EXCLUDE (H-001) —
   * la garantía central de no-solape del calendario debe sobrevivir una
   * restauración, no solo los datos. */
  excludePresente: boolean;
  /** ids verificados como recuperables (existen en `ocupacion_unidad`
   * tras el restore) de los pedidos en `opciones.idsOcupacionAVerificar`. */
  idsRecuperablesVerificados: string[];
  idsFaltantes: string[];
  ok: boolean;
}

export interface OpcionesVerificarIntegridad {
  /** ids de `ocupacion_unidad` (p. ej. una reserva de prueba conocida) que
   * DEBEN existir después del restore — "una reserva de prueba
   * recuperable" (§Operación-3). */
  idsOcupacionAVerificar?: string[];
}

/**
 * Verificación mínima de integridad post-restore (§Operación-3): conteo de
 * filas por tabla contra lo que el propio backup dice que exportó,
 * integridad referencial estructural (la restricción EXCLUDE sigue
 * existiendo — no basta con que la tabla exista, tiene que conservar su
 * invariante), y que una reserva de prueba conocida sea recuperable.
 */
export async function verificarIntegridad(
  ejecutor: EjecutorSql,
  backup: BackupLogico,
  opciones: OpcionesVerificarIntegridad = {},
): Promise<ReporteIntegridad> {
  const discrepanciasConteo: DiscrepanciaConteo[] = [];
  for (const tabla of backup.tablas) {
    const resultado = await ejecutor.query<FilaConteo>(`SELECT count(*)::text AS n FROM "${tabla.nombre}"`);
    const real = Number(resultado.rows[0]?.n ?? "0");
    if (real !== tabla.filas.length) {
      discrepanciasConteo.push({ tabla: tabla.nombre, esperado: tabla.filas.length, real });
    }
  }

  let excludePresente = false;
  const tieneOcupacionUnidad = backup.tablas.some((t) => t.nombre === "ocupacion_unidad");
  if (tieneOcupacionUnidad) {
    const resultado = await ejecutor.query<FilaExclude>(
      `SELECT conname FROM pg_constraint
       WHERE contype = 'x' AND conrelid = 'ocupacion_unidad'::regclass`,
    );
    excludePresente = resultado.rows.length > 0;
  } else {
    excludePresente = true; // no aplica a este backup parcial.
  }

  const idsRecuperablesVerificados: string[] = [];
  const idsFaltantes: string[] = [];
  for (const id of opciones.idsOcupacionAVerificar ?? []) {
    const resultado = await ejecutor.query(`SELECT id FROM ocupacion_unidad WHERE id = $1`, [id]);
    if (resultado.rows.length > 0) idsRecuperablesVerificados.push(id);
    else idsFaltantes.push(id);
  }

  const conteosOk = discrepanciasConteo.length === 0;
  const ok = conteosOk && excludePresente && idsFaltantes.length === 0;

  return { conteosOk, discrepanciasConteo, excludePresente, idsRecuperablesVerificados, idsFaltantes, ok };
}

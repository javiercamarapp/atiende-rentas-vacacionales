import * as os from "node:os";
import type pg from "pg";
import type { EjecutorTransaccional } from "@atiende-rv/domain";

/**
 * Helpers compartidos por los 3 escenarios de carga (Lote 11A, BACKLOG
 * H-093). Deliberadamente sin ninguna cifra de objetivo/SLO codificada
 * aquí — eso violaría ACEPTACION §Plan-1 ("ningún SLO publicado antes del
 * piloto"). Estos scripts MIDEN y REPORTAN; no afirman que el número
 * medido sea un compromiso.
 */

export function envolverConexion(cliente: pg.Client): EjecutorTransaccional {
  return {
    async query(sql, params) {
      const r = await cliente.query(sql, params as unknown[] | undefined);
      return { rows: r.rows, rowCount: r.rowCount };
    },
    async exec(sql) {
      await cliente.query(sql);
    },
  };
}

/** Percentil por interpolación simple sobre un array YA ordenado
 * ascendente — suficiente para reportar p50/p95 de una muestra de
 * decenas/cientos de mediciones (no se necesita t-digest ni HDR
 * histogram para este volumen). */
export function percentil(valoresOrdenados: number[], p: number): number {
  if (valoresOrdenados.length === 0) return NaN;
  const indice = Math.min(
    valoresOrdenados.length - 1,
    Math.max(0, Math.ceil((p / 100) * valoresOrdenados.length) - 1),
  );
  return valoresOrdenados[indice]!;
}

export function resumenLatencias(muestrasMs: number[]) {
  const ordenadas = [...muestrasMs].sort((a, b) => a - b);
  return {
    n: ordenadas.length,
    minMs: ordenadas[0] ?? NaN,
    p50Ms: percentil(ordenadas, 50),
    p95Ms: percentil(ordenadas, 95),
    p99Ms: percentil(ordenadas, 99),
    maxMs: ordenadas[ordenadas.length - 1] ?? NaN,
    promedioMs: ordenadas.length > 0 ? ordenadas.reduce((a, b) => a + b, 0) / ordenadas.length : NaN,
  };
}

export function infoHardware() {
  const cpus = os.cpus();
  return {
    plataforma: os.platform(),
    arquitectura: os.arch(),
    nodeVersion: process.version,
    cpuModelo: cpus[0]?.model ?? "desconocido",
    nucleosLogicos: cpus.length,
    memoriaTotalGiB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
  };
}

/** Marca cada línea de resultado con este prefijo para que
 * `run.mjs` pueda extraer el JSON del stdout mezclado con logs de
 * arranque de embedded-postgres/simuladores. */
export const MARCA_RESULTADO = "RESULTADO_JSON:";

export function emitirResultado(objeto: unknown): void {
  console.log(`${MARCA_RESULTADO}${JSON.stringify(objeto)}`);
}

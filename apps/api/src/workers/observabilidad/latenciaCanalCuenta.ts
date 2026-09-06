import type { EjecutorSql, FilaSql } from "@atiende-rv/db";

/**
 * H-073 (`docs/fase2/BACKLOG.md`, REQ-039/REQ-171, §RV19/21-8): percentiles
 * p50/p95/p99 de latencia INTERNA (outbox: evento→efecto aplicado, ya
 * medida por `Histogram` en `metricas.ts` desde Lote 10) desglosados por
 * CANAL y por CUENTA de canal — antes solo se etiquetaba por
 * `tipo_evento`, así que el histograma nunca separaba, por ejemplo, la
 * latencia interna de eventos de Airbnb de los de Vrbo.
 *
 * `ocupacion_unidad.canal_origen_id` ya identifica el canal directamente
 * (columna de Lote 1); la cuenta de canal concreta (`cuenta_canal`) exige
 * un join adicional a `unidad_canal_feed` por (unidad_id, canal_id) — Lote
 * 2. Devuelve `{}` (sin etiquetas extra) para bloqueos/mantenimiento sin
 * canal de origen, o si la fila de ocupación ya no existe.
 *
 * Límite documentado a propósito: si en algún momento existiera más de un
 * feed activo para el mismo par (unidad, canal) — hoy imposible por el
 * `UNIQUE (unidad_id, canal_id)` de `unidad_canal_feed` — esta función
 * seguiría devolviendo como mucho una fila por ser un JOIN 1:1.
 */
export interface EtiquetasCanalCuenta {
  canal?: string;
  cuenta_canal_id?: string;
}

interface FilaEtiquetas extends FilaSql {
  canal_codigo: string | null;
  cuenta_canal_id: string | null;
}

export async function resolverEtiquetasCanalCuentaPorOcupacion(
  ejecutor: EjecutorSql,
  ocupacionUnidadId: string,
): Promise<EtiquetasCanalCuenta> {
  const resultado = await ejecutor.query<FilaEtiquetas>(
    `SELECT c.codigo AS canal_codigo, ucf.cuenta_canal_id AS cuenta_canal_id
     FROM ocupacion_unidad ou
     LEFT JOIN canal c ON c.id = ou.canal_origen_id
     LEFT JOIN unidad_canal_feed ucf ON ucf.unidad_id = ou.unidad_id AND ucf.canal_id = ou.canal_origen_id
     WHERE ou.id = $1`,
    [ocupacionUnidadId],
  );
  const fila = resultado.rows[0];
  if (!fila) return {};
  const etiquetas: EtiquetasCanalCuenta = {};
  if (fila.canal_codigo) etiquetas.canal = fila.canal_codigo;
  if (fila.cuenta_canal_id) etiquetas.cuenta_canal_id = fila.cuenta_canal_id;
  return etiquetas;
}

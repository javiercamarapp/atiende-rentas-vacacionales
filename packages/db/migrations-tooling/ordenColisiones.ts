import type { Migracion } from "../src/runner/tipos.js";

/**
 * Verificación de orden y colisiones de numeración entre lotes (Lote 10,
 * H-088), según el mapa de rangos fijado en `docs/fase2/LOTES.md`. Un
 * "número" es el prefijo de 4 dígitos del id de la migración (convención
 * `NNNN_descripcion`, ver `packages/db/src/migrations/*.ts`).
 */
export interface RangoLote {
  lote: string;
  desde: number;
  hasta: number;
}

export const RANGOS_POR_LOTE: RangoLote[] = [
  { lote: "Lote 1 (núcleo)", desde: 1, hasta: 9 },
  { lote: "Lote 3", desde: 10, hasta: 19 },
  { lote: "Lote 2", desde: 20, hasta: 29 },
  { lote: "Lote 5", desde: 30, hasta: 39 },
  { lote: "Lote 6", desde: 40, hasta: 49 },
  { lote: "Lote 7", desde: 50, hasta: 59 },
  { lote: "Lote 8", desde: 60, hasta: 69 },
  { lote: "Lote 9", desde: 70, hasta: 79 },
  { lote: "Lote 10", desde: 80, hasta: 89 },
  { lote: "Extensiones cruzadas", desde: 90, hasta: 9999 },
];

const PATRON_ID = /^(\d{4})_[a-z0-9_]+$/;

export interface AnalisisNumeroMigracion {
  id: string;
  numero: number | null;
  loteAsignado: string | null;
  formatoValido: boolean;
}

function analizarNumero(id: string): AnalisisNumeroMigracion {
  const match = PATRON_ID.exec(id);
  if (!match) return { id, numero: null, loteAsignado: null, formatoValido: false };
  const numero = Number(match[1]);
  const rango = RANGOS_POR_LOTE.find((r) => numero >= r.desde && numero <= r.hasta);
  return { id, numero, loteAsignado: rango?.lote ?? null, formatoValido: true };
}

export interface ReporteOrdenColisiones {
  analizadas: AnalisisNumeroMigracion[];
  /** ids con formato inválido (no `NNNN_algo`). */
  formatoInvalido: string[];
  /** números de migración duplicados (dos archivos con el mismo prefijo). */
  numerosDuplicados: number[];
  /** números fuera de cualquier rango conocido del mapa de lotes. */
  fueraDeRango: string[];
  /** `true` si el catálogo, tal como está en memoria, está en orden
   * numérico ascendente estricto (regla de `migrations/index.ts`: "orden
   * fijo, nunca reordenar"). */
  ordenAscendente: boolean;
  ok: boolean;
}

export function verificarOrdenYColisiones(catalogo: Migracion[]): ReporteOrdenColisiones {
  const analizadas = catalogo.map((m) => analizarNumero(m.id));
  const formatoInvalido = analizadas.filter((a) => !a.formatoValido).map((a) => a.id);

  const vistos = new Map<number, number>();
  for (const a of analizadas) {
    if (a.numero === null) continue;
    vistos.set(a.numero, (vistos.get(a.numero) ?? 0) + 1);
  }
  const numerosDuplicados = [...vistos.entries()].filter(([, n]) => n > 1).map(([numero]) => numero);

  const fueraDeRango = analizadas.filter((a) => a.formatoValido && a.loteAsignado === null).map((a) => a.id);

  const numeros = analizadas.map((a) => a.numero).filter((n): n is number => n !== null);
  let ordenAscendente = true;
  for (let i = 1; i < numeros.length; i++) {
    const actual = numeros[i];
    const anterior = numeros[i - 1];
    if (actual === undefined || anterior === undefined || actual <= anterior) {
      ordenAscendente = false;
      break;
    }
  }

  const ok = formatoInvalido.length === 0 && numerosDuplicados.length === 0 && fueraDeRango.length === 0 && ordenAscendente;

  return { analizadas, formatoInvalido, numerosDuplicados, fueraDeRango, ordenAscendente, ok };
}

/** Verifica un número de migración propuesto ANTES de crear el archivo —
 * uso previsto: pegar aquí el número que se va a usar y confirmar que cae
 * dentro del rango asignado al lote que lo pide, sin colisionar con el
 * catálogo actual. */
export function validarNumeroPropuesto(
  numero: number,
  loteEsperado: string,
  catalogoActual: Migracion[],
): { ok: boolean; motivo?: string } {
  const rango = RANGOS_POR_LOTE.find((r) => r.lote === loteEsperado);
  if (!rango) return { ok: false, motivo: `Lote desconocido: "${loteEsperado}"` };
  if (numero < rango.desde || numero > rango.hasta) {
    return { ok: false, motivo: `${numero} fuera del rango ${rango.desde}-${rango.hasta} de ${loteEsperado}` };
  }
  const yaExiste = catalogoActual.some((m) => m.id.startsWith(String(numero).padStart(4, "0") + "_"));
  if (yaExiste) return { ok: false, motivo: `Ya existe una migración con el número ${numero}` };
  return { ok: true };
}

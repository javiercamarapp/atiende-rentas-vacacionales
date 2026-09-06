/**
 * Aritmética monetaria determinista (Lote 7, H-062/H-066, DEFINICION-DE-HECHO
 * "redondeo decimal, sin float"). Todo el motor de finanzas trabaja
 * internamente en CENTAVOS (enteros, `number` — seguro dentro de
 * `Number.MAX_SAFE_INTEGER` para montos de renta vacacional reales) y usa
 * `BigInt` únicamente para el paso intermedio de multiplicar por
 * porcentajes en basis points, para nunca depender de la representación
 * binaria de punto flotante de un decimal (`0.1 + 0.2 !== 0.3`).
 *
 * Convención: los porcentajes (comisión de canal, comisión del gestor,
 * descuento por duración) se expresan en "basis points" enteros
 * (1 bp = 0.01 %; 1600 bp = 16.00 %) para evitar cualquier decimal
 * fraccionario en la entrada del cálculo.
 */

const CENTAVOS_POR_UNIDAD = 100n;
const BASIS_POINTS_TOTAL = 10000n; // 100.00%

/** Convierte un string decimal ("1234.56", "-10", "10.5") a centavos
 * enteros, con redondeo half-up determinista. Nunca usa `parseFloat`. */
export function centavosDesdeDecimal(texto: string): number {
  const normalizado = texto.trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) {
    throw new Error(`Monto decimal inválido: "${texto}"`);
  }
  const negativo = normalizado.startsWith("-");
  const sinSigno = negativo ? normalizado.slice(1) : normalizado;
  const [parteEntera = "0", parteDecimal = ""] = sinSigno.split(".");
  // Un dígito extra de precisión (milésimos) para poder redondear half-up
  // a centavos sin perder el caso ".xx5".
  const decimalesConMargen = (parteDecimal + "000").slice(0, 3);
  const milesimos = BigInt(parteEntera) * 1000n + BigInt(decimalesConMargen);
  const centavos = redondearHaciaArribaDesdeDiv(milesimos, 10n);
  const resultado = Number(centavos);
  return negativo ? -resultado : resultado;
}

/**
 * Convierte centavos a un string decimal con 2 decimales fijos —
 * FORMATEADOR ÚNICO de dinero para todo el repo (Auditoría 2, corrección
 * Q-01/`docs/auditoria-2/calidad-codigo.md`). Antes de esta corrección
 * existían 4 copias casi idénticas de esta función (`apps/api/src/routes/
 * finanzas.ts`, `apps/web/src/pages/finanzas/api.ts`,
 * `apps/web/src/pages/reportes/api.ts`) con DOS criterios de redondeo
 * distintos coexistiendo en el mismo flujo de Owner Statement — riesgo
 * real de que el propietario viera un neto distinto al que domain calculó.
 * Las 3 copias ahora reexportan esta misma función; no queda ninguna
 * reimplementación.
 *
 * Criterio único, justificado (RV12 — finanzas/owners/contabilidad): en
 * este punto `centavos` YA es un entero (garantizado por el resto del
 * motor: `centavosDesdeDecimal`/`aplicarPorcentaje` arriba usan redondeo
 * half-up determinista sobre BigInt antes de llegar aquí, nunca punto
 * flotante). `Math.trunc` en este paso final no es una decisión de
 * redondeo — es una guarda defensiva de idempotencia: si por un bug de
 * capas superiores llegara un valor no entero (p. ej. `100.5` centavos),
 * truncar es la opción que RV12 exige para un documento financiero: nunca
 * "inventar" un centavo adicional a favor de ninguna de las partes
 * (gestora, propietario o canal) en el paso de PRESENTACIÓN de un monto ya
 * calculado — cualquier ajuste real de redondeo debe ocurrir donde se
 * calculó el monto (`aplicarPorcentaje`), con su criterio half-up
 * documentado y trazable, no silenciosamente en el formateador de salida.
 * Ver `redondeo.test.ts` para el caso límite `x.xx5` que antes divergía
 * entre las 4 copias (`Math.trunc` vs. `Math.round`).
 */
export function decimalDesdeCentavos(centavos: number): string {
  const entero = Math.trunc(centavos);
  const negativo = entero < 0;
  const abs = Math.abs(entero);
  const unidades = Math.floor(abs / 100);
  const resto = abs % 100;
  return `${negativo ? "-" : ""}${unidades}.${String(resto).padStart(2, "0")}`;
}

/** Redondeo half-up determinista de `numerador / denominador` (enteros
 * BigInt no negativos). "Half up" = 0.5 siempre sube, nunca banker's
 * rounding — criterio único documentado para todo el motor de finanzas. */
function redondearHaciaArribaDesdeDiv(numerador: bigint, denominador: bigint): bigint {
  const cociente = numerador / denominador;
  const resto = numerador % denominador;
  if (resto * 2n >= denominador) return cociente + 1n;
  return cociente;
}

/** Aplica un porcentaje en basis points (1600 = 16.00%) a un monto en
 * centavos, con redondeo half-up determinista. Nunca produce un resultado
 * negativo si `centavosBase` y `basisPoints` son >= 0. */
export function aplicarPorcentaje(centavosBase: number, basisPoints: number): number {
  if (basisPoints < 0) throw new Error("basisPoints no puede ser negativo");
  const producto = BigInt(Math.trunc(centavosBase)) * BigInt(basisPoints);
  return Number(redondearHaciaArribaDesdeDiv(producto, BASIS_POINTS_TOTAL));
}

/** Suma segura de centavos (enteros) — solo para documentar la intención;
 * `+` normal ya es exacto para enteros dentro de rango seguro, pero se usa
 * esta función en el motor para dejar explícito que la suma nunca pasa por
 * un decimal intermedio. */
export function sumarCentavos(...valores: number[]): number {
  return valores.reduce((acc, v) => acc + Math.trunc(v), 0);
}

export function restarCentavos(base: number, ...aRestar: number[]): number {
  return aRestar.reduce((acc, v) => acc - Math.trunc(v), Math.trunc(base));
}

export { CENTAVOS_POR_UNIDAD };

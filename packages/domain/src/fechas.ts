import { Temporal } from "@js-temporal/polyfill";
import type { FechaLocal, RangoFechas } from "./tipos.js";

/**
 * Justificación de `@js-temporal/polyfill` sobre `date-fns-tz` (H-004,
 * REQ-032/033, D-013): el invariante de ocupación se calcula sobre fechas
 * de calendario locales de la propiedad, no sobre instantes. `Temporal`
 * separa explícitamente `PlainDate` (fecha de calendario pura, sin zona,
 * sin ambigüedad de DST por diseño — restar dos `PlainDate` siempre da un
 * número entero de días) de `Instant`/`ZonedDateTime` (para el caso donde sí
 * hace falta convertir un timestamp UTC de un evento entrante a la fecha de
 * pared de la propiedad). `date-fns-tz` opera sobre `Date` de JS, que
 * siempre representa un instante — usarlo para aritmética de fechas de
 * calendario obliga a fijar una hora arbitraria (mediodía, medianoche) para
 * evitar que un offset de DST empuje la fecha al día anterior/siguiente,
 * exactamente la clase de off-by-one que H-004/caso adversarial 14 exige
 * verificar. Con `Temporal.PlainDate`, ese problema no puede ocurrir por
 * construcción: no existe una "hora" que un cambio de DST pueda mover.
 * Node 25.6.1 no expone `Temporal` nativo todavía (verificado en esta
 * sesión), de ahí el polyfill oficial del TC39 champion group.
 */

const CACHE_ZONAS_VALIDAS = new Set(Intl.supportedValuesOf("timeZone"));

/** Valida que `zona` sea una zona horaria IANA real (D-013) — nunca un
 * offset fijo ni una cadena arbitraria. No sustituye el CHECK de no-vacío
 * en la base de datos (packages/db, migración 0004); esta es la validación
 * de contenido real, aplicada en la capa de aplicación antes de escribir. */
export function validarZonaHorariaIana(zona: string): boolean {
  if (zona.length === 0) return false;
  return CACHE_ZONAS_VALIDAS.has(zona) || zona === "UTC";
}

/** Convierte un instante UTC (ISO 8601 con offset o `Z`) a la fecha de
 * calendario local de la propiedad (REQ-032: interpretación de `DATE` en
 * zona horaria de la propiedad; RV07 §14: DST no afecta el cálculo de
 * noches con `DATE`, sí afecta la fecha derivada de un timestamp). */
export function fechaLocalDesdeInstante(instanteUtcIso: string, zonaHoraria: string): FechaLocal {
  if (!validarZonaHorariaIana(zonaHoraria)) {
    throw new Error(`Zona horaria IANA inválida: "${zonaHoraria}"`);
  }
  const instante = Temporal.Instant.from(instanteUtcIso);
  const zonado = instante.toZonedDateTimeISO(zonaHoraria);
  return zonado.toPlainDate().toString();
}

function comoPlainDate(fecha: FechaLocal): Temporal.PlainDate {
  return Temporal.PlainDate.from(fecha);
}

/** Un rango `[inicio, fin)` es válido si `fin` es estrictamente posterior a
 * `inicio` (H-002: nunca vacío, nunca invertido). */
export function esRangoValido(rango: RangoFechas): boolean {
  try {
    const inicio = comoPlainDate(rango.inicio);
    const fin = comoPlainDate(rango.fin);
    return Temporal.PlainDate.compare(inicio, fin) < 0;
  } catch {
    return false;
  }
}

/** Número de noches de un rango `[inicio, fin)` — equivalente a
 * `fin - inicio` en días de calendario. DST-safe por construcción: dos
 * `PlainDate` nunca tienen ambigüedad horaria (caso adversarial 14). */
export function calcularNoches(rango: RangoFechas): number {
  if (!esRangoValido(rango)) {
    throw new Error(`Rango inválido: [${rango.inicio}, ${rango.fin})`);
  }
  const inicio = comoPlainDate(rango.inicio);
  const fin = comoPlainDate(rango.fin);
  return inicio.until(fin, { largestUnit: "day" }).days;
}

/** Lista de noches (una por cada fecha de calendario) cubiertas por el
 * rango `[inicio, fin)`, sin incluir `fin` (frontera exclusiva, D-012). */
export function nochesDelRango(rango: RangoFechas): FechaLocal[] {
  const noches: FechaLocal[] = [];
  let cursor = comoPlainDate(rango.inicio);
  const fin = comoPlainDate(rango.fin);
  while (Temporal.PlainDate.compare(cursor, fin) < 0) {
    noches.push(cursor.toString());
    cursor = cursor.add({ days: 1 });
  }
  return noches;
}

/** `true` si `noche` está cubierta por `[rango.inicio, rango.fin)`. */
export function rangoCubreNoche(rango: RangoFechas, noche: FechaLocal): boolean {
  const n = comoPlainDate(noche);
  const inicio = comoPlainDate(rango.inicio);
  const fin = comoPlainDate(rango.fin);
  return Temporal.PlainDate.compare(inicio, n) <= 0 && Temporal.PlainDate.compare(n, fin) < 0;
}

/** Dos rangos semiabiertos se solapan si y solo si cada uno empieza antes
 * de que el otro termine — la definición estándar de intersección de
 * intervalos `[a,b) ∩ [c,d) ≠ ∅ ⟺ a < d ∧ c < b`. Estancias contiguas
 * (checkout de A = check-in de B, caso adversarial 15) dan `false` aquí,
 * igual que el `&&` de `daterange` en Postgres (D-012). */
export function rangosSeSuperponen(a: RangoFechas, b: RangoFechas): boolean {
  const aInicio = comoPlainDate(a.inicio);
  const aFin = comoPlainDate(a.fin);
  const bInicio = comoPlainDate(b.inicio);
  const bFin = comoPlainDate(b.fin);
  return (
    Temporal.PlainDate.compare(aInicio, bFin) < 0 && Temporal.PlainDate.compare(bInicio, aFin) < 0
  );
}

/** `true` si los rangos son adyacentes (checkout de uno = check-in del
 * otro), el caso explícito de "estancias contiguas" (caso adversarial 15,
 * REQ-024) — nunca se trata como solapamiento. */
export function sonRangosContiguos(a: RangoFechas, b: RangoFechas): boolean {
  return a.fin === b.inicio || b.fin === a.inicio;
}

export type TipoModificacionRango = "sin_cambio" | "ampliar" | "reducir" | "mover";

/** Clasifica una modificación de fechas (H-019, BLUEPRINT §4.4) — puramente
 * informativo para UI/auditoría; la verificación de solapamiento real la
 * hace siempre el EXCLUDE de base de datos (D-012), nunca esta función. */
export function clasificarModificacionRango(
  anterior: RangoFechas,
  nuevo: RangoFechas,
): TipoModificacionRango {
  if (anterior.inicio === nuevo.inicio && anterior.fin === nuevo.fin) return "sin_cambio";

  const inicioAnt = comoPlainDate(anterior.inicio);
  const finAnt = comoPlainDate(anterior.fin);
  const inicioNuevo = comoPlainDate(nuevo.inicio);
  const finNuevo = comoPlainDate(nuevo.fin);

  const nuevoContieneAnterior =
    Temporal.PlainDate.compare(inicioNuevo, inicioAnt) <= 0 &&
    Temporal.PlainDate.compare(finNuevo, finAnt) >= 0;
  const anteriorContieneNuevo =
    Temporal.PlainDate.compare(inicioAnt, inicioNuevo) <= 0 &&
    Temporal.PlainDate.compare(finAnt, finNuevo) >= 0;

  if (nuevoContieneAnterior) return "ampliar";
  if (anteriorContieneNuevo) return "reducir";
  return "mover";
}

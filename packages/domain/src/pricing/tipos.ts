/**
 * Tipos de dominio de pricing básico (Lote 7, BACKLOG E11, RV13). Sin IO:
 * solo formas de datos y funciones puras.
 */
import type { FechaLocal, RangoFechas } from "../tipos.js";

export interface TemporadaTarifa {
  nombre: string;
  /** Semiabierto `[inicio, fin)`, mismo modelo que `RangoFechas` de
   * calendario (D-012), para reutilizar `rangosSeSuperponen`. */
  rango: RangoFechas;
  precioNocheCentavos: number;
}

/**
 * Descuento por duración de estancia (H-068, RV13-R-02): umbrales estándar
 * de industria confirmados con fuente primaria en dos canales — 7+ noches
 * (semanal) y 28+ noches (mensual), Airbnb art. 1344 y Vrbo "Manage your
 * rates". `fuente` se declara explícitamente por dato (nunca un porcentaje
 * mudo), y el motor NO asume estos umbrales por defecto: deben configurarse
 * por unidad, con posibilidad de override si se confirma un umbral distinto
 * para un canal específico (RV13-R-02).
 */
export interface DescuentoDuracion {
  nochesMinimas: number;
  porcentajeDescuentoBasisPoints: number;
  fuente: string;
}

/**
 * Min-stay dinámico por rango de fechas y, opcionalmente, día de la semana
 * del check-in (H-068/RV13-R-03, replicando el patrón de Vrbo "min-stay
 * basado en fecha de check-in" y los rule-sets de Airbnb).
 */
export interface ReglaMinStay {
  rango: RangoFechas;
  /** `0` (domingo) a `6` (sábado); `null` = aplica todos los días. */
  diaSemanaCheckIn: number | null;
  nochesMinimas: number;
}

/**
 * Regla por canal (H-068/RV13-R-04/RV13-R-06): markup para compensar la
 * comisión del canal al publicar la misma tarifa neta deseada. Nunca se usa
 * para canales sin `ratesPush` (ver `publicacion.ts`).
 */
export interface ReglaCanal {
  canalCodigo: string;
  markupBasisPoints: number;
  activo: boolean;
}

export interface ContextoPricingUnidad {
  unidadId: string;
  moneda: string;
  precioBaseNocheCentavos: number;
  temporadas: TemporadaTarifa[];
  descuentosDuracion: DescuentoDuracion[];
  reglasMinStay: ReglaMinStay[];
}

export interface EntradaCotizacion {
  contexto: ContextoPricingUnidad;
  rango: RangoFechas;
  /** Si se cotiza para un canal específico, aplica su `ReglaCanal` (markup)
   * — `null`/omitido = cotización para reserva directa, sin markup. */
  reglaCanal?: ReglaCanal | null;
}

export interface DesgloseNoche {
  fecha: FechaLocal;
  precioCentavos: number;
  origen: "base" | "temporada";
  temporadaNombre?: string;
}

export interface DescuentoAplicado {
  nochesMinimas: number;
  porcentajeDescuentoBasisPoints: number;
  fuente: string;
  montoCentavos: number;
}

export interface ViolacionMinStay {
  regla: ReglaMinStay;
  nochesSolicitadas: number;
}

export interface ResultadoCotizacion {
  unidadId: string;
  moneda: string;
  noches: number;
  desgloseNoches: DesgloseNoche[];
  subtotalAntesDescuentoCentavos: number;
  descuentoAplicado: DescuentoAplicado | null;
  subtotalConDescuentoCentavos: number;
  markupCanalCentavos: number;
  totalCentavos: number;
  /** Nunca bloquea el cálculo (es informativo): la UI decide si impide la
   * reserva; el motor de cotización siempre devuelve un precio determinista
   * aunque min-stay no se cumpla, para que la UI pueda explicar "por qué". */
  violacionesMinStay: ViolacionMinStay[];
}

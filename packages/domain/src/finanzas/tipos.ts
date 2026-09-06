/**
 * Tipos de dominio de finanzas/owners/statements (Lote 7, BACKLOG E10,
 * RV12). Sin IO: solo formas de datos y funciones puras — la persistencia
 * (packages/db, migraciones 0050+) y el acceso HTTP (apps/api/src/routes/
 * finanzas) viven fuera de este paquete.
 */

/** Código de moneda ISO 4217 (REQ del encargo: "moneda por propiedad"). */
export type CodigoMoneda = string;

/**
 * Configuración de comisión de canal (H-063/H-065, RV12 §2.1/§3): decide si
 * el monto que Atiende recibe de un canal ya viene neto de la comisión del
 * canal (confirmado para Airbnb, L-RV12-02: "the entire fee is deducted
 * from the host's payout") o bruto (Booking.com/Vrbo, sin confirmar —
 * configurable, nunca hardcodeado, R1 de RV12).
 */
export interface ConfiguracionComisionCanal {
  /** `true`: el monto de entrada YA es neto de comisión de canal (no se
   * vuelve a restar — Finanzas-1). `false`: el monto de entrada es bruto y
   * la comisión se calcula y resta aquí. */
  yaNetoDeComision: boolean;
  /** Basis points (1600 = 16.00%). Ignorado si `yaNetoDeComision` es true. */
  comisionBasisPoints: number;
  /** Cita de la fuente y fecha de vigencia (nunca un valor mudo en la UI —
   * RV12 R1/R5: "configurable/editable manualmente", con fuente declarada). */
  fuente: string;
}

/** Base sobre la que se calcula la comisión del gestor (decisión de
 * producto por tenant, RV12 §2.1). */
export type BaseComisionGestor = "bruto" | "neto_de_canal";

export interface ConfiguracionComisionGestor {
  basisPoints: number;
  base: BaseComisionGestor;
}

export interface LineaGastoEntrada {
  tipo: string;
  descripcion?: string | null;
  montoCentavos: number;
}

/**
 * Línea de impuesto: SIEMPRE `revisionFiscal: true` (B-005, D-023,
 * DEFINICION-DE-HECHO §3.3) — Atiende nunca calcula un monto de retención
 * ISR/IVA definitivo; estas líneas son capturadas manualmente (o importadas
 * de un reporte de canal) y quedan marcadas para revisión legal/fiscal
 * antes de presentarse como definitivas.
 */
export interface LineaImpuestoEntrada {
  tipo: string;
  montoCentavos: number;
  nota?: string;
}

export interface EntradaMovimientoReserva {
  ocupacionUnidadId: string;
  moneda: CodigoMoneda;
  montoBrutoCentavos: number;
  comisionCanal: ConfiguracionComisionCanal;
  comisionGestor: ConfiguracionComisionGestor;
  gastos: LineaGastoEntrada[];
  impuestos: LineaImpuestoEntrada[];
}

export interface MovimientoFinancieroReserva {
  ocupacionUnidadId: string;
  moneda: CodigoMoneda;
  ingresoBrutoCentavos: number;
  /** Monto efectivamente recibido por el gestor tras la comisión de canal
   * (igual a `ingresoBrutoCentavos` si `yaNetoDeComision`). */
  montoRecibidoCentavos: number;
  comisionCanalCentavos: number;
  comisionCanalFuente: string;
  comisionGestorCentavos: number;
  gastosCentavos: number;
  impuestosCentavos: number;
  netoCentavos: number;
}

export type TipoLineaStatement = "ingreso" | "comision_canal" | "comision_gestor" | "gasto" | "impuesto";

export interface LineaStatement {
  ocupacionUnidadId: string | null;
  tipo: TipoLineaStatement;
  descripcion: string;
  montoCentavos: number;
  moneda: CodigoMoneda;
}

export interface PeriodoStatement {
  inicio: string; // YYYY-MM-DD, inclusive
  fin: string; // YYYY-MM-DD, exclusivo (mismo modelo semiabierto que ocupacion_unidad)
}

export interface OwnerStatementCalculado {
  ownerId: string;
  periodo: PeriodoStatement;
  moneda: CodigoMoneda;
  ingresosBrutosCentavos: number;
  comisionCanalCentavos: number;
  comisionGestorCentavos: number;
  gastosCentavos: number;
  impuestosCentavos: number;
  netoCentavos: number;
  lineas: LineaStatement[];
  /** Hash sha256 determinista del contenido — idempotencia de generación
   * (H-062: "calculado desde reserva, nunca al revés"; misma entrada de
   * reservas ⇒ mismo hash ⇒ no se crea una nueva versión). */
  hashContenido: string;
}

export type EstadoConciliacionPayout = "conciliado" | "pendiente" | "discrepancia";

export interface LineaPayoutEntrada {
  referenciaExternaReserva?: string | null;
  montoCentavos: number;
}

export interface ReservaConciliable {
  ocupacionUnidadId: string;
  externalId: string | null;
  montoEsperadoCentavos: number;
}

export interface ResultadoConciliacionLinea {
  referenciaExternaReserva: string | null;
  ocupacionUnidadId: string | null;
  montoCentavos: number;
  montoEsperadoCentavos: number | null;
  estado: EstadoConciliacionPayout;
  nota: string;
}

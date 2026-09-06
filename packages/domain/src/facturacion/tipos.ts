/**
 * Tipos del motor de planes/facturación (Lote 3.3, RV16). Todos los
 * montos van en CENTAVOS enteros (mismo criterio que
 * `packages/domain/src/finanzas/redondeo.ts` — D-009/DEFINICION-DE-HECHO:
 * "redondeo decimal, sin float") — este módulo REUSA ese formateador
 * único, nunca reimplementa su propia aritmética decimal.
 *
 * ADVERTENCIA DE PRECIO (obligatoria en todo el módulo, RV16): los
 * montos del catálogo por defecto (`planesPorDefecto` en `./planes.ts`)
 * son un BORRADOR COMERCIAL anclado en los rangos de mercado observados
 * en docs/investigacion/RV16-modelo-negocio-costos.md (§2/§7) — NUNCA
 * precios definitivos. Por eso el catálogo completo vive en una tabla
 * editable por Superadmin (`plan_facturacion`, migración 0121) en vez de
 * hardcodeado en código de negocio: cambiar un precio no debe requerir un
 * despliegue.
 */

export type EtiquetaPrecio = "borrador_comercial";

/** Un escalón de precio por volumen de unidades — "hasta N unidades, tal
 * precio por unidad"; el último escalón del catálogo tiene
 * `hastaUnidades: null` (sin tope superior). RV16-R-01: cuota base por
 * unidad/mes con escalones de volumen, no un precio plano. */
export interface EscalonPrecioPlan {
  /** Límite superior INCLUSIVE de este escalón (número de unidades
   * activas del tenant); `null` = sin límite (último escalón). */
  hastaUnidades: number | null;
  /** Precio por unidad, en centavos/mes, para una unidad que cae en este
   * escalón. */
  precioCentavosPorUnidad: number;
}

/** Add-on de IA conversacional, facturado APARTE del plan base
 * (RV16-R-02) — nunca subsidiado en silencio dentro de la cuota base,
 * porque el costo marginal de IA es variable (RV16 §3b). */
export interface AddOnIa {
  codigo: string;
  nombre: string;
  /** Cargo fijo mensual del paquete, en centavos. */
  precioCentavosMes: number;
  /** Mensajes IA incluidos en el paquete antes de considerarse excedente
   * (ver `evaluarLimitesPlan` en `./limites.ts`) — `null` = ilimitado. */
  mensajesIncluidos: number | null;
}

export interface LimitesPlan {
  /** `null` = sin límite. */
  unidadesActivasMax: number | null;
  mensajesIaMesMax: number | null;
  cuentasCanalMax: number | null;
}

export interface PlanFacturacion {
  codigo: string;
  nombre: string;
  descripcion: string;
  escalones: EscalonPrecioPlan[];
  addOnsDisponibles: AddOnIa[];
  limites: LimitesPlan;
  /** Días de prueba gratuita al activar la suscripción por primera vez. */
  diasPrueba: number;
  moneda: "USD";
  etiquetaPrecio: EtiquetaPrecio;
  activo: boolean;
}

export type EstadoSuscripcion =
  | "prueba"
  | "activa"
  | "pago_pendiente"
  | "cancelada"
  | "vencida";

export interface SuscripcionTenant {
  tenantId: string;
  planCodigo: string;
  addOnsActivos: string[];
  estado: EstadoSuscripcion;
  inicioPeriodoPruebaEn: string | null;
  finPeriodoPruebaEn: string | null;
  /** Fecha ISO de la próxima renovación/cobro — informativo, el cobro
   * real lo dispara el adaptador de pagos (Stripe) o, en `PagosSimulado`,
   * un avance manual de fecha en pruebas. */
  proximaRenovacionEn: string | null;
  proveedorPagoId: string | null;
  clienteExternoId: string | null;
}

/** Medición de uso de un tenant en un periodo — insumo de
 * `evaluarLimitesPlan` y de la línea de facturación (RV16: "medición de
 * uso: unidades activas, mensajes IA, cuentas de canal"). */
export interface MedicionUsoTenant {
  tenantId: string;
  periodo: string; // "AAAA-MM"
  unidadesActivas: number;
  mensajesIaMes: number;
  cuentasCanal: number;
}

export type RecursoLimitado = "unidades_activas" | "mensajes_ia" | "cuentas_canal";

export interface ResultadoLimite {
  recurso: RecursoLimitado;
  permitido: boolean;
  usoActual: number;
  limite: number | null;
  /** Mensaje humano listo para mostrar/loggear — nunca expone detalles
   * internos, solo el hecho de negocio. */
  motivo: string;
}

export interface DesgloseSuscripcion {
  planCodigo: string;
  unidadesFacturadas: number;
  /** Una línea por escalón que efectivamente aporta unidades facturadas
   * (nunca una línea con 0 unidades). */
  lineasEscalon: Array<{ hastaUnidades: number | null; unidades: number; precioCentavosPorUnidad: number; subtotalCentavos: number }>;
  subtotalUnidadesCentavos: number;
  lineasAddOns: Array<{ codigo: string; nombre: string; precioCentavosMes: number }>;
  subtotalAddOnsCentavos: number;
  totalCentavos: number;
  moneda: "USD";
}

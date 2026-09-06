// Llamadas de API de facturación autenticadas (Lote 3.3).
import { peticion } from "../../lib/api/cliente";

export interface DesgloseSuscripcion {
  planCodigo: string;
  unidadesFacturadas: number;
  lineasEscalon: Array<{ hastaUnidades: number | null; unidades: number; precioCentavosPorUnidad: number; subtotalCentavos: number }>;
  subtotalUnidadesCentavos: number;
  lineasAddOns: Array<{ codigo: string; nombre: string; precioCentavosMes: number }>;
  subtotalAddOnsCentavos: number;
  totalCentavos: number;
  moneda: "USD";
}

export interface EstadoSuscripcion {
  estado: "prueba" | "activa" | "pago_pendiente" | "cancelada" | "vencida";
  planCodigo: string;
  addOnsActivos: string[];
  inicioPeriodoPruebaEn: string | null;
  finPeriodoPruebaEn: string | null;
  proximaRenovacionEn: string | null;
  proveedorPago: "simulado" | "stripe" | null;
  uso: { unidadesActivas: number; mensajesIaMes: number; cuentasCanal: number };
  desglose: DesgloseSuscripcion;
  plan: { nombre: string; etiquetaPrecio: string; limites: Record<string, number | null> };
}

export function obtenerSuscripcion(): Promise<EstadoSuscripcion> {
  return peticion("/facturacion/suscripcion");
}

export function iniciarCheckout(planCodigo: string, addOnsActivos: string[] = []): Promise<{ url: string; proveedor: string }> {
  return peticion("/facturacion/checkout", { metodo: "POST", cuerpo: { planCodigo, addOnsActivos } });
}

export function obtenerPortal(): Promise<{ url: string }> {
  return peticion("/facturacion/portal");
}

export interface MrrEstimado {
  etiqueta: "estimacion";
  mrrCentavos: number;
  moneda: "USD";
  tenantsActivosContados: number;
  calculadoEn: string;
}

export function obtenerMrrEstimado(): Promise<MrrEstimado> {
  return peticion("/facturacion/mrr");
}

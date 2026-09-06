// Llamadas de API del sitio público (Lote 3.3) — SIEMPRE sin `authorization`
// (rutas públicas de apps/api/src/routes/facturacion.ts) salvo donde se
// indique lo contrario explícitamente.
import { peticion } from "../../lib/api/cliente";

export interface EscalonPrecioPublico {
  hastaUnidades: number | null;
  precioCentavosPorUnidad: number;
}
export interface AddOnPublico {
  codigo: string;
  nombre: string;
  precioCentavosMes: number;
  mensajesIncluidos: number | null;
}
export interface PlanPublico {
  codigo: string;
  nombre: string;
  descripcion: string;
  escalones: EscalonPrecioPublico[];
  addOnsDisponibles: AddOnPublico[];
  limites: { unidadesActivasMax: number | null; mensajesIaMesMax: number | null; cuentasCanalMax: number | null };
  diasPrueba: number;
  moneda: "USD";
  etiquetaPrecio: "borrador_comercial";
  activo: boolean;
}

export function obtenerPlanesPublicos(): Promise<{ planes: PlanPublico[] }> {
  return peticion("/facturacion/planes");
}

export interface SaludApi {
  status: string;
  entorno: string;
  etiquetaEntorno: string;
  aviso: string;
  baseDeDatos?: "configurada" | "sin_configurar";
}

export function obtenerSaludApi(): Promise<SaludApi> {
  return peticion("/health");
}

export interface SaludDetallada {
  status: string;
  db: { conectada: boolean };
  outbox: { tamanoCola: number | null; edadPendienteMasViejoMs: number | null };
  latenciaResumen?: unknown;
}

export function obtenerSaludDetallada(): Promise<SaludDetallada> {
  return peticion("/health/detallado");
}

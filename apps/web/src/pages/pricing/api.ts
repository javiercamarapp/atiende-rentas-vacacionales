// Llamadas de API propias de pricing básico (Lote 7, BACKLOG E11).
import type {
  CuerpoCotizar,
  CuerpoDescuentoDuracion,
  CuerpoMinStay,
  CuerpoReglaCanalPricing,
  CuerpoTarifaBase,
  CuerpoTarifaTemporada,
} from "@atiende-rv/api/contrato";
import { peticion } from "../../lib/api/cliente";

export interface ContextoPricingUnidad {
  unidadId: string;
  moneda: string;
  precioBaseNocheCentavos: number;
  temporadas: { nombre: string; rango: { inicio: string; fin: string }; precioNocheCentavos: number }[];
  descuentosDuracion: { nochesMinimas: number; porcentajeDescuentoBasisPoints: number; fuente: string }[];
  reglasMinStay: { rango: { inicio: string; fin: string }; diaSemanaCheckIn: number | null; nochesMinimas: number }[];
}

export interface ResultadoCotizacion {
  unidadId: string;
  moneda: string;
  noches: number;
  desgloseNoches: { fecha: string; precioCentavos: number; origen: "base" | "temporada"; temporadaNombre?: string }[];
  subtotalAntesDescuentoCentavos: number;
  descuentoAplicado: { nochesMinimas: number; porcentajeDescuentoBasisPoints: number; fuente: string; montoCentavos: number } | null;
  subtotalConDescuentoCentavos: number;
  markupCanalCentavos: number;
  totalCentavos: number;
  violacionesMinStay: unknown[];
}

export interface EvaluacionPublicacion {
  puedePublicar: boolean;
  mensaje: string;
}

export function obtenerContextoPricing(unidadId: string): Promise<ContextoPricingUnidad> {
  return peticion(`/pricing/unidades/${unidadId}`);
}

export function fijarTarifaBase(unidadId: string, cuerpo: CuerpoTarifaBase): Promise<{ ok: true }> {
  return peticion(`/pricing/unidades/${unidadId}/base`, { metodo: "POST", cuerpo });
}

export function crearTemporada(unidadId: string, cuerpo: CuerpoTarifaTemporada): Promise<{ id: string }> {
  return peticion(`/pricing/unidades/${unidadId}/temporadas`, { metodo: "POST", cuerpo });
}

export function crearDescuentoDuracion(unidadId: string, cuerpo: CuerpoDescuentoDuracion): Promise<{ id: string }> {
  return peticion(`/pricing/unidades/${unidadId}/descuentos-duracion`, { metodo: "POST", cuerpo });
}

export function crearMinStay(unidadId: string, cuerpo: CuerpoMinStay): Promise<{ id: string }> {
  return peticion(`/pricing/unidades/${unidadId}/min-stay`, { metodo: "POST", cuerpo });
}

export function crearReglaCanal(
  unidadId: string,
  cuerpo: CuerpoReglaCanalPricing,
): Promise<{ id: string; avisoDesactivarNativo: string | null }> {
  return peticion(`/pricing/unidades/${unidadId}/reglas-canal`, { metodo: "POST", cuerpo });
}

export function evaluarPublicacion(unidadId: string, canalCodigo: string): Promise<EvaluacionPublicacion> {
  return peticion(`/pricing/unidades/${unidadId}/publicacion/${canalCodigo}`);
}

export function cotizar(cuerpo: CuerpoCotizar): Promise<ResultadoCotizacion> {
  return peticion("/pricing/cotizar", { metodo: "POST", cuerpo });
}

// Reutiliza GET /unidades (endpoint compartido de Lote 3) — sin duplicar el
// CRUD de unidades, que es exclusivo de Lote 8.
export function listarUnidadesBasico(): Promise<{ unidades: { id: string; nombre: string }[] }> {
  return peticion("/unidades");
}

export const CANALES_CONOCIDOS = ["airbnb", "vrbo", "booking"] as const;

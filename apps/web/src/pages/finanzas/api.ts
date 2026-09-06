// Llamadas de API propias de finanzas/owners/statements (Lote 7, BACKLOG
// E10). Mismo patrón que apps/web/src/pages/limpieza/api.ts: cliente HTTP
// compartido + tipos locales (los cuerpos de escritura ya viven en
// @atiende-rv/api/contrato desde apps/api/src/contrato/tipos.ts).
import type {
  CuerpoGenerarStatement,
  CuerpoImportarPayout,
  CuerpoMovimientoReserva,
  CuerpoReglaComisionCanal,
} from "@atiende-rv/api/contrato";
import { peticion } from "../../lib/api/cliente";

// Auditoría 2, corrección Q-01 (calidad-codigo.md): reexporta el
// formateador de dinero único de `packages/domain/finanzas` en vez de
// reimplementarlo — antes esta copia usaba `Math.round`, mientras el
// "criterio único" declarado en domain usa `Math.trunc`, con el caso
// límite `x.xx5` divergiendo entre ambas. Se mantiene el nombre exportado
// (`decimalDesdeCentavos`) para no tocar los ~6 sitios de FinanzasPage.tsx
// que ya la importan desde este archivo.
// Lote 3.2 (H-096+, fix cruzado reportado por Lote 3.4): importar del
// barril "@atiende-rv/domain/finanzas" evalúa TODO ese módulo, incluido
// finanzas/statement.ts (`import { createHash } from "node:crypto"` a
// nivel de módulo) — Vite externaliza node:crypto para el navegador y esa
// sola importación (sin siquiera llamar la función) tira TODA la app web
// con "Module externalized for browser compatibility" en cualquier ruta,
// porque apps/web/src/App.tsx importa FinanzasPage de forma no perezosa.
// `decimalDesdeCentavos` en sí es aritmética pura sin ninguna dependencia
// de Node — se importa del subpath granular
// "@atiende-rv/domain/finanzas/redondeo" (packages/domain/package.json)
// que NUNCA evalúa statement.ts.
export { decimalDesdeCentavos } from "@atiende-rv/domain/finanzas/redondeo";

export interface ReglaComisionCanal {
  id: string;
  canalCodigo: string;
  propiedadId: string | null;
  yaNetoDeComision: boolean;
  comisionBasisPoints: number;
  fuente: string;
  vigenteDesde: string;
}

export interface MovimientoFinanciero {
  ocupacionUnidadId: string;
  moneda: string;
  montoBrutoCentavos: number;
  yaNetoDeComision: boolean;
  comisionCanalCentavos: number;
  comisionGestorCentavos: number;
  montoRecibidoCentavos: number;
  netoCentavos: number;
  gastos: { id: string; tipo: string; descripcion: string | null; montoCentavos: number }[];
  impuestos: { id: string; tipo: string; montoCentavos: number; nota: string | null }[];
  alertaFiscal: { rfcRegistrado: boolean; requiereRevisionFiscal: true; mensaje: string };
}

export interface StatementResumen {
  id: string;
  ownerId: string;
  periodoInicio: string;
  periodoFin: string;
  version: number;
  moneda: string;
  netoCentavos: number;
  generadoEn: string;
}

export interface LineaStatement {
  tipo: "ingreso" | "comision_canal" | "comision_gestor" | "gasto" | "impuesto";
  descripcion: string;
  montoCentavos: number;
  moneda: string;
  ocupacionUnidadId: string | null;
}

export interface StatementDetalle {
  id: string;
  ownerId: string;
  periodoInicio: string;
  periodoFin: string;
  version: number;
  moneda: string;
  ingresosBrutosCentavos: number;
  comisionCanalCentavos: number;
  comisionGestorCentavos: number;
  gastosCentavos: number;
  impuestosCentavos: number;
  netoCentavos: number;
  generadoEn: string;
  lineas: LineaStatement[];
}

export interface PayoutConciliado {
  id: string;
  canalId: string;
  montoTotalCentavos: number;
  fechaPayout: string;
  lineas: {
    ocupacionUnidadId: string | null;
    montoCentavos: number;
    montoEsperadoCentavos: number | null;
    estadoConciliacion: "conciliado" | "pendiente" | "discrepancia";
    nota: string | null;
  }[];
}

export function listarReglasComision(): Promise<{ reglas: ReglaComisionCanal[] }> {
  return peticion("/finanzas/reglas-comision");
}

export function crearReglaComision(cuerpo: CuerpoReglaComisionCanal): Promise<{ id: string }> {
  return peticion("/finanzas/reglas-comision", { metodo: "POST", cuerpo });
}

export function registrarMovimiento(
  ocupacionId: string,
  cuerpo: CuerpoMovimientoReserva,
): Promise<MovimientoFinanciero> {
  return peticion(`/finanzas/reservas/${ocupacionId}/movimiento`, { metodo: "POST", cuerpo });
}

export function obtenerMovimiento(ocupacionId: string): Promise<MovimientoFinanciero> {
  return peticion(`/finanzas/reservas/${ocupacionId}`);
}

export function generarStatement(
  cuerpo: CuerpoGenerarStatement,
): Promise<StatementDetalle & { creado?: boolean }> {
  return peticion("/finanzas/statements/generar", { metodo: "POST", cuerpo });
}

export function listarStatements(ownerId?: string): Promise<{ statements: StatementResumen[] }> {
  return peticion("/finanzas/statements", { query: { ownerId } });
}

export function obtenerStatement(id: string): Promise<StatementDetalle> {
  return peticion(`/finanzas/statements/${id}`);
}

export function urlDescargaStatement(id: string): string {
  return `/finanzas/statements/${id}/descarga`;
}

export function importarPayout(
  cuerpo: CuerpoImportarPayout,
): Promise<{ id: string; lineas: unknown[]; resumen: { conciliadas: number; pendientes: number; discrepancias: number } }> {
  return peticion("/finanzas/payouts", { metodo: "POST", cuerpo });
}

export function obtenerPayout(id: string): Promise<PayoutConciliado> {
  return peticion(`/finanzas/payouts/${id}`);
}

// Sin endpoint dedicado de "unidades básicas" en este lote (esa lista vive
// en apps/web/src/pages/limpieza/api.ts, carpeta exclusiva de Lote 5) —
// se reutiliza GET /unidades directamente (endpoint de Lote 3, compartido).
export function listarUnidadesBasico(): Promise<{
  unidades: { id: string; nombre: string; propiedadId: string; ownerId: string | null }[];
}> {
  return peticion("/unidades");
}

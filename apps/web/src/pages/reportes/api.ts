// Llamadas de API propias de reporting (Lote 7, BACKLOG E12). Solo lectura
// de agregados ya calculados por apps/api/src/routes/reportes.ts — esta
// capa nunca recalcula nada, solo tipa y expone la exportación CSV.
import { construirUrl, peticion, tokenGuardado } from "../../lib/api/cliente";

// Auditoría 2, corrección Q-01 (calidad-codigo.md): reexporta el
// formateador de dinero único de `packages/domain/finanzas` — ver el
// mismo comentario en apps/web/src/pages/finanzas/api.ts.
// Ver comentario detallado en apps/web/src/pages/finanzas/api.ts: el
// subpath granular evita evaluar finanzas/statement.ts (node:crypto a
// nivel de módulo, rompe el bundle del navegador).
export { decimalDesdeCentavos } from "@atiende-rv/domain/finanzas/redondeo";

export interface FilaOcupacion {
  unidadId: string;
  unidadNombre: string;
  propiedadId: string;
  propiedadNombre: string;
  nochesOcupadas: number;
  nochesDisponibles: number;
  ocupacionBasisPoints: number;
  adrCentavos: number;
  revparCentavos: number;
}

export interface FilaIngresos {
  mes: string;
  canalCodigo: string;
  propiedadId: string;
  propiedadNombre: string;
  ingresosBrutosCentavos: number;
  netoCentavos: number;
  reservas: number;
}

export function obtenerReporteOcupacion(desde: string, hasta: string, propiedadId?: string): Promise<{ unidades: FilaOcupacion[] }> {
  return peticion("/reportes/ocupacion", { query: { desde, hasta, propiedadId } });
}

export function obtenerReporteIngresos(desde: string, hasta: string, propiedadId?: string): Promise<{ filas: FilaIngresos[] }> {
  return peticion("/reportes/ingresos", { query: { desde, hasta, propiedadId } });
}

/** Construye la URL de descarga CSV con el token en query no es seguro —
 * en su lugar, el botón de exportar dispara un `fetch` autenticado y crea
 * un blob local (ver ReportesPage.tsx), nunca un `<a href>` directo al
 * endpoint (que iría sin el header Authorization). */
export async function descargarCsv(ruta: string, query: Record<string, string | undefined>): Promise<Blob> {
  const token = tokenGuardado();
  const url = construirUrl(ruta, { ...query, formato: "csv" });
  const respuesta = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!respuesta.ok) throw new Error(`No se pudo exportar (HTTP ${respuesta.status})`);
  return respuesta.blob();
}

export function porcentajeDesdeBasisPoints(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`;
}

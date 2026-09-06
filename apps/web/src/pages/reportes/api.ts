// Llamadas de API propias de reporting (Lote 7, BACKLOG E12). Solo lectura
// de agregados ya calculados por apps/api/src/routes/reportes.ts — esta
// capa nunca recalcula nada, solo tipa y expone la exportación CSV.
import { BASE_URL, peticion, tokenGuardado } from "../../lib/api/cliente";

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
  const url = new URL(ruta.replace(/^\//, ""), BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  for (const [clave, valor] of Object.entries(query)) {
    if (valor !== undefined) url.searchParams.set(clave, valor);
  }
  url.searchParams.set("formato", "csv");
  const respuesta = await fetch(url.toString(), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!respuesta.ok) throw new Error(`No se pudo exportar (HTTP ${respuesta.status})`);
  return respuesta.blob();
}

export function decimalDesdeCentavos(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  return `${negativo ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function porcentajeDesdeBasisPoints(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`;
}

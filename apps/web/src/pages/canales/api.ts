// Cliente de API para el catálogo de canales de México (Lote 3.4, RV22) +
// asistente de conexión — consume GET /canales-mexico/catalogo y
// GET /canales-mexico/:canalCodigo/asistente[?via=...] (ambas de solo
// lectura, ver apps/api/src/routes/canalesCatalogo.ts).
import { peticion } from "../../lib/api/cliente";

export type NivelRv22 = "A" | "B" | "C";
export type EstadoHonestoCatalogo = "ical" | "partner_pendiente" | "manual" | "no_aplica";

export interface LatenciaCatalogo {
  texto: string;
  confianza: string;
  minutosEstimados: number | null;
}

export interface ViaCanalCatalogo {
  viaTecnica: string;
  nivel: NivelRv22;
  estadoHonesto: EstadoHonestoCatalogo;
  capacidades: Record<string, boolean>;
  latencia: LatenciaCatalogo | null;
  urlProcesoOficial: string | null;
  requisitosCredenciales: string[];
  motivo: string | null;
  fuente: string;
  puenteCanalCodigo: string | null;
}

export interface CanalCatalogo {
  canalCodigo: string;
  nombre: string;
  vias: ViaCanalCatalogo[];
}

export function listarCatalogoCanales(): Promise<{ canales: CanalCatalogo[] }> {
  return peticion("/canales-mexico/catalogo");
}

export interface AsistenteConexionCanal {
  canalCodigo: string;
  nombre: string;
  nivel: NivelRv22;
  viaTecnica: string;
  estadoHonesto: EstadoHonestoCatalogo;
  urlProcesoOficial: string | null;
  requisitosCredenciales: string[];
  motivo: string | null;
  fuente: string;
  puenteCanalCodigo: string | null;
  pasos: string[];
  avisoNoAutoconexion: string;
}

export function obtenerAsistenteConexion(canalCodigo: string, via?: string): Promise<AsistenteConexionCanal> {
  return peticion(`/canales-mexico/${canalCodigo}/asistente`, via ? { query: { via } } : undefined);
}

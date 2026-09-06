// Llamadas de API de Automatización agéntica (Auditoría 2, corrección
// P-01). Antes de esta corrección el backend ya existía completo (Lote 9)
// pero no tenía ninguna página que lo consumiera — ver
// docs/auditoria-2/producto-ux-operacion.md.
import { peticion } from "../../lib/api/cliente";

export interface FlagAgente {
  id: string;
  descripcion: string;
  categoriaRiesgo: string;
  valorGlobal: boolean;
  valorEfectivo: boolean;
  overrideDeTenant: boolean;
}

export interface EntradaAuditoriaFlagAgente {
  flagId: string;
  valor: boolean;
  tenantId?: string;
  actor: string;
  motivo: string;
  valorAnterior: boolean;
  en: string;
}

export function listarFlagsAgentes(): Promise<{ flags: FlagAgente[] }> {
  return peticion("/agentes/flags");
}

export function establecerFlagAgente(
  id: string,
  cuerpo: { valor: boolean; motivo: string },
): Promise<{ ok: boolean; flagId: string; valor: boolean; tenantId: string | null }> {
  return peticion(`/agentes/flags/${id}`, { metodo: "PATCH", cuerpo });
}

export function auditoriaFlagAgente(id: string): Promise<{ entradas: EntradaAuditoriaFlagAgente[] }> {
  return peticion(`/agentes/flags/${id}/auditoria`);
}

export interface ToolAgente {
  nombre: string;
  descripcion: string;
  efecto: string;
  requiereLlm: boolean;
  maxLlamadasPorConversacion: number;
  rolesPermitidos: string[];
  nivelesColaboradorPermitidos: string[] | null;
}

export function listarToolsAgentes(): Promise<{ tools: ToolAgente[] }> {
  return peticion("/agentes/tools");
}

export interface CuotaAgente {
  tenantId: string;
  techoTokensPeriodo: number;
  techoLlamadasPeriodo: number;
  tokensRestantes: number;
  llamadasRestantes: number;
  periodoIniciaEn: string;
}

export function obtenerCuotaAgente(): Promise<CuotaAgente> {
  return peticion("/agentes/cuota");
}

// `agente_tool_call_log` (packages/db migraciones Lote 9) nunca guarda
// texto del huésped/borrador — solo ids, rol, canal, nombre de tool,
// resultado, duración y costo (ver apps/api/src/agentes/repositorio.ts):
// esta traza ya nace sin PII, la página solo la muestra tal cual.
export interface TrazaAgente {
  id: string;
  actorId: string;
  rolActor: string;
  conversationId: string;
  canal: string;
  toolNombre: string;
  resultado: string;
  duracionMs: number;
  modeloReal: string | null;
  costoUsdReal: number;
  creadoEn: string;
}

export function listarTrazasAgentes(pagina: number, tamano = 20): Promise<{ trazas: TrazaAgente[] }> {
  return peticion("/agentes/trazas", { query: { pagina, tamano } });
}

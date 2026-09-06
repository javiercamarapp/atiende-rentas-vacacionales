import type { ActorAgente, NivelColaboradorAgente, RolAgente, ToolDefinicion } from "./tipos.js";
import { CATALOGO_TOOLS_AGENTE } from "./catalogo.js";

/**
 * Matriz rol×tool resuelta en SERVIDOR (H-078, RV18-R-04): el backend
 * decide qué tool puede invocar cada rol ANTES de construir la lista de
 * tools que se pasa al modelo — nunca como filtro posterior sobre lo que
 * el modelo "decidió" pedir. `EjecutorTools.toolsDisponiblesPara` (en
 * `ejecutor.ts`) es el único punto que arma esa lista para una invocación
 * real; las funciones de aquí son puras y las usa tanto el ejecutor como
 * los endpoints de solo-lectura de catálogo (`GET /agentes/tools`).
 */

/** Excepción puntual de RV18 §3.1: superadmin nunca genera contenido para
 * huéspedes de terceros — aunque `mensajeria_proponer_borrador` liste
 * "superadmin" en `rolesPermitidos` por completitud del tipo, la matriz
 * real lo deniega aquí explícitamente. Mantenido como lista para poder
 * crecer sin tocar `catalogo.ts` (que documenta el catálogo, no las
 * excepciones finas de negocio). */
const EXCEPCIONES_DENEGADAS: ReadonlySet<string> = new Set(["superadmin:mensajeria_proponer_borrador"]);

export function toolPermitidaParaActor(tool: ToolDefinicion, actor: ActorAgente): boolean {
  if (EXCEPCIONES_DENEGADAS.has(`${actor.rol}:${tool.nombre}`)) return false;
  if (!tool.rolesPermitidos.includes(actor.rol)) return false;
  if (actor.rol === "operador" && tool.nivelesColaboradorPermitidos) {
    if (!actor.colaboradorNivel) return false;
    return tool.nivelesColaboradorPermitidos.includes(actor.colaboradorNivel);
  }
  return true;
}

/** Lista de tools que el servidor debe incluir en la invocación al modelo
 * para este actor — SIEMPRE calculada antes de llamar al proveedor, nunca
 * después (RV18-R-04). */
export function toolsDisponiblesParaActor(actor: ActorAgente): ToolDefinicion[] {
  return CATALOGO_TOOLS_AGENTE.filter((tool) => toolPermitidaParaActor(tool, actor));
}

/** Matriz completa (rol × nivel de colaborador cuando aplica) como tabla
 * plana — usada por la prueba de "matriz rol×tool" y por
 * `GET /agentes/matriz` (documentación operativa, nunca expuesta al
 * modelo). */
export interface FilaMatrizRolTool {
  readonly tool: string;
  readonly rol: RolAgente;
  readonly colaboradorNivel: NivelColaboradorAgente | null;
  readonly permitido: boolean;
}

const NIVELES_A_PROBAR: (NivelColaboradorAgente | null)[] = ["acceso_total", "calendario_mensajeria", "solo_calendario", null];

export function construirMatrizCompleta(roles: readonly RolAgente[]): FilaMatrizRolTool[] {
  const filas: FilaMatrizRolTool[] = [];
  for (const tool of CATALOGO_TOOLS_AGENTE) {
    for (const rol of roles) {
      if (rol === "operador") {
        for (const nivel of NIVELES_A_PROBAR) {
          filas.push({
            tool: tool.nombre,
            rol,
            colaboradorNivel: nivel,
            permitido: toolPermitidaParaActor(tool, { usuarioId: "matriz", rol, colaboradorNivel: nivel }),
          });
        }
      } else {
        filas.push({
          tool: tool.nombre,
          rol,
          colaboradorNivel: null,
          permitido: toolPermitidaParaActor(tool, { usuarioId: "matriz", rol, colaboradorNivel: null }),
        });
      }
    }
  }
  return filas;
}

import type { ToolDefinicion } from "./tipos.js";

/**
 * Router dinámico de modelo LLM por tipo/complejidad de tarea (REQ-177,
 * D-018 / RV16 §3b / RV16-R-06).
 *
 * Antes de este módulo, `apps/api/src/agentes/proveedorClaude.ts` fijaba UN
 * único modelo para TODO el tráfico de agentes vía la variable de entorno
 * global `AGENTES_MODELO_LLM` (default `claude-opus-5`) — sin importar si
 * la ronda era una clasificación trivial o una generación compleja de cara
 * al huésped. RV16 §3b documenta hasta ~37.5x de diferencia de costo entre
 * el modelo más barato y el más caro verificado (GPT-4o mini $0.0006 vs.
 * Claude Opus 5 $0.0225 por conversación), y ~5x entre dos modelos de la
 * misma familia (Claude Haiku 4.5 $0.0045 vs. Claude Opus 5 $0.0225) — usar
 * siempre el modelo más caro para clasificaciones simples desperdicia ese
 * margen en cada ronda que no lo necesita.
 *
 * Este router clasifica CADA ronda según las tools que el SERVIDOR ya
 * resolvió como disponibles para el actor (`toolsDisponiblesParaActor`,
 * RV18-R-04) — nunca según lo que el modelo "decida" pedir, porque en el
 * momento de elegir el modelo la ronda todavía no invocó al proveedor. La
 * complejidad de la ronda es el máximo entre las tools disponibles que
 * SÍ requieren LLM (`requiereLlm: true`); si ninguna tool disponible
 * requiere LLM (o no hay tools en absoluto), la ronda es una respuesta
 * conversacional simple/clasificación → el modelo más barato basta.
 */

export type NivelComplejidadTarea = "clasificacion" | "generacion_simple" | "generacion_compleja";

export const NIVELES_COMPLEJIDAD_TAREA: readonly NivelComplejidadTarea[] = [
  "clasificacion",
  "generacion_simple",
  "generacion_compleja",
] as const;

/**
 * Modelo asignado a cada nivel de complejidad. Nombres alineados a
 * `TARIFAS_USD_POR_TOKEN` de `apps/api/src/agentes/proveedorClaude.ts` —
 * si esa tabla de tarifas cambia de modelos, esta también debe
 * actualizarse (ambas cubiertas por
 * `apps/api/test/agentes/enrutadorModelo.test.ts`, que verifica que todo
 * modelo aquí referenciado tiene tarifa conocida).
 */
export const MODELOS_POR_COMPLEJIDAD: Readonly<Record<NivelComplejidadTarea, string>> = {
  clasificacion: "claude-haiku-4-5",
  generacion_simple: "claude-sonnet-5",
  generacion_compleja: "claude-opus-5",
};

/**
 * Complejidad declarada por cada tool que SÍ requiere LLM
 * (`requiereLlm: true`). Vive aquí — no en `catalogo.ts` — para que el
 * criterio de enrutamiento por costo sea auditable en un solo lugar sin
 * mezclarlo con la definición de permisos/límites de cada tool. Tools
 * deterministas (`requiereLlm: false`, ej.
 * `inventario_consultar_disponibilidad`) nunca aparecen aquí: pueden estar
 * disponibles en la misma ronda sin afectar la complejidad, porque su
 * resultado nunca lo genera el LLM.
 */
const COMPLEJIDAD_POR_TOOL: Readonly<Record<string, NivelComplejidadTarea>> = {
  // Redacta contenido dirigido al huésped final (queda pendiente de
  // aprobación humana, D-006, pero el TEXTO ya debe tener tono y matiz
  // correctos desde el borrador) — máxima sensibilidad, modelo de mayor
  // calidad.
  mensajeria_proponer_borrador: "generacion_compleja",
  // Resumen interno de hilo de mensajes/reportes — generación libre pero
  // sin audiencia externa ni riesgo de tono cara al huésped.
  incidencia_resumir: "generacion_simple",
  // Sugerencias estructuradas de redacción acotada (prioridad enum, notas
  // breves) — generación de bajo riesgo, no requiere el modelo más caro.
  limpieza_proponer_tarea: "generacion_simple",
  // Sugerencia de rango de precio con justificación breve — generación
  // acotada por un horizonte numérico, no prosa libre extensa.
  precio_sugerir_ajuste: "generacion_simple",
};

/**
 * Determina la complejidad máxima real de una ronda a partir de las tools
 * ya filtradas por rol/nivel para el actor (RV18-R-04) — nunca antes de
 * ese filtro, para no sobre-aprovisionar un modelo caro por una tool que
 * este actor ni siquiera puede invocar.
 *
 * Fail-closed por diseño: una tool con `requiereLlm: true` que no aparece
 * en `COMPLEJIDAD_POR_TOOL` (ej. una tool nueva añadida a `catalogo.ts`
 * sin actualizar este router) se trata como `generacion_compleja` — el
 * caso más caro, nunca el más barato por omisión. Un router de costos que
 * fallara "barato por defecto" degradaría silenciosamente la calidad de
 * una tool nueva sin que nadie lo note; fallar "caro por defecto" solo
 * cuesta dinero, nunca calidad, y queda visible en el reporte de costos.
 */
export function complejidadMaximaDeRonda(toolsDisponibles: readonly ToolDefinicion[]): NivelComplejidadTarea {
  const nivelesLlm = toolsDisponibles
    .filter((tool) => tool.requiereLlm)
    .map((tool) => COMPLEJIDAD_POR_TOOL[tool.nombre] ?? "generacion_compleja");

  if (nivelesLlm.length === 0) return "clasificacion";
  if (nivelesLlm.includes("generacion_compleja")) return "generacion_compleja";
  if (nivelesLlm.includes("generacion_simple")) return "generacion_simple";
  return "clasificacion";
}

/**
 * Modelo real a usar para una ronda dada. `overrideModelo` (proveniente de
 * `AGENTES_MODELO_LLM`, variable de entorno operativa) tiene prioridad
 * absoluta cuando está presente: es el "kill switch" manual para forzar un
 * modelo fijo en un despliegue puntual sin tocar código si el enrutamiento
 * dinámico se comportara mal en producción — cuando está ausente (caso
 * normal), el router decide dinámicamente por complejidad de la ronda.
 */
export function elegirModeloParaRonda(toolsDisponibles: readonly ToolDefinicion[], overrideModelo?: string): string {
  if (overrideModelo) return overrideModelo;
  return MODELOS_POR_COMPLEJIDAD[complejidadMaximaDeRonda(toolsDisponibles)];
}

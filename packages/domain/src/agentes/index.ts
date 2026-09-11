// Barril de `packages/domain/agentes` (Lote 9, BACKLOG E14). Carpeta
// exclusiva de este lote (docs/fase2/LOTES.md) — reexportada desde
// `packages/domain/src/index.ts` con una línea aditiva, mismo patrón que
// Lote 5/Lote 6 (ver comentario de cabecera en ese archivo).
export {
  ROLES_AGENTE,
  NIVELES_COLABORADOR_AGENTE,
} from "./tipos.js";
export type {
  RolAgente,
  NivelColaboradorAgente,
  EfectoTool,
  TipoPropiedadSchema,
  PropiedadSchema,
  ObjetoInputSchema,
  LimitesTool,
  ToolDefinicion,
  ToolContext,
  ActorAgente,
  ContenidoNoConfiable,
  ResultadoInvocacionTool,
  MotivoEscalamiento,
  MotivoEscalamientoBlando,
  MotivoEscalamientoDuro,
} from "./tipos.js";

export { esCampoIdentificadorProhibido, tienePrefijoMutacionSensible, contieneAccionProhibida, PREFIJOS_TOOL_MUTACION_SENSIBLE, FRAGMENTOS_ACCION_PROHIBIDA } from "./patronesIdentificador.js";

export { CATALOGO_TOOLS_AGENTE, NOMBRES_TOOLS_PROHIBIDAS, buscarToolPorNombre } from "./catalogo.js";

export { toolPermitidaParaActor, toolsDisponiblesParaActor, construirMatrizCompleta } from "./matrizRoles.js";
export type { FilaMatrizRolTool } from "./matrizRoles.js";

export { CuotaAgotadaError, GestorCuotaAgente } from "./cuota.js";
export type { PresupuestoTenant, ReservaCuota, ResultadoReserva } from "./cuota.js";

export { construirRegistroTraza } from "./trazabilidad.js";
export type { RegistroTrazaToolCall } from "./trazabilidad.js";

export {
  debeEscalarPorTexto,
  debeEscalarPorMonto,
  debeEscalarPorDatoFaltante,
  contieneConfirmacionNoVerificada,
  LoopGuardConversacion,
  TopeRondasExcedidoError,
} from "./escalamiento.js";

export {
  TOOLS_SUJETAS_A_VERIFICACION_DE_HECHOS,
  extraerHechosCitados,
  verificarHechosCitados,
} from "./verificacionHechos.js";
export type { HechoCitado, TipoHechoCitado, ResultadoVerificacionHechos } from "./verificacionHechos.js";

export { ProveedorLLMSimulado } from "./proveedorLLM.js";
export type { ProveedorLLM, SolicitudLLM, RespuestaLLM, InvocacionToolPropuesta, OpcionesProveedorSimulado } from "./proveedorLLM.js";
export { ProveedorLLMConFallback } from "./proveedorFallback.js";

export { complejidadMaximaDeRonda, elegirModeloParaRonda, MODELOS_POR_COMPLEJIDAD, NIVELES_COMPLEJIDAD_TAREA } from "./enrutadorModelo.js";
export type { NivelComplejidadTarea } from "./enrutadorModelo.js";

export { EjecutorTools } from "./ejecutor.js";
export type { EntradaRondaTool, ManejadorToolDeterminista } from "./ejecutor.js";

export { FLAG_AGENTES_HABILITADO, FLAG_AGENTES_PROVEEDOR_REAL_HABILITADO, CATALOGO_FLAGS_AGENTES } from "./flags.js";

export { DATASET_EVALS_AGENTES, UMBRAL_EVALS_ACIERTO_CONTENIDO, ejecutarEvalsAgentes } from "./evals/index.js";
export type { CasoEval, ReporteEvals, ResultadoCasoEval } from "./evals/index.js";

import type { ActorAgente, ToolContext } from "./tipos.js";

/**
 * Trazabilidad de cada tool-call (H-080, D-016, RV18 §4/§8 mecanismo 4).
 * Registro mínimo exigido: quién (actor humano + rol + canal +
 * conversación), cuándo (inicio/fin), con qué resultado, costo REAL
 * atribuido al modelo que realmente respondió esa ronda — nunca al modelo
 * nominal configurado, porque un fallback de proveedor puede cambiar de
 * modelo a mitad de conversación.
 *
 * `argumentosNoSensibles` nunca incluye el texto crudo del huésped ni
 * ningún identificador (ya inyectado vía `ToolContext`, nunca argumento
 * del modelo) — solo los campos que el propio `inputSchema` de la tool
 * permite (ver `catalogo.ts`, ninguno es PII por diseño).
 */
export interface RegistroTrazaToolCall {
  readonly tenantId: string;
  readonly actorId: string;
  readonly rolActor: string;
  readonly conversationId: string;
  readonly canal: ToolContext["canal"];
  readonly toolNombre: string;
  readonly argumentosNoSensibles: Readonly<Record<string, unknown>>;
  readonly resultado: "exito" | "error" | "presupuesto_agotado" | "escalado" | "no_autorizado";
  readonly duracionMs: number;
  readonly modeloReal: string | null;
  readonly costoUsdReal: number;
  readonly inicioEn: string; // ISO 8601
  readonly finEn: string; // ISO 8601
}

export function construirRegistroTraza(parametros: {
  contexto: ToolContext;
  actor: ActorAgente;
  toolNombre: string;
  argumentosNoSensibles: Readonly<Record<string, unknown>>;
  resultado: RegistroTrazaToolCall["resultado"];
  inicioEn: Date;
  finEn: Date;
  modeloReal: string | null;
  costoUsdReal: number;
}): RegistroTrazaToolCall {
  return {
    tenantId: parametros.contexto.tenantId,
    actorId: parametros.actor.usuarioId,
    rolActor: parametros.actor.rol,
    conversationId: parametros.contexto.conversationId,
    canal: parametros.contexto.canal,
    toolNombre: parametros.toolNombre,
    argumentosNoSensibles: sanearArgumentos(parametros.argumentosNoSensibles),
    resultado: parametros.resultado,
    duracionMs: Math.max(0, parametros.finEn.getTime() - parametros.inicioEn.getTime()),
    modeloReal: parametros.modeloReal,
    costoUsdReal: parametros.costoUsdReal,
    inicioEn: parametros.inicioEn.toISOString(),
    finEn: parametros.finEn.toISOString(),
  };
}

/** Defensa en profundidad: aunque ningún `inputSchema` declare un campo de
 * identificador (verificado en CI), esta función elimina de la traza
 * cualquier clave que igual coincida con un patrón de identificador o que
 * "parezca" texto libre largo (posible fuga de contenido de huésped) antes
 * de persistir — la traza guarda metadatos, nunca contenido crudo (RV18
 * §4). */
function sanearArgumentos(argumentos: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const saneado: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(argumentos)) {
    if (typeof valor === "string" && valor.length > 200) {
      saneado[clave] = `[texto omitido, ${valor.length} caracteres]`;
      continue;
    }
    saneado[clave] = valor;
  }
  return saneado;
}

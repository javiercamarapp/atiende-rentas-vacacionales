import { detectarSenalesEscalamiento } from "../mensajeria/escalamiento.js";
import type { MotivoEscalamiento } from "./tipos.js";

/**
 * Escalamiento humano (H-081, REQ-146, RV18 §5). Un agente debe dejar de
 * intentar resolver y pedir intervención humana explícita ante:
 * 1. Ambigüedad no resuelta (dato faltante que el borrador no debe
 *    inventar) — ver `ResultadoBorrador.datoFaltanteDeclarado` de Lote 6.
 * 2. Huésped en escalada emocional (queja/emergencia/reembolso/vip) —
 *    reutiliza la detección léxica ya construida por Lote 6
 *    (`packages/domain/mensajeria/escalamiento.ts`, no se duplica ni se
 *    modifica ese archivo).
 * 3. Monto por encima de un umbral configurable por el anfitrión.
 * 4. Acción irreversible solicitada — nunca ofrecida como tool en
 *    absoluto (D-006); ver `ejecutor.ts`, que resuelve esto como "tool
 *    fuera de catálogo", no como "requiere aprobación".
 *
 * Ninguna función de este archivo ejecuta una acción por sí misma — solo
 * clasifica y devuelve una etiqueta para que el ejecutor decida el
 * `ResultadoInvocacionTool` correspondiente.
 */

export function debeEscalarPorTexto(textoHuesped: string): MotivoEscalamiento | null {
  const senales = detectarSenalesEscalamiento(textoHuesped);
  return senales.length > 0 ? "escalada_emocional" : null;
}

export function debeEscalarPorMonto(montoUsd: number, umbralUsd: number): MotivoEscalamiento | null {
  return montoUsd > umbralUsd ? "monto_alto" : null;
}

export function debeEscalarPorDatoFaltante(datoFaltanteDeclarado: boolean): MotivoEscalamiento | null {
  return datoFaltanteDeclarado ? "ambiguedad_dato_faltante" : null;
}

/**
 * Detecta si un texto generado por el proveedor LLM confirma una acción
 * sensible (descuento, cancelación, reembolso) como si YA estuviera
 * aplicada — comportamiento de fallo explícito de RV18 §7.2 ("El borrador
 * confirma un precio o descuento como si ya estuviera aplicado") aunque
 * ninguna tool fuera de catálogo se haya invocado. `EjecutorTools` usa
 * esto como una segunda capa de defensa sobre el CONTENIDO, no solo sobre
 * qué tool se llamó (RV18 §7.3: "grade what the agent produced").
 */
const PATRON_CONFIRMACION_NO_VERIFICADA =
  /\bconfirmad[oa]\b[^.]{0,40}\b(descuento|reembolso|cancelaci[oó]n|precio\s+especial)\b|\b(descuento|reembolso|cancelaci[oó]n|precio\s+especial)\b[^.]{0,40}\bconfirmad[oa]\b|\bya\s+(cancel[eé]|aplico|apliqu[eé]|reembols[eé])\b/i;

export function contieneConfirmacionNoVerificada(texto: string): boolean {
  return PATRON_CONFIRMACION_NO_VERIFICADA.test(texto);
}

/**
 * Patrón 8 (rescatado de Likida/atiende.ai): detección léxica de
 * intención de ejercicio de derechos ARCO (Acceso, Rectificación,
 * Cancelación, Oposición — LFPDPPP, la ley mexicana de protección de
 * datos personales en posesión de particulares) en el texto de un
 * huésped. `EjecutorTools` usa esto como fast-path: si el mensaje
 * menciona explícitamente sus derechos ARCO, o pide acceder/rectificar/
 * cancelar/oponerse a sus datos personales, o revocar su consentimiento,
 * NUNCA se invoca al proveedor LLM para ese mensaje (ver `ejecutor.ts`) —
 * es un trámite legal con plazos de ley, no un caso que un borrador
 * generado automáticamente deba intentar resolver.
 *
 * Deliberadamente estrecho (exige "datos personales" o "ARCO"/
 * "consentimiento" explícitos, nunca una palabra suelta como "acceso" o
 * "cancela" sola — esas ya las cubre `debeEscalarPorTexto`/
 * `contieneConfirmacionNoVerificada` con su propio criterio) para no
 * disparar en falso sobre un mensaje que solo menciona "cancelar mi
 * reserva" o "no puedo acceder al departamento".
 */
const PATRON_INTENCION_ARCO =
  /\bderechos?\s+arco\b|\b(?:acceso|rectificaci[oó]n|cancelaci[oó]n|oposici[oó]n)\s+(?:a|de)\s+mis?\s+datos\s+personales\b|\b(?:elimin|borr|cancel)\w*\s+mis?\s+datos\s+personales\b|\bportabilidad\s+de\s+mis?\s+datos(?:\s+personales)?\b|\brevocar\s+(?:mi\s+)?consentimiento\b|\baviso\s+de\s+privacidad\b.*\bsolicit/i;

export function detectarIntencionArco(texto: string): boolean {
  return PATRON_INTENCION_ARCO.test(texto);
}

// ---------------------------------------------------------------------------
// Loop-guard (H-083, REQ-149): tope de rondas de tool-calling por
// conversación, verificado ANTES de ejecutar la ronda siguiente y no
// después de pagarla (RV18 §5, RV18-R-10).
// ---------------------------------------------------------------------------

export class TopeRondasExcedidoError extends Error {
  constructor(readonly conversationId: string, readonly tope: number) {
    super(
      `La conversación ${conversationId} alcanzó el tope de ${tope} rondas de tool-calling — ` +
        `se marca para revisión humana en vez de devolver una respuesta parcial como si fuera completa.`,
    );
    this.name = "TopeRondasExcedidoError";
  }
}

export class LoopGuardConversacion {
  private readonly rondasPorConversacion = new Map<string, number>();

  constructor(private readonly topeRondas: number) {
    if (topeRondas < 1) throw new RangeError("topeRondas debe ser >= 1");
  }

  /** Verifica el tope ANTES de contar la ronda que está por ejecutarse —
   * lanza si ejecutarla excedería el tope. Nunca incrementa el contador si
   * lanza, para que el llamador pueda decidir marcar la conversación sin
   * ambigüedad sobre cuántas rondas realmente corrieron. */
  verificarAntesDeEjecutar(conversationId: string): void {
    const rondasActuales = this.rondasPorConversacion.get(conversationId) ?? 0;
    if (rondasActuales + 1 > this.topeRondas) {
      throw new TopeRondasExcedidoError(conversationId, this.topeRondas);
    }
    this.rondasPorConversacion.set(conversationId, rondasActuales + 1);
  }

  rondasEjecutadas(conversationId: string): number {
    return this.rondasPorConversacion.get(conversationId) ?? 0;
  }

  reiniciar(conversationId: string): void {
    this.rondasPorConversacion.delete(conversationId);
  }
}

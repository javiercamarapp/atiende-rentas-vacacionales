import type { ProveedorLLM, RespuestaLLM, SolicitudLLM } from "./proveedorLLM.js";

/**
 * Fallback entre proveedores LLM (H-085, REQ-148, RV18-R-09). Se limita
 * EXCLUSIVAMENTE a la llamada de generación de texto/decisión de tool a
 * invocar — nunca re-ejecuta una mutación ya corrida en la misma
 * conversación, porque estructuralmente no puede: `EjecutorTools.
 * ejecutarRonda` llama a `ProveedorLLM.generar` UNA sola vez por ronda y
 * solo procesa `toolInvocada` (ejecutando el handler correspondiente)
 * DESPUÉS de que esa llamada retorna — un fallback que ocurre DENTRO de
 * `generar()` nunca puede coincidir con un handler ya ejecutado, porque
 * ese handler ni siquiera empieza a correr hasta que `generar()` termina.
 *
 * `modeloReal` de la respuesta final es SIEMPRE el del proveedor que
 * efectivamente respondió (secundario si el primario falló) — nunca el
 * nominal configurado (RV18 §4), así que la trazabilidad de
 * `packages/domain/agentes/trazabilidad.ts` atribuye el costo/duración al
 * modelo real de esa ronda automáticamente (ya usa `respuesta.modeloReal`
 * tal cual).
 */
export class ProveedorLLMConFallback implements ProveedorLLM {
  readonly nombre: string;
  /** `etiquetado` solo es `true` si AMBOS proveedores lo son — un
   * fallback que pueda terminar llamando a un proveedor real no debe
   * anunciarse como "simulado" solo porque el primario sí lo era. */
  readonly etiquetado: boolean;

  constructor(
    private readonly primario: ProveedorLLM,
    private readonly secundario: ProveedorLLM,
  ) {
    this.nombre = `fallback(${primario.nombre}->${secundario.nombre})`;
    this.etiquetado = primario.etiquetado && secundario.etiquetado;
  }

  async generar(solicitud: SolicitudLLM): Promise<RespuestaLLM> {
    try {
      return await this.primario.generar(solicitud);
    } catch {
      // El primario falló ANTES de producir cualquier `toolInvocada` —
      // ningún handler de tool corrió todavía en esta ronda, así que
      // reintentar con el secundario nunca duplica un efecto.
      return await this.secundario.generar(solicitud);
    }
  }
}

import type { AdaptadorCorreo, ContenidoNotificacion, DestinatarioCorreo, ResultadoEnvioCorreo } from "@atiende-rv/domain/notificaciones";
import { assertNoParecerProduccion, logSimulador, type OpcionesArranqueSimulador } from "../comun/etiquetado.js";

/**
 * SIMULADOR — desarrollo/pruebas (H-054, D-019): implementación del
 * `AdaptadorCorreo` de `@atiende-rv/domain/notificaciones`. Mismo patrón
 * exacto que `SimuladorMensajeria` (packages/sim/src/mensajeria/) —
 * ningún envío real de correo ocurre aquí, NUNCA hace una conexión SMTP
 * real: solo registra en memoria y deja constancia en el log con el
 * prefijo `SIMULADOR`. `resultado.simulado` es SIEMPRE `true` — ningún
 * consumidor puede confundir esto con un envío real (ver
 * `apps/api/src/workers/notificaciones/adaptadorCorreo.ts` para el punto
 * de extensión real, desactivado por defecto).
 *
 * Nunca registra el email del destinatario en el log (minimización de
 * PII, §RV19/21-7) — solo su longitud y el usuarioId (operativo, no
 * contacto).
 */
export class AdaptadorCorreoSimulado implements AdaptadorCorreo {
  private readonly enviados: Array<{ destinatario: DestinatarioCorreo; contenido: ContenidoNotificacion; enviadoEn: string }> = [];

  constructor(opciones: OpcionesArranqueSimulador = {}) {
    assertNoParecerProduccion(opciones);
  }

  async enviar(destinatario: DestinatarioCorreo, contenido: ContenidoNotificacion): Promise<ResultadoEnvioCorreo> {
    const enviadoEn = new Date().toISOString();
    this.enviados.push({ destinatario, contenido, enviadoEn });
    console.log(
      logSimulador(
        "correo",
        `correo simulado a usuarioId=${destinatario.usuarioId} (email longitud=${destinatario.email.length}) — ` +
          `tipoEvento=${contenido.tipoEvento} tituloLongitud=${contenido.titulo.length}`,
      ),
    );
    return { enviado: true, simulado: true };
  }

  /** Solo para pruebas: inspecciona lo "enviado" sin exponer un canal real. */
  correosEnviados(): ReadonlyArray<{ destinatario: DestinatarioCorreo; contenido: ContenidoNotificacion; enviadoEn: string }> {
    return this.enviados;
  }
}

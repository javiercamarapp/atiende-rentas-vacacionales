import type {
  CanalMensajeria,
  CanalMensajeriaCodigo,
  EntradaEnviarMensajeAprobado,
  EstadoConexionCanal,
  ResultadoEnvioMensaje,
} from "@atiende-rv/domain";
import { assertNoParecerProduccion, logSimulador, type OpcionesArranqueSimulador } from "../comun/etiquetado.js";

/**
 * SIMULADOR — desarrollo/pruebas: `CanalMensajeria` (Lote 6, entregable
 * "estado honesto sin canal de mensajería real conectado"). Ningún
 * adaptador real de mensajería existe hoy (`packages/adapters` no declara
 * la capacidad `messaging` para ningún canal) — este simulador etiquetado
 * (D-019) es la ÚNICA forma de ejercitar `CanalMensajeria` en pruebas o en
 * desarrollo local, nunca se confunde con una conexión productiva.
 *
 * `enviarMensajeAprobado` exige `aprobadoPor` en su firma (contrato de
 * `packages/domain/src/mensajeria/canalMensajeria.ts`) — aun así, este
 * simulador vuelve a verificar defensivamente que el campo esté presente
 * antes de "enviar" (append a un log en memoria), como segunda capa sobre
 * el tipo.
 */
export class SimuladorMensajeria implements CanalMensajeria {
  readonly nombreCanal: CanalMensajeriaCodigo;
  readonly capacidades = {
    availabilityPush: false,
    ratesPush: false,
    reservationsPull: false,
    icalImportExport: false,
    messaging: true,
  };

  private readonly enviados: Array<EntradaEnviarMensajeAprobado & { enviadoEn: string }> = [];

  constructor(nombreCanal: CanalMensajeriaCodigo, opciones: OpcionesArranqueSimulador = {}) {
    assertNoParecerProduccion(opciones);
    this.nombreCanal = nombreCanal;
  }

  obtenerEstadoConexion(): EstadoConexionCanal {
    return "simulador";
  }

  async enviarMensajeAprobado(entrada: EntradaEnviarMensajeAprobado): Promise<ResultadoEnvioMensaje> {
    if (!entrada.aprobadoPor) {
      // Defensa en profundidad: aunque el tipo ya lo exige, un simulador de
      // pruebas es precisamente donde se ejercitan valores inválidos.
      throw new Error("SimuladorMensajeria: enviarMensajeAprobado requiere 'aprobadoPor' (D-006, RV18-R-03)");
    }
    const registro = { ...entrada, enviadoEn: new Date().toISOString() };
    this.enviados.push(registro);
    console.log(
      logSimulador(
        this.nombreCanal,
        // Nunca el texto completo del mensaje en el log — solo longitud y
        // metadatos (minimización de PII, §RV19/21-7).
        `mensaje aprobado enviado — borradorId=${entrada.borradorId} longitud=${entrada.texto.length} aprobadoPor=${entrada.aprobadoPor}`,
      ),
    );
    return { enviadoEn: registro.enviadoEn, idExternoMensaje: `sim-${this.nombreCanal}-${this.enviados.length}` };
  }

  /** Solo para pruebas: inspecciona lo "enviado" sin exponer un canal real. */
  mensajesEnviados(): ReadonlyArray<EntradaEnviarMensajeAprobado & { enviadoEn: string }> {
    return this.enviados;
  }
}

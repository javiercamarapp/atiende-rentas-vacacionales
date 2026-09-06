import { randomUUID } from "node:crypto";
import * as http from "node:http";
import { assertNoParecerProduccion, logSimulador, type OpcionesArranqueSimulador } from "../comun/etiquetado.js";

/**
 * SIMULADOR — desarrollo/pruebas: Expedia Group Lodging Connectivity
 * (Nivel B, RV22 F04-F13). Modela el patrón "pull + confirmación
 * separada" del Booking Retrieval/Confirmation legacy (F09): una reserva
 * encolada se REENVÍA en cada `GET /supply/lodging/booking-retrieval`
 * hasta recibir `POST /supply/lodging/booking-confirm` — mismo riesgo de
 * "ack perdido" que Booking.com (RV04), con nombre de operación distinto.
 * Nunca representa una conexión productiva (D-019).
 *
 * Endpoints:
 *   `POST /oauth/token`                        — devuelve un access token
 *                                                  de prueba (nunca válido
 *                                                  fuera de este simulador).
 *   `POST /supply/lodging/availability`         — push de disponibilidad/
 *                                                  tarifas; rechaza lotes
 *                                                  de más de 5,000 (F06).
 *   `GET  /supply/lodging/booking-retrieval`    — pull de reservas
 *                                                  pendientes (máx. 125,
 *                                                  F09), reenvía hasta
 *                                                  confirmar.
 *   `POST /supply/lodging/booking-confirm`      — confirma una reserva;
 *                                                  deja de reenviarse.
 *   `POST /interno/encolar-reserva`             — SOLO de prueba: agrega
 *                                                  una reserva simulada.
 */

export interface EventoReservaExpedia {
  hotelReservationId: string;
  expediaPropertyId: string;
  checkIn: string;
  checkOut: string;
  estado: "nueva" | "modificada" | "cancelada";
}

interface EntradaCola {
  reserva: EventoReservaExpedia;
  confirmada: boolean;
  vecesReenviada: number;
}

const LIMITE_DISPONIBILIDAD_POR_MENSAJE = 5000;
const LIMITE_REGISTROS_POR_LLAMADA = 125;

export class ExpediaApiSimulator {
  private readonly nombreCanal = "expedia-api";
  private readonly cola = new Map<string, EntradaCola>();
  private readonly lotesRecibidos: number[] = [];
  private servidor: http.Server;

  constructor(opciones: OpcionesArranqueSimulador = {}) {
    assertNoParecerProduccion(opciones);
    this.servidor = http.createServer((req, res) => {
      this.manejar(req, res).catch((error) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (error as Error).message }));
      });
    });
  }

  private async leerCuerpo(req: http.IncomingMessage): Promise<string> {
    const trozos: Buffer[] = [];
    for await (const trozo of req) trozos.push(trozo as Buffer);
    return Buffer.concat(trozos).toString("utf8");
  }

  private async manejar(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://simulador.local");
    console.log(logSimulador(this.nombreCanal, `${req.method} ${url.pathname}`));

    if (req.method === "POST" && url.pathname === "/oauth/token") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ accessToken: `SIMULADOR-${randomUUID()}`, expiraEnSegundos: 3600 }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/supply/lodging/availability") {
      const cuerpo = JSON.parse(await this.leerCuerpo(req)) as { actualizaciones: unknown[] };
      if (cuerpo.actualizaciones.length > LIMITE_DISPONIBILIDAD_POR_MENSAJE) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `lote excede el límite de ${LIMITE_DISPONIBILIDAD_POR_MENSAJE} actualizaciones (F06)` }));
        return;
      }
      this.lotesRecibidos.push(cuerpo.actualizaciones.length);
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, recibidas: cuerpo.actualizaciones.length }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/supply/lodging/booking-retrieval") {
      const limite = Math.min(Number(url.searchParams.get("limit") ?? LIMITE_REGISTROS_POR_LLAMADA), LIMITE_REGISTROS_POR_LLAMADA);
      const pendientes = this.pull().slice(0, limite);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ reservas: pendientes }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/supply/lodging/booking-confirm") {
      const cuerpo = JSON.parse(await this.leerCuerpo(req)) as { hotelReservationId: string };
      this.confirmar(cuerpo.hotelReservationId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/interno/encolar-reserva") {
      const cuerpo = JSON.parse(await this.leerCuerpo(req)) as EventoReservaExpedia;
      this.encolarReserva(cuerpo);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "no encontrado" }));
  }

  /** Uso directo desde pruebas (sin pasar por HTTP). */
  encolarReserva(datos: EventoReservaExpedia): void {
    this.cola.set(datos.hotelReservationId, { reserva: datos, confirmada: false, vecesReenviada: 0 });
  }

  /** F09: reenvía TODAS las reservas no confirmadas en cada llamada
   * (mismo patrón de "ack perdido" de Booking.com). */
  pull(): EventoReservaExpedia[] {
    const pendientes: EventoReservaExpedia[] = [];
    for (const entrada of this.cola.values()) {
      if (!entrada.confirmada) {
        entrada.vecesReenviada++;
        pendientes.push(entrada.reserva);
      }
    }
    return pendientes;
  }

  confirmar(hotelReservationId: string): void {
    const entrada = this.cola.get(hotelReservationId);
    if (entrada) entrada.confirmada = true;
  }

  vecesReenviada(hotelReservationId: string): number {
    return this.cola.get(hotelReservationId)?.vecesReenviada ?? 0;
  }

  get lotesDeDisponibilidadRecibidos(): readonly number[] {
    return this.lotesRecibidos;
  }

  async iniciar(): Promise<{ puerto: number; urlBase: string }> {
    await new Promise<void>((resolve) => this.servidor.listen(0, "127.0.0.1", resolve));
    const direccion = this.servidor.address();
    if (!direccion || typeof direccion === "string") {
      throw new Error("no se pudo determinar el puerto del simulador");
    }
    return { puerto: direccion.port, urlBase: `http://127.0.0.1:${direccion.port}` };
  }

  async detener(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.servidor.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

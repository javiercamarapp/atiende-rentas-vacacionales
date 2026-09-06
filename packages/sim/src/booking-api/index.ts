import { randomUUID } from "node:crypto";
import * as http from "node:http";
import { assertNoParecerProduccion, logSimulador, type OpcionesArranqueSimulador } from "../comun/etiquetado.js";

/**
 * SIMULADOR — desarrollo/pruebas: API de pull de reservas de Booking.com
 * (RV04: pull con `ack` explícito, reenvío hasta que el receptor confirme).
 * Nunca representa una conexión productiva (D-019) — Booking.com real no
 * tiene una vía directa de disponibilidad para este producto (D-011); este
 * simulador solo existe para ejercitar el patrón "pull + ack + reenvío"
 * documentado en RV04 contra el motor de sincronización.
 *
 * Endpoints:
 *   `POST /interno/encolar`   — SOLO de prueba: agrega una reserva simulada
 *                                a la cola pendiente (nunca existe en la
 *                                API real de Booking.com).
 *   `GET  /reservas/pull`     — devuelve TODAS las reservas aún no
 *                                confirmadas (`ack`); reenvía las mismas en
 *                                cada llamada hasta que se confirmen.
 *   `POST /reservas/ack`      — `{ ids: string[] }`, marca esas reservas
 *                                como confirmadas; dejan de reenviarse.
 */

export interface ReservaSimuladaBooking {
  id: string;
  unidadExternaId: string;
  checkIn: string;
  checkOut: string;
  estado: "CONFIRMADA" | "CANCELADA";
}

interface EntradaCola {
  reserva: ReservaSimuladaBooking;
  confirmada: boolean;
  vecesReenviada: number;
}

export class BookingApiSimulator {
  private readonly nombreCanal = "booking-api";
  private readonly cola = new Map<string, EntradaCola>();
  private servidor: http.Server;

  constructor(opciones: OpcionesArranqueSimulador = {}) {
    assertNoParecerProduccion(opciones);
    this.servidor = http.createServer((req, res) => this.manejar(req, res));
  }

  private async leerCuerpo(req: http.IncomingMessage): Promise<string> {
    const trozos: Buffer[] = [];
    for await (const trozo of req) trozos.push(trozo as Buffer);
    return Buffer.concat(trozos).toString("utf8");
  }

  private async manejar(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    console.log(logSimulador(this.nombreCanal, `${req.method} ${req.url}`));
    try {
      if (req.method === "POST" && req.url === "/interno/encolar") {
        const body = JSON.parse(await this.leerCuerpo(req)) as ReservaSimuladaBooking;
        this.encolarReserva(body);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "GET" && req.url === "/reservas/pull") {
        const pendientes = this.pull();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ reservas: pendientes }));
        return;
      }
      if (req.method === "POST" && req.url === "/reservas/ack") {
        const body = JSON.parse(await this.leerCuerpo(req)) as { ids: string[] };
        this.ack(body.ids);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no encontrado" }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  }

  /** Uso directo desde pruebas (sin pasar por HTTP) — equivalente a llamar
   * al endpoint interno de encolado. */
  encolarReserva(datos: Omit<ReservaSimuladaBooking, "id"> & { id?: string }): ReservaSimuladaBooking {
    const reserva: ReservaSimuladaBooking = { id: datos.id ?? randomUUID(), ...datos };
    this.cola.set(reserva.id, { reserva, confirmada: false, vecesReenviada: 0 });
    return reserva;
  }

  /** Devuelve todas las reservas pendientes de `ack`; cada llamada
   * incrementa su contador de reenvío (RV04: reenvío hasta ack). */
  pull(): ReservaSimuladaBooking[] {
    const pendientes: ReservaSimuladaBooking[] = [];
    for (const entrada of this.cola.values()) {
      if (!entrada.confirmada) {
        entrada.vecesReenviada++;
        pendientes.push(entrada.reserva);
      }
    }
    return pendientes;
  }

  ack(ids: readonly string[]): void {
    for (const id of ids) {
      const entrada = this.cola.get(id);
      if (entrada) entrada.confirmada = true;
    }
  }

  vecesReenviada(id: string): number {
    return this.cola.get(id)?.vecesReenviada ?? 0;
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

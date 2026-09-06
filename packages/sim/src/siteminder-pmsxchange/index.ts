import * as http from "node:http";
import { assertNoParecerProduccion, logSimulador, type OpcionesArranqueSimulador } from "../comun/etiquetado.js";

/**
 * SIMULADOR — desarrollo/pruebas: SiteMinder pmsXchange (Nivel B, RV22
 * F24-F25). Modela el patrón "puente" — un push/pull cubre varios canales
 * downstream (Booking/Expedia/Vrbo/Despegar/PriceTravel) — y expone un
 * endpoint interno para simular que uno de esos canales downstream
 * "reexporta" (eco) exactamente lo que nosotros empujamos, ejercitando el
 * caso adversarial "puente reexporta nuestro bloqueo → anti-eco". Nunca
 * representa una conexión productiva (D-019).
 *
 * Endpoints:
 *   `POST /pmsxchange/inventario`        — push de disponibilidad/tarifas/
 *                                            restricciones (RV22 F25).
 *   `GET  /pmsxchange/reservas`          — pull de reservas (incluye
 *                                            modificadas/canceladas).
 *   `POST /interno/encolar-reserva`      — SOLO de prueba.
 *   `POST /interno/reexportar-inventario`— SOLO de prueba: convierte el
 *                                            último push de inventario
 *                                            recibido en una "reserva" (o
 *                                            evento) que se puede pull-ear
 *                                            de vuelta, simulando el eco
 *                                            de un canal downstream.
 */

export interface RestriccionPmsXchange {
  estanciaMinima?: number;
  estanciaMaxima?: number;
  cerradoLlegada?: boolean;
  cerradoSalida?: boolean;
}

interface ActualizacionRecibida {
  canalDestino: string;
  unidadExternaId: string;
  fecha: string;
  disponible: number;
  cerrado: boolean;
  tarifa?: number;
  restricciones?: RestriccionPmsXchange;
}

interface ReservaSimulada {
  id: string;
  canalOrigen: string;
  unidadExternaId: string;
  checkIn: string;
  checkOut: string;
  estado: "nueva" | "modificada" | "cancelada";
}

export class SiteMinderPmsXchangeSimulator {
  private readonly nombreCanal = "siteminder-pmsxchange";
  private readonly inventarioRecibido: ActualizacionRecibida[] = [];
  private readonly reservas: ReservaSimulada[] = [];
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

    if (req.method === "POST" && url.pathname === "/pmsxchange/inventario") {
      const cuerpo = JSON.parse(await this.leerCuerpo(req)) as { actualizaciones: ActualizacionRecibida[] };
      this.inventarioRecibido.push(...cuerpo.actualizaciones);
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ aceptadas: cuerpo.actualizaciones.length }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/pmsxchange/reservas") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ reservas: this.reservas }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/interno/encolar-reserva") {
      const cuerpo = JSON.parse(await this.leerCuerpo(req)) as ReservaSimulada;
      this.reservas.push(cuerpo);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "no encontrado" }));
  }

  /** Uso directo desde pruebas: simula que un canal downstream (p. ej.
   * Booking.com, alcanzado a través de este puente) "reexporta" el último
   * cierre de disponibilidad que nosotros empujamos como si fuera una
   * novedad — el caso exacto que `detectarEco` (packages/adapters/src/
   * sync/antiEco.ts) debe reconocer para no crear un bloqueo duplicado. */
  reexportarUltimoInventarioComoReserva(idReserva: string): ReservaSimulada | null {
    const ultimo = this.inventarioRecibido.at(-1);
    if (!ultimo || !ultimo.cerrado) return null;
    const reserva: ReservaSimulada = {
      id: idReserva,
      canalOrigen: ultimo.canalDestino,
      unidadExternaId: ultimo.unidadExternaId,
      checkIn: ultimo.fecha,
      checkOut: ultimo.fecha,
      estado: "nueva",
    };
    this.reservas.push(reserva);
    return reserva;
  }

  get inventarioRecibidoTotal(): readonly ActualizacionRecibida[] {
    return this.inventarioRecibido;
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

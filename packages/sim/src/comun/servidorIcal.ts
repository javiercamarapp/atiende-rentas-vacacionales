import { createHash } from "node:crypto";
import * as http from "node:http";
import { assertNoParecerProduccion, logSimulador, type OpcionesArranqueSimulador } from "./etiquetado.js";

/**
 * Simulador genérico de un feed iCal de canal (H-... §Operación-4, D-019).
 * Un `ServidorIcalSimulado` es un `http.Server` real escuchando en
 * `127.0.0.1` (puerto aleatorio) que expone un único endpoint `GET
 * /feed.ics`, cuyo contenido depende del escenario configurado por la
 * prueba (`definirEscenario`). El host lógico que se usa en las URLs
 * generadas es SIEMPRE `simulador.local` (D-019) — el llamador debe pasar
 * `resolverPersonalizado` (que este módulo expone) a `fetchIcsSeguro` para
 * que esa URL resuelva a `127.0.0.1` sin tocar `/etc/hosts` ni DNS real.
 */

export type EscenarioIcalSimulado =
  | { tipo: "vacio" }
  | { tipo: "malformado" }
  | { tipo: "inaccesible"; statusHttp?: number }
  | { tipo: "ics"; contenidoIcs: string };

export interface OpcionesServidorIcal extends OpcionesArranqueSimulador {
  nombreCanal: string;
}

function etagDe(contenido: string): string {
  return `"${createHash("sha256").update(contenido).digest("hex").slice(0, 16)}"`;
}

const FEED_VACIO_VALIDO =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SIMULADOR//EN\r\nEND:VCALENDAR\r\n";

const FEED_MALFORMADO =
  "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:malformado@simulador.local\r\n"; // sin END, deliberado

export class ServidorIcalSimulado {
  readonly nombreCanal: string;
  private escenario: EscenarioIcalSimulado = { tipo: "vacio" };
  private servidor: http.Server;
  private puerto = 0;
  private llamadasRecibidas = 0;

  constructor(opciones: OpcionesServidorIcal) {
    assertNoParecerProduccion(opciones);
    this.nombreCanal = opciones.nombreCanal;
    this.servidor = http.createServer((req, res) => this.manejarPeticion(req, res));
  }

  private manejarPeticion(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.llamadasRecibidas++;
    console.log(logSimulador(this.nombreCanal, `GET ${req.url} (llamada #${this.llamadasRecibidas})`));

    if (this.escenario.tipo === "inaccesible") {
      res.writeHead(this.escenario.statusHttp ?? 503, { "Content-Type": "text/plain" });
      res.end("SIMULADOR: feed marcado como inaccesible para esta prueba");
      return;
    }

    const contenido =
      this.escenario.tipo === "vacio"
        ? FEED_VACIO_VALIDO
        : this.escenario.tipo === "malformado"
          ? FEED_MALFORMADO
          : this.escenario.contenidoIcs;

    const etag = etagDe(contenido);
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag });
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/calendar; charset=utf-8",
      ETag: etag,
      "Last-Modified": new Date().toUTCString(),
    });
    res.end(contenido);
  }

  definirEscenario(escenario: EscenarioIcalSimulado): void {
    console.log(logSimulador(this.nombreCanal, `escenario configurado: ${escenario.tipo}`));
    this.escenario = escenario;
  }

  async iniciar(): Promise<{ puerto: number; url: string }> {
    await new Promise<void>((resolve) => this.servidor.listen(0, "127.0.0.1", resolve));
    const direccion = this.servidor.address();
    if (!direccion || typeof direccion === "string") {
      throw new Error("no se pudo determinar el puerto del simulador");
    }
    this.puerto = direccion.port;
    return { puerto: this.puerto, url: `http://simulador.local:${this.puerto}/feed.ics` };
  }

  /** Para pasar como `resolverPersonalizado` a `fetchIcsSeguro` (H-024):
   * `simulador.local` resuelve SIEMPRE a `127.0.0.1`, sin depender de DNS
   * real ni de `/etc/hosts`. */
  resolverPersonalizado = (hostname: string): string[] => {
    if (hostname !== "simulador.local") {
      throw new Error(`ServidorIcalSimulado solo resuelve "simulador.local", recibido "${hostname}"`);
    }
    return ["127.0.0.1"];
  };

  get numeroDeLlamadas(): number {
    return this.llamadasRecibidas;
  }

  async detener(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.servidor.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

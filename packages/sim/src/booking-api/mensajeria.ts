import { randomUUID } from "node:crypto";
import * as http from "node:http";
import { assertNoParecerProduccion, logSimulador, type OpcionesArranqueSimulador } from "../comun/etiquetado.js";

/**
 * SIMULADOR — desarrollo/pruebas: réplica local fiel del contrato HTTP
 * público de la Messaging API de Booking.com (ver cabecera de
 * `@atiende-rv/adapters` `booking/mensajeria.ts` para las citas de fuente
 * primaria). Nunca representa una conexión productiva (D-019): Booking.com
 * real no tiene evidencia de partner aprobado en este entorno (D-011).
 *
 * Endpoints reales replicados (mismos paths/métodos/campos documentados):
 *   `POST /token-based-authentication/exchange` — `{client_id,
 *     client_secret}` → `{jwt, ruid}`. Cualquier `client_id`/`client_secret`
 *     no vacíos se acepta (el simulador no valida contra una base de
 *     partners real, solo ejercita el CONTRATO); el JWT emitido es el único
 *     que este simulador acepta después, para poder probar de verdad el
 *     manejo de 401/refresco del cliente.
 *   `GET  /messaging/properties/:propertyId/conversations`
 *   `GET  /messaging/properties/:propertyId/conversations/:conversationId`
 *   `POST /messaging/properties/:propertyId/conversations/:conversationId`
 *     — `{message:{content, attachment_ids?}}` → `{message_id,
 *     guest_has_account, ok}`.
 *   `GET  /messaging/messages/latest` — hasta 100 mensajes pendientes +
 *     `number_of_messages` (mismo patrón "reenvía hasta confirmar" que
 *     `BookingApiSimulator.pull`).
 *   `PUT  /messaging/messages?number_of_messages=N` — desencola los N más
 *     antiguos.
 *
 * Endpoints SOLO de prueba (nunca existen en la API real de Booking.com):
 *   `POST /interno/encolar-mensaje-entrante` — inyecta un mensaje entrante
 *     simulado en la cola de `/messaging/messages/latest`.
 *   `POST /interno/expirar-token` — invalida el JWT vigente para poder
 *     probar el flujo de reautenticación tras un 401.
 */

interface EntradaColaMensaje {
  mensaje: { message_id: string; message_thread_id: string; content: string; creation_date: string };
  confirmado: boolean;
}

interface Conversacion {
  propertyId: string;
  conversationId: string;
  mensajes: Array<{ message_id: string; content: string; creation_date: string }>;
}

export class BookingMessagingApiSimulator {
  private readonly nombreCanal = "booking-mensajeria";
  private servidor: http.Server;
  private tokenVigente: string | null = null;
  private readonly colaEntrante: EntradaColaMensaje[] = [];
  private readonly conversaciones = new Map<string, Conversacion>();
  private readonly mensajesEnviadosTotal: Array<{ propertyId: string; conversationId: string; content: string }> = [];

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

  private exigirAuthValida(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const encabezado = req.headers.authorization ?? "";
    const esperado = `Bearer ${this.tokenVigente}`;
    if (!this.tokenVigente || encabezado !== esperado) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "token inválido o expirado" }));
      return false;
    }
    return true;
  }

  private conversacionDe(propertyId: string, conversationId: string): Conversacion {
    const clave = `${propertyId}::${conversationId}`;
    let existente = this.conversaciones.get(clave);
    if (!existente) {
      existente = { propertyId, conversationId, mensajes: [] };
      this.conversaciones.set(clave, existente);
    }
    return existente;
  }

  private async manejar(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    console.log(logSimulador(this.nombreCanal, `${req.method} ${url.pathname}${url.search}`));

    if (req.method === "POST" && url.pathname === "/token-based-authentication/exchange") {
      const cuerpo = JSON.parse(await this.leerCuerpo(req)) as { client_id?: string; client_secret?: string };
      if (!cuerpo.client_id || !cuerpo.client_secret) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "client_id y client_secret son obligatorios" }));
        return;
      }
      this.tokenVigente = `sim-jwt-${randomUUID()}`;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jwt: this.tokenVigente, ruid: randomUUID() }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/interno/expirar-token") {
      this.tokenVigente = null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/interno/encolar-mensaje-entrante") {
      const cuerpo = JSON.parse(await this.leerCuerpo(req)) as { messageThreadId: string; content: string };
      this.colaEntrante.push({
        mensaje: {
          message_id: randomUUID(),
          message_thread_id: cuerpo.messageThreadId,
          content: cuerpo.content,
          creation_date: new Date().toISOString(),
        },
        confirmado: false,
      });
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (!this.exigirAuthValida(req, res)) return;

    const matchEnviar = url.pathname.match(/^\/messaging\/properties\/([^/]+)\/conversations\/([^/]+)$/);
    if (req.method === "POST" && matchEnviar) {
      const [, propertyId, conversationId] = matchEnviar;
      const cuerpo = JSON.parse(await this.leerCuerpo(req)) as { message: { content: string } };
      const conversacion = this.conversacionDe(propertyId!, conversationId!);
      const messageId = randomUUID();
      conversacion.mensajes.push({ message_id: messageId, content: cuerpo.message.content, creation_date: new Date().toISOString() });
      this.mensajesEnviadosTotal.push({ propertyId: propertyId!, conversationId: conversationId!, content: cuerpo.message.content });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message_id: messageId, guest_has_account: false, ok: true }));
      return;
    }

    if (req.method === "GET" && matchEnviar) {
      const [, propertyId, conversationId] = matchEnviar;
      const conversacion = this.conversacionDe(propertyId!, conversationId!);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ property_id: propertyId, conversation_id: conversationId, messages: conversacion.mensajes }));
      return;
    }

    const matchListaConversaciones = url.pathname.match(/^\/messaging\/properties\/([^/]+)\/conversations$/);
    if (req.method === "GET" && matchListaConversaciones) {
      const [, propertyId] = matchListaConversaciones;
      const propias = [...this.conversaciones.values()].filter((c) => c.propertyId === propertyId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ conversations: propias.map((c) => ({ conversation_id: c.conversationId })) }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/messaging/messages/latest") {
      const pendientes = this.colaEntrante.filter((e) => !e.confirmado).slice(0, 100);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ messages: pendientes.map((e) => e.mensaje), number_of_messages: pendientes.length }));
      return;
    }

    if (req.method === "PUT" && url.pathname === "/messaging/messages") {
      const n = Number(url.searchParams.get("number_of_messages") ?? "0");
      let confirmados = 0;
      for (const entrada of this.colaEntrante) {
        if (confirmados >= n) break;
        if (!entrada.confirmado) {
          entrada.confirmado = true;
          confirmados++;
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, confirmados }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "no encontrado" }));
  }

  /** Solo pruebas: inspección de lo realmente "enviado" contra el
   * simulador, sin exponer un canal real. */
  get mensajesEnviados(): ReadonlyArray<{ propertyId: string; conversationId: string; content: string }> {
    return this.mensajesEnviadosTotal;
  }

  /** Solo pruebas: cuántos mensajes entrantes siguen sin confirmar (para
   * verificar el patrón de reenvío antes de `confirmarRecepcion`). */
  get pendientesSinConfirmar(): number {
    return this.colaEntrante.filter((e) => !e.confirmado).length;
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

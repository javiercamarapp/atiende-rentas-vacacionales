import {
  evaluarEstadoConexion,
  type CanalMensajeria,
  type CanalMensajeriaEntrante,
  type ChannelCapabilities,
  type EntradaEnviarMensajeAprobado,
  type EstadoConexionCanal,
  type EvidenciaConexionCanal,
  type MensajeCanalEntrante,
  type ResultadoEnvioMensaje,
  type ResultadoRecepcionMensajes,
} from "@atiende-rv/domain";

/**
 * ============================================================================
 * NO VERIFICADO CONTRA EL PROVEEDOR REAL (mismo patrón que `SATSubmitter` de
 * un repo hermano y que `ExpediaApiClient`/`BookingApiSimulator` de este
 * mismo repo, ver `../expedia/client.ts`): este archivo implementa el
 * contrato HTTP EXACTO que Booking.com documenta públicamente para su
 * "Messaging API" (parte de las Connectivity APIs, la MISMA familia de API
 * que `./otaXml.ts` ya usa para disponibilidad/tarifas — mismo host
 * `supply-xml.booking.com`, mismo programa de partner), pero NUNCA se ha
 * ejecutado contra `https://supply-xml.booking.com` real: el Connectivity
 * Partner Program de Booking.com sigue pausado a nuevos proveedores (D-011,
 * `MOTIVO_PARTNER_PENDIENTE_BOOKING` en `./adapter.ts`), así que no existe
 * ninguna credencial de partner en este entorno para probarlo de verdad.
 * `obtenerEstadoConexion()` de `BookingMessagingChannelAdapter` refleja esto
 * con honestidad (D-017): SIEMPRE `partner_pendiente` salvo evidencia real.
 *
 * Fuente de la investigación (2026-09-09, WebFetch de fuente primaria —
 * detalle completo con citas en
 * `docs/investigacion/RV23-mensajeria-api-canales-2026-09.md`):
 *   - Auth (token-based, la vía vigente — el esquema Basic/credential-based
 *     se anunció con fecha de sunset 2025-12-31):
 *     `POST https://connectivity-authentication.booking.com/token-based-authentication/exchange`
 *     body `{ client_id, client_secret }` → `{ jwt, ruid }`; el JWT expira a
 *     la hora (`HTTP 401` al expirar, refrescar llamando de nuevo al mismo
 *     endpoint); máximo 30 tokens/hora por cuenta de máquina.
 *     https://developers.booking.com/connectivity/docs/token-based-authentication
 *   - Recibir (pull, reenvía hasta confirmar — mismo patrón que
 *     `ExpediaApiClient.recuperarReservas`/`confirmarReserva` y
 *     `BookingApiSimulator.pull`/`ack` de este repo):
 *     `GET https://supply-xml.booking.com/messaging/messages/latest`
 *     (header `Accept-version: 1.3`) → hasta 100 mensajes +
 *     `number_of_messages`;
 *     `PUT https://supply-xml.booking.com/messaging/messages?number_of_messages=N`
 *     confirma y desencola.
 *     https://developers.booking.com/connectivity/docs/messaging-api/managing-messages
 *     (Booking.com ya anuncia el retiro futuro de este pull en favor de un
 *     "Connectivity Notification Service" tipo webhook — su contrato
 *     detallado no se pudo confirmar con la misma fuente primaria en esta
 *     investigación, así que NO se implementa aquí; ver Lagunas en RV23.)
 *   - Enviar (NO documentado como idempotente — sin `Idempotency-Key`; este
 *     cliente deliberadamente NO reintenta un envío con backoff automático,
 *     ver `enviarMensaje`):
 *     `POST https://supply-xml.booking.com/messaging/properties/{property_id}/conversations/{conversation_id}`
 *     body `{ message: { content, attachment_ids? } }` →
 *     `{ message_id, guest_has_account, ok }`.
 *     https://developers.booking.com/connectivity/docs/messaging-api/managing-conversations
 *   - Mensajería pre-reserva (Request to Book): misma Messaging API, exige
 *     la función "Enable Messaging API RTB" activada en el Provider Portal;
 *     la plataforma misma prohíbe adjuntos y compartir contacto en ese modo
 *     (`RV10-R-04`/`RV10-R-07` de este repo ya son más estrictos que eso).
 *     https://developers.booking.com/connectivity/docs/request-to-book/pre-reservation-messaging
 *
 * Qué hace falta para la PRIMERA prueba real contra Booking.com (documentar
 * exactamente, nunca suponer "probablemente funciona"):
 *   1. Ser Connectivity Partner activo de Booking.com — hoy pausado a
 *      proveedores nuevos (D-011); requiere que el programa reabra o una
 *      excepción comercial.
 *   2. `client_id`/`client_secret` de una cuenta de máquina emitida por
 *      Booking.com tras el alta de partner.
 *   3. Un `property_id` real de una propiedad ya vinculada en el Provider
 *      Portal de ese partner.
 *   4. Si se necesita mensajería pre-reserva: activar "Enable Messaging API
 *      RTB" en el Provider Portal para esa propiedad.
 *   5. Ejecutar `BookingMessagingClient` contra
 *      `https://connectivity-authentication.booking.com` /
 *      `https://supply-xml.booking.com` reales (no el simulador) — hoy
 *      SOLO se ha ejecutado contra `BookingMessagingApiSimulator`
 *      (`@atiende-rv/sim`, `packages/sim/test/bookingMensajeriaContrato.test.ts`).
 * ============================================================================
 */

export const HOST_AUTENTICACION_BOOKING_MENSAJERIA = "https://connectivity-authentication.booking.com";
export const HOST_MENSAJERIA_BOOKING = "https://supply-xml.booking.com";
export const ACCEPT_VERSION_MENSAJERIA_BOOKING = "1.3";

/** El JWT documentado expira a la hora; se refresca un poco antes (margen
 * de seguridad ante latencia de red/reloj desincronizado) en vez de esperar
 * al primer 401 real. */
const MARGEN_REFRESCO_TOKEN_MS = 60_000;
const DURACION_TOKEN_MS = 60 * 60_000;

const INTENTOS_BACKOFF_POR_DEFECTO = 3;
const BASE_BACKOFF_MS = 250;

export class ErrorClienteBookingMensajeria extends Error {
  constructor(mensaje: string, readonly status?: number) {
    super(mensaje);
    this.name = "ErrorClienteBookingMensajeria";
  }
}

/** D-019/RV19: nunca se apunta a un host fuera de esta lista salvo el
 * simulador local explícito — a diferencia de `fetchIcsSeguro` (URLs
 * ARBITRARIAS que un tenant conecta, SSRF real), los hosts de Booking.com
 * son constantes fijas elegidas por este código, no input de un tenant; el
 * riesgo aquí es más bajo, pero esta guarda es defensa en profundidad ante
 * una mala configuración (`baseUrl*` inyectable en pruebas) que apunte por
 * error a un host arbitrario. */
export class ErrorHostNoPermitidoBooking extends Error {}

const HOSTS_PERMITIDOS_BOOKING_MENSAJERIA = new Set([
  "connectivity-authentication.booking.com",
  "supply-xml.booking.com",
]);

function validarBaseUrlPermitida(baseUrl: string, permitirHttpLocalDeSimulador: boolean): void {
  const url = new URL(baseUrl);
  if (permitirHttpLocalDeSimulador && (url.hostname === "127.0.0.1" || url.hostname === "localhost")) {
    return;
  }
  if (url.protocol !== "https:" || !HOSTS_PERMITIDOS_BOOKING_MENSAJERIA.has(url.hostname)) {
    throw new ErrorHostNoPermitidoBooking(
      `host "${url.hostname}" (protocolo ${url.protocol}) no está permitido para el cliente de mensajería de ` +
        `Booking.com — solo ${[...HOSTS_PERMITIDOS_BOOKING_MENSAJERIA].join(", ")} sobre https, o un simulador ` +
        `local explícito`,
    );
  }
}

/** Backoff exponencial con jitter, SOLO para llamadas idempotentes (auth,
 * GET, el `PUT .../messages?number_of_messages=N` de confirmación —
 * reintentarlo de más nunca sobre-confirma, solo confirma lo mismo dos
 * veces). Nunca se usa para `enviarMensaje` (ver ese método). */
async function conBackoff<T>(
  intentos: number,
  fn: (intentoIndex: number) => Promise<T>,
): Promise<T> {
  let ultimoError: unknown;
  for (let intento = 0; intento < intentos; intento++) {
    try {
      return await fn(intento);
    } catch (error) {
      ultimoError = error;
      if (intento === intentos - 1) break;
      const espera = BASE_BACKOFF_MS * 2 ** intento * (0.5 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, espera));
    }
  }
  throw ultimoError;
}

export interface CredencialesBookingMensajeria {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface RespuestaTokenBooking {
  readonly jwt: string;
  readonly ruid: string;
}

interface TokenCacheado {
  readonly jwt: string;
  readonly expiraEnMs: number;
}

export interface MensajeEntranteBookingApi {
  readonly message_id: string;
  readonly message_thread_id: string;
  readonly content: string;
  readonly creation_date?: string;
}

export interface OpcionesClienteBookingMensajeria {
  readonly baseUrlAutenticacion?: string;
  readonly baseUrlMensajeria?: string;
  readonly fetchImpl?: typeof fetch;
  /** Solo para pruebas de contrato contra `BookingMessagingApiSimulator`
   * (`@atiende-rv/sim`) — nunca `true` fuera de un entorno de pruebas
   * explícito (D-019, mismo criterio que `permitirHttpSimuladorLocal` de
   * `fetchIcsSeguro`). */
  readonly permitirHttpLocalDeSimulador?: boolean;
  readonly intentosBackoff?: number;
}

/**
 * Cliente delgado contra la spec pública de la Messaging API de
 * Booking.com (ver cabecera del archivo) — mismo nivel de responsabilidad
 * que `ExpediaApiClient` (`../expedia/client.ts`): construye las peticiones
 * exactas documentadas, sin credenciales de partner reales embebidas. Cada
 * método recibe las credenciales explícitamente (nunca las cachea más allá
 * del JWT de sesión) para poder usarse contra distintos tenants/cuentas sin
 * arrastrar estado cruzado.
 */
export class BookingMessagingClient {
  private readonly baseUrlAutenticacion: string;
  private readonly baseUrlMensajeria: string;
  private readonly intentosBackoff: number;
  private tokenCacheado: TokenCacheado | null = null;

  constructor(private readonly opciones: OpcionesClienteBookingMensajeria = {}) {
    this.baseUrlAutenticacion = opciones.baseUrlAutenticacion ?? HOST_AUTENTICACION_BOOKING_MENSAJERIA;
    this.baseUrlMensajeria = opciones.baseUrlMensajeria ?? HOST_MENSAJERIA_BOOKING;
    this.intentosBackoff = opciones.intentosBackoff ?? INTENTOS_BACKOFF_POR_DEFECTO;
    validarBaseUrlPermitida(this.baseUrlAutenticacion, opciones.permitirHttpLocalDeSimulador ?? false);
    validarBaseUrlPermitida(this.baseUrlMensajeria, opciones.permitirHttpLocalDeSimulador ?? false);
  }

  private get fetchFn(): typeof fetch {
    return this.opciones.fetchImpl ?? fetch;
  }

  /** POST .../token-based-authentication/exchange (auth idempotente en el
   * sentido de "pedir de más nunca corrompe estado", así que sí lleva
   * backoff) — cachea el JWT hasta `MARGEN_REFRESCO_TOKEN_MS` antes de que
   * el proveedor documenta que expira. */
  private async obtenerTokenVigente(credenciales: CredencialesBookingMensajeria): Promise<string> {
    const ahora = Date.now();
    if (this.tokenCacheado && this.tokenCacheado.expiraEnMs > ahora) {
      return this.tokenCacheado.jwt;
    }
    const respuesta = await conBackoff(this.intentosBackoff, async () => {
      const resp = await this.fetchFn(`${this.baseUrlAutenticacion}/token-based-authentication/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: credenciales.clientId, client_secret: credenciales.clientSecret }),
      });
      if (!resp.ok) {
        throw new ErrorClienteBookingMensajeria(
          `autenticación de mensajería Booking.com falló: HTTP ${resp.status}`,
          resp.status,
        );
      }
      return (await resp.json()) as RespuestaTokenBooking;
    });
    this.tokenCacheado = { jwt: respuesta.jwt, expiraEnMs: ahora + DURACION_TOKEN_MS - MARGEN_REFRESCO_TOKEN_MS };
    return respuesta.jwt;
  }

  /** Invalida el token cacheado — usado internamente tras un 401 inesperado
   * (reloj desincronizado, revocación externa) para forzar un solo
   * reintento con un token nuevo, nunca un bucle de reintento infinito. */
  private invalidarTokenCacheado(): void {
    this.tokenCacheado = null;
  }

  /**
   * POST /messaging/properties/{propertyId}/conversations/{conversationId}
   * — envía un mensaje YA APROBADO por un humano (el llamador,
   * `BookingMessagingChannelAdapter`, solo invoca esto después de
   * `colaAprobacion.marcarEnviadoTrasAprobacion`, igual que
   * `SimuladorMensajeria`).
   *
   * Deliberadamente SIN backoff automático: Booking.com no documenta esta
   * llamada como idempotente (sin `Idempotency-Key` en la spec pública) —
   * reintentarla automáticamente ante una respuesta ambigua (ej. timeout de
   * red DESPUÉS de que Booking.com ya procesó el mensaje) podría enviar el
   * mismo texto dos veces al huésped. Si falla, se propaga el error tal
   * cual para que la capa de aplicación decida (reintento manual explícito
   * de un humano, no automático) — mismo principio que "nunca inventar que
   * probablemente funcionó" de la cabecera de este archivo. SÍ se reintenta
   * exactamente una vez, sin backoff, cuando el único motivo es un 401 con
   * token expirado (eso es reautenticación, no un reenvío del mensaje).
   */
  async enviarMensaje(
    credenciales: CredencialesBookingMensajeria,
    entrada: { propertyId: string; conversationId: string; contenido: string; attachmentIds?: readonly string[] },
  ): Promise<{ messageId: string; guestHasAccount: boolean }> {
    const intentar = async (token: string) =>
      this.fetchFn(
        `${this.baseUrlMensajeria}/messaging/properties/${encodeURIComponent(entrada.propertyId)}/conversations/${encodeURIComponent(entrada.conversationId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Accept-version": ACCEPT_VERSION_MENSAJERIA_BOOKING,
          },
          body: JSON.stringify({
            message: { content: entrada.contenido, ...(entrada.attachmentIds ? { attachment_ids: entrada.attachmentIds } : {}) },
          }),
        },
      );

    let token = await this.obtenerTokenVigente(credenciales);
    let resp = await intentar(token);
    if (resp.status === 401) {
      this.invalidarTokenCacheado();
      token = await this.obtenerTokenVigente(credenciales);
      resp = await intentar(token);
    }
    if (!resp.ok) {
      throw new ErrorClienteBookingMensajeria(`envío de mensaje a Booking.com falló: HTTP ${resp.status}`, resp.status);
    }
    const cuerpo = (await resp.json()) as { message_id: string; guest_has_account: boolean; ok: boolean };
    return { messageId: cuerpo.message_id, guestHasAccount: cuerpo.guest_has_account };
  }

  /**
   * GET /messaging/messages/latest — pull idempotente (SÍ lleva backoff:
   * pedir de más nunca duplica un envío, solo puede devolver la misma
   * lista dos veces, que el llamador ya debe tratar como reenvío según el
   * contrato documentado del canal). Máximo 100 mensajes por llamada
   * (documentado por Booking.com).
   */
  async obtenerMensajesPendientes(
    credenciales: CredencialesBookingMensajeria,
  ): Promise<{ mensajes: readonly MensajeEntranteBookingApi[]; numeroMensajes: number }> {
    return conBackoff(this.intentosBackoff, async () => {
      const token = await this.obtenerTokenVigente(credenciales);
      const resp = await this.fetchFn(`${this.baseUrlMensajeria}/messaging/messages/latest`, {
        headers: { Authorization: `Bearer ${token}`, "Accept-version": ACCEPT_VERSION_MENSAJERIA_BOOKING },
      });
      if (resp.status === 401) {
        this.invalidarTokenCacheado();
        throw new ErrorClienteBookingMensajeria("token de mensajería Booking.com expirado durante el pull", 401);
      }
      if (!resp.ok) {
        throw new ErrorClienteBookingMensajeria(`pull de mensajes Booking.com falló: HTTP ${resp.status}`, resp.status);
      }
      const cuerpo = (await resp.json()) as { messages: MensajeEntranteBookingApi[]; number_of_messages: number };
      return { mensajes: cuerpo.messages, numeroMensajes: cuerpo.number_of_messages };
    });
  }

  /** PUT /messaging/messages?number_of_messages=N — confirma y desencola;
   * idempotente en el sentido de "confirmar N de más no rompe nada" solo
   * si N nunca excede lo realmente pendiente, por eso el llamador SIEMPRE
   * debe pasar el `numeroMensajes` devuelto por `obtenerMensajesPendientes`
   * de la MISMA llamada, nunca un valor propio (documentado en
   * `CanalMensajeriaEntrante.confirmarRecepcion`). */
  async confirmarMensajesRecibidos(credenciales: CredencialesBookingMensajeria, numeroMensajes: number): Promise<void> {
    await conBackoff(this.intentosBackoff, async () => {
      const token = await this.obtenerTokenVigente(credenciales);
      const resp = await this.fetchFn(
        `${this.baseUrlMensajeria}/messaging/messages?number_of_messages=${numeroMensajes}`,
        { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Accept-version": ACCEPT_VERSION_MENSAJERIA_BOOKING } },
      );
      if (resp.status === 401) {
        this.invalidarTokenCacheado();
        throw new ErrorClienteBookingMensajeria("token de mensajería Booking.com expirado durante la confirmación", 401);
      }
      if (!resp.ok) {
        throw new ErrorClienteBookingMensajeria(`confirmación de mensajes Booking.com falló: HTTP ${resp.status}`, resp.status);
      }
    });
  }
}

export const CAPACIDADES_BOOKING_MENSAJERIA: ChannelCapabilities = {
  availabilityPush: false,
  ratesPush: false,
  reservationsPull: false,
  icalImportExport: false,
  messaging: true,
};

export class MensajeriaBookingFaltaIdentificadorExternoError extends Error {
  constructor() {
    super(
      "BookingMessagingChannelAdapter.enviarMensajeAprobado requiere idExternoPropiedad e idExternoConversacion " +
        "(los identificadores de Booking.com para esta conversación) — nunca se construye una URL con un valor " +
        "adivinado o vacío",
    );
    this.name = "MensajeriaBookingFaltaIdentificadorExternoError";
  }
}

/**
 * Adaptador real de mensajería de Booking.com — implementa AMBAS
 * direcciones (`CanalMensajeria` para enviar, `CanalMensajeriaEntrante`
 * para recibir) contra `BookingMessagingClient`. `obtenerEstadoConexion()`
 * reutiliza `evaluarEstadoConexion` (mismo criterio D-017 que
 * `BookingChannelAdapter`/`ExpediaChannelAdapter`): SIEMPRE
 * `partner_pendiente` hasta que exista evidencia real de partner aprobado,
 * sin importar que el código de este archivo esté completo y probado
 * contra el simulador.
 */
export class BookingMessagingChannelAdapter implements CanalMensajeria, CanalMensajeriaEntrante {
  readonly nombreCanal = "booking" as const;
  readonly capacidades = CAPACIDADES_BOOKING_MENSAJERIA;

  constructor(
    private readonly credenciales: CredencialesBookingMensajeria,
    private readonly evidencia: EvidenciaConexionCanal,
    private readonly cliente: BookingMessagingClient = new BookingMessagingClient(),
  ) {}

  obtenerEstadoConexion(): EstadoConexionCanal {
    return evaluarEstadoConexion(this.evidencia);
  }

  async enviarMensajeAprobado(entrada: EntradaEnviarMensajeAprobado): Promise<ResultadoEnvioMensaje> {
    if (!entrada.idExternoPropiedad || !entrada.idExternoConversacion) {
      throw new MensajeriaBookingFaltaIdentificadorExternoError();
    }
    const resultado = await this.cliente.enviarMensaje(this.credenciales, {
      propertyId: entrada.idExternoPropiedad,
      conversationId: entrada.idExternoConversacion,
      contenido: entrada.texto,
    });
    return { enviadoEn: new Date().toISOString(), idExternoMensaje: resultado.messageId };
  }

  async recibirMensajesPendientes(): Promise<ResultadoRecepcionMensajes> {
    const { mensajes, numeroMensajes } = await this.cliente.obtenerMensajesPendientes(this.credenciales);
    const mapeados: MensajeCanalEntrante[] = mensajes.map((m) => ({
      idExternoMensaje: m.message_id,
      idExternoConversacion: m.message_thread_id,
      texto: m.content,
      recibidoEn: m.creation_date ?? new Date().toISOString(),
    }));
    return { mensajes: mapeados, cantidadParaConfirmar: numeroMensajes };
  }

  async confirmarRecepcion(cantidad: number): Promise<void> {
    await this.cliente.confirmarMensajesRecibidos(this.credenciales, cantidad);
  }
}

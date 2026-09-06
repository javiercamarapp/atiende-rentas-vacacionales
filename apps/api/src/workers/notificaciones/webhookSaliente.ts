import { lookup as dnsLookup } from "node:dns/promises";
import { SsrfError, redactarUrlParaLog, validarTodasLasIps } from "@atiende-rv/adapters";
import {
  encabezadoFirmaWebhook,
  firmarPayloadWebhook,
  serializarPayloadWebhook,
  type PayloadWebhookNotificacion,
} from "@atiende-rv/domain/notificaciones";

/**
 * H-054: entrega de webhooks salientes firmados con HMAC por tenant.
 *
 * SSRF: reutiliza los validadores PUROS ya auditados de
 * `@atiende-rv/adapters` (`validarTodasLasIps`, `SsrfError`,
 * `redactarUrlParaLog` — de `packages/adapters/src/net/ssrf.ts`) en vez de
 * reimplementar la deny-list de IPs. Deliberadamente MÁS simple que
 * `fetchIcsSeguro` (que sí sigue redirecciones validadas, hasta N saltos):
 * un webhook de notificación nunca necesita seguir una redirección — se
 * rechaza cualquier 3xx sin seguirlo (`redirect: "manual"`), que además
 * cierra por completo la clase de ataque "redirección hacia una IP
 * privada" sin necesitar reimplementar el pinning DNS→conexión del
 * fetcher de iCal. Solo `https:` — igual que iCal, nunca credenciales
 * embebidas en la URL.
 */
export interface ResultadoEnvioWebhook {
  entregado: boolean;
  statusHttp: number | null;
  motivoRechazo: string | null;
}

export interface OpcionesEnviarWebhook {
  timeoutMs?: number;
  /** Inyección de resolución DNS para pruebas — mismo patrón que
   * `OpcionesFetchIcs.resolverPersonalizado`. */
  resolverPersonalizado?: (hostname: string) => Promise<string[]> | string[];
  /** Inyección de la función de red para pruebas — nunca se hace una
   * petición HTTP real en la suite de pruebas de este lote. */
  fetchImpl?: typeof fetch;
}

async function validarUrlWebhook(
  urlTexto: string,
  resolverPersonalizado: OpcionesEnviarWebhook["resolverPersonalizado"],
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlTexto);
  } catch {
    throw new SsrfError("esquema_no_permitido", `URL de webhook inválida: ${urlTexto}`);
  }
  if (url.protocol !== "https:") {
    throw new SsrfError("esquema_no_permitido", `Webhook rechazado: solo https:, recibido "${url.protocol}"`);
  }
  if (url.username || url.password) {
    throw new SsrfError("credenciales_en_url", "Webhook rechazado: la URL no puede llevar credenciales embebidas");
  }
  const ips = resolverPersonalizado
    ? await resolverPersonalizado(url.hostname)
    : (await dnsLookup(url.hostname, { all: true })).map((r) => r.address);
  const validacion = validarTodasLasIps(ips);
  if (!validacion.permitida) {
    throw new SsrfError("ip_bloqueada", `Webhook rechazado: ${validacion.motivo} (${redactarUrlParaLog(urlTexto)})`);
  }
  return url;
}

/**
 * Firma y envía UN payload al webhook. Nunca lanza por un error de red o
 * SSRF — los traduce a `ResultadoEnvioWebhook.motivoRechazo` para que el
 * llamador (dispatcher) pueda seguir best-effort sin tumbar la operación
 * que disparó la notificación.
 */
export async function enviarWebhookFirmado(
  url: string,
  secretoHmac: string,
  payload: PayloadWebhookNotificacion,
  opciones: OpcionesEnviarWebhook = {},
): Promise<ResultadoEnvioWebhook> {
  const timeoutMs = opciones.timeoutMs ?? 10_000;
  const fetchReal = opciones.fetchImpl ?? fetch;

  let urlValidada: URL;
  try {
    urlValidada = await validarUrlWebhook(url, opciones.resolverPersonalizado);
  } catch (error) {
    if (error instanceof SsrfError) return { entregado: false, statusHttp: null, motivoRechazo: error.motivo };
    return { entregado: false, statusHttp: null, motivoRechazo: "url_invalida" };
  }

  const serializado = serializarPayloadWebhook(payload);
  const firma = encabezadoFirmaWebhook(firmarPayloadWebhook(secretoHmac, serializado));

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const respuesta = await fetchReal(urlValidada.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-atiende-signature": firma },
      body: serializado,
      redirect: "manual",
      signal: controlador.signal,
    });
    // `redirect: "manual"` hace que fetch devuelva un status 3xx tipo
    // "opaqueredirect" en vez de seguirlo — se trata como no entregado,
    // nunca se sigue automáticamente (evita SSRF vía redirección).
    if (respuesta.type === "opaqueredirect" || (respuesta.status >= 300 && respuesta.status < 400)) {
      return { entregado: false, statusHttp: respuesta.status || null, motivoRechazo: "redireccion_no_seguida" };
    }
    return { entregado: respuesta.ok, statusHttp: respuesta.status, motivoRechazo: respuesta.ok ? null : "status_no_2xx" };
  } catch {
    return { entregado: false, statusHttp: null, motivoRechazo: "error_red_o_timeout" };
  } finally {
    clearTimeout(temporizador);
  }
}

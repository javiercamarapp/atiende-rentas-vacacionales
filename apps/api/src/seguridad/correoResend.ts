import type { CorreoAEnviar, InterfazCorreo } from "./correo.js";

/**
 * Adaptador REAL de correo vía Resend (Lote correo-resend) — llamada HTTP
 * cruda con `fetch` (D-guardia del programa: nada de instalar el SDK
 * oficial de Resend, es convención de este repo para clientes de API
 * simples: ver `packages/domain/src/facturacion/pagos/stripe.ts` para el
 * mismo patrón con Stripe). Nunca se instancia sin `apiKey` ni sin
 * `remitente` — ver `construirAdaptadorCorreo` en `./correo.ts`, que es
 * fail-closed: si `RESEND_API_KEY` está presente pero `RESEND_FROM` no,
 * el arranque falla en vez de enviar con un remitente inventado.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const TIMEOUT_POR_DEFECTO_MS = 10_000;
const ESPERA_REINTENTO_POR_DEFECTO_MS = 1_000;

/** Error tipado de envío por Resend. Nunca incluye la API key — solo el
 * código de estado HTTP (cuando lo hay) y el cuerpo de error que devuelve
 * la propia API de Resend (o un mensaje genérico en fallos de red/timeout). */
export class ErrorCorreoResend extends Error {
  readonly status?: number;

  constructor(mensaje: string, status?: number) {
    super(mensaje);
    this.name = "ErrorCorreoResend";
    this.status = status;
  }
}

export interface ConfiguracionResend {
  apiKey: string;
  /** Remitente exacto a usar en `from`, p. ej.
   * "Atiende <no-responder@useatiende.ai>" — nunca inventado por el
   * adaptador (ver `construirAdaptadorCorreo`, fail-closed sin `RESEND_FROM`). */
  remitente: string;
  /** Inyectable para pruebas (nunca se llama a la red real en pruebas,
   * mismo patrón que `PagosStripe`). */
  fetchImpl?: typeof fetch;
  /** Timeout por intento, en ms. Nunca > 10_000 (contrato del programa). */
  timeoutMs?: number;
}

/** Interpreta `Retry-After` como delta de segundos o como fecha HTTP
 * (RFC 9110 §10.2.3) y lo convierte a milisegundos. `undefined` si la
 * cabecera falta o no se puede interpretar. */
function parsearRetryAfterMs(valor: string | null): number | undefined {
  if (!valor) return undefined;
  const segundos = Number(valor);
  if (Number.isFinite(segundos)) return Math.max(0, segundos * 1000);
  const fechaMs = Date.parse(valor);
  if (!Number.isNaN(fechaMs)) return Math.max(0, fechaMs - Date.now());
  return undefined;
}

export class AdaptadorCorreoResend implements InterfazCorreo {
  private readonly apiKey: string;
  private readonly remitente: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: ConfiguracionResend) {
    if (!config.apiKey) {
      throw new Error("AdaptadorCorreoResend requiere apiKey (RESEND_API_KEY)");
    }
    if (!config.remitente) {
      throw new Error("AdaptadorCorreoResend requiere remitente (RESEND_FROM)");
    }
    if (config.timeoutMs !== undefined && config.timeoutMs > TIMEOUT_POR_DEFECTO_MS) {
      throw new Error(`timeoutMs no puede superar ${TIMEOUT_POR_DEFECTO_MS}ms (contrato del programa)`);
    }
    this.apiKey = config.apiKey;
    this.remitente = config.remitente;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS;
  }

  async enviar(correo: CorreoAEnviar): Promise<void> {
    await this.intentarEnvio(correo, false);
  }

  private async intentarEnvio(correo: CorreoAEnviar, esReintento: boolean): Promise<void> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs);

    let respuesta: Response;
    try {
      respuesta = await this.fetchImpl(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.remitente,
          to: [correo.para],
          subject: correo.asunto,
          text: correo.textoPlano,
          ...(correo.html ? { html: correo.html } : {}),
        }),
        signal: controlador.signal,
      });
    } catch (error) {
      clearTimeout(temporizador);
      if (error instanceof Error && error.name === "AbortError") {
        throw new ErrorCorreoResend(`Resend: tiempo de espera agotado (${this.timeoutMs}ms) al enviar correo`);
      }
      const detalle = error instanceof Error ? error.message : "desconocido";
      throw new ErrorCorreoResend(`Resend: fallo de red al enviar correo (${detalle})`);
    }
    clearTimeout(temporizador);

    if (respuesta.ok) return;

    // Reintento único en 429/5xx, respetando Retry-After si Resend lo
    // manda; para cualquier otro 4xx (401, 422, ...) fallamos de
    // inmediato — no tiene sentido reintentar una clave inválida o un
    // payload rechazado.
    const puedeReintentar = !esReintento && (respuesta.status === 429 || respuesta.status >= 500);
    if (puedeReintentar) {
      const esperaMs = parsearRetryAfterMs(respuesta.headers.get("retry-after")) ?? ESPERA_REINTENTO_POR_DEFECTO_MS;
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
      return this.intentarEnvio(correo, true);
    }

    const cuerpoError = await respuesta.text().catch(() => "");
    // Nunca se incluye this.apiKey en el mensaje de error (podría llegar a
    // logs de aplicación) — solo el status y el cuerpo textual de Resend.
    throw new ErrorCorreoResend(
      `Resend respondió ${respuesta.status} al enviar correo a ${correo.para}: ${cuerpoError.slice(0, 500)}`,
      respuesta.status,
    );
  }
}

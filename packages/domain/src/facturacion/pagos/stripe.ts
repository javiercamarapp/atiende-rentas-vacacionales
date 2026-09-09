import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  AdaptadorPagos,
  ClientePago,
  EventoWebhookPago,
  SesionCheckout,
  SesionPortalCliente,
} from "./interfaz.js";
import { ErrorFirmaWebhookInvalida } from "./interfaz.js";
import { PagosSimulado } from "./simulado.js";

const API_BASE = "https://api.stripe.com/v1";

/** Tolerancia de reloj para la verificación de firma del webhook — mismo
 * valor recomendado en la documentación oficial de Stripe (5 minutos):
 * un webhook con timestamp más viejo que esto se rechaza aunque la firma
 * HMAC sea correcta, para acotar el margen de un ataque de repetición si
 * alguna vez se filtrara un payload firmado capturado. */
const TOLERANCIA_TIMESTAMP_SEGUNDOS = 5 * 60;

function formEncode(datos: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(datos)) {
    if (valor === undefined) continue;
    if (Array.isArray(valor)) {
      for (const v of valor) params.append(clave, v);
    } else {
      params.append(clave, valor);
    }
  }
  return params.toString();
}

/**
 * Adaptador REAL de Stripe — implementado con `fetch` directo contra la
 * API REST de Stripe (sin el SDK oficial `stripe` como dependencia): la
 * API de Stripe es HTTP+form-encoded estable y bien documentada, y evitar
 * el SDK mantiene el árbol de dependencias de `apps/api` más pequeño y
 * este adaptador trivialmente testeable con un `fetch` inyectado/mockeado
 * (nunca una llamada de red real en pruebas — ver `stripe.test.ts`).
 *
 * NUNCA se instancia directamente en código de negocio: usar
 * `construirAdaptadorPagosDesdeEntorno`, que decide entre este adaptador
 * y `PagosSimulado` según la presencia de las dos variables de entorno
 * obligatorias.
 */
export class PagosStripe implements AdaptadorPagos {
  readonly proveedor = "stripe" as const;

  constructor(
    private readonly claveSecreta: string,
    private readonly secretoWebhook: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async llamar<T>(ruta: string, cuerpo?: Record<string, string | string[] | undefined>): Promise<T> {
    const respuesta = await this.fetchImpl(`${API_BASE}${ruta}`, {
      method: cuerpo ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${this.claveSecreta}`,
        ...(cuerpo ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body: cuerpo ? formEncode(cuerpo) : undefined,
    });
    const datos = (await respuesta.json()) as T & { error?: { message?: string } };
    if (!respuesta.ok) {
      throw new Error(`Stripe API error (${respuesta.status}): ${datos.error?.message ?? "sin detalle"}`);
    }
    return datos;
  }

  async crearOReusarCliente(params: { tenantId: string; correo: string; nombre: string }): Promise<ClientePago> {
    const busqueda = await this.llamar<{ data: Array<{ id: string; email: string }> }>(
      `/customers/search?query=${encodeURIComponent(`metadata['tenantId']:'${params.tenantId}'`)}`,
    );
    const existente = busqueda.data[0];
    if (existente) return { id: existente.id, tenantId: params.tenantId, correo: existente.email };

    const creado = await this.llamar<{ id: string; email: string }>("/customers", {
      email: params.correo,
      name: params.nombre,
      "metadata[tenantId]": params.tenantId,
    });
    return { id: creado.id, tenantId: params.tenantId, correo: creado.email };
  }

  async crearSesionCheckout(params: {
    cliente: ClientePago;
    planCodigo: string;
    addOnsActivos: string[];
    urlExito: string;
    urlCancelacion: string;
  }): Promise<SesionCheckout> {
    // Los `price_id` de Stripe (uno por escalón/add-on) se resuelven por
    // configuración externa (variables `STRIPE_PRICE_<CODIGO_PLAN>` /
    // `STRIPE_PRICE_ADDON_<CODIGO>`) en la capa de rutas — este adaptador
    // recibe ya los `priceId` resueltos vía `lineasPrecio` para no acoplar
    // el dominio de pagos al esquema de nombres de esas variables.
    throw new Error(
      "PagosStripe.crearSesionCheckout requiere los priceId de Stripe resueltos — usar " +
        "`crearSesionCheckoutConPrecios` desde la capa de rutas (apps/api/src/routes/facturacion.ts), " +
        "que sí conoce el mapeo planCodigo/addOn -> price_id de Stripe.",
    );
  }

  /** Variante real usada por la ruta HTTP, con los `price_id` de Stripe
   * ya resueltos (uno por línea: el plan base + cada add-on activo). */
  async crearSesionCheckoutConPrecios(params: {
    cliente: ClientePago;
    lineasPrecio: string[];
    urlExito: string;
    urlCancelacion: string;
  }): Promise<SesionCheckout> {
    const sesion = await this.llamar<{ id: string; url: string }>("/checkout/sessions", {
      mode: "subscription",
      customer: params.cliente.id,
      "line_items[0][price]": params.lineasPrecio[0],
      ...Object.fromEntries(
        params.lineasPrecio.slice(1).flatMap((precio, i) => [[`line_items[${i + 1}][price]`, precio]]),
      ),
      ...Object.fromEntries(params.lineasPrecio.map((_, i) => [`line_items[${i}][quantity]`, "1"])),
      success_url: params.urlExito,
      cancel_url: params.urlCancelacion,
    });
    return { id: sesion.id, url: sesion.url };
  }

  async crearSesionPortalCliente(params: { cliente: ClientePago; urlRetorno: string }): Promise<SesionPortalCliente> {
    const sesion = await this.llamar<{ url: string }>("/billing_portal/sessions", {
      customer: params.cliente.id,
      return_url: params.urlRetorno,
    });
    return { url: sesion.url };
  }

  /**
   * Verificación de firma Stripe-Signature (algoritmo documentado por
   * Stripe: HMAC-SHA256 de `"<timestamp>.<cuerpo crudo>"` con el webhook
   * signing secret, comparado con tiempo constante) — implementada a
   * mano con `node:crypto` (sin el SDK) siguiendo exactamente el
   * algoritmo publicado. `timingSafeEqual` evita un ataque de
   * temporización sobre la comparación de firmas.
   */
  verificarYParsearWebhook(params: { cuerpoCrudo: string; firma: string | null }): EventoWebhookPago {
    if (!params.firma) throw new ErrorFirmaWebhookInvalida("Cabecera Stripe-Signature ausente");

    const partes = Object.fromEntries(
      params.firma.split(",").map((par) => {
        const [clave, valor] = par.split("=");
        return [clave, valor];
      }),
    );
    const timestamp = partes.t;
    const firmaV1 = partes.v1;
    if (!timestamp || !firmaV1) {
      throw new ErrorFirmaWebhookInvalida("Cabecera Stripe-Signature con formato inesperado");
    }

    const edadSegundos = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(edadSegundos) || edadSegundos > TOLERANCIA_TIMESTAMP_SEGUNDOS) {
      throw new ErrorFirmaWebhookInvalida("Timestamp del webhook fuera de tolerancia (posible repetición)");
    }

    const payloadFirmado = `${timestamp}.${params.cuerpoCrudo}`;
    const firmaEsperada = createHmac("sha256", this.secretoWebhook).update(payloadFirmado).digest("hex");

    const bufferEsperado = Buffer.from(firmaEsperada, "utf8");
    const bufferRecibido = Buffer.from(firmaV1, "utf8");
    const coincide =
      bufferEsperado.length === bufferRecibido.length && timingSafeEqual(bufferEsperado, bufferRecibido);
    if (!coincide) throw new ErrorFirmaWebhookInvalida("Firma HMAC no coincide");

    const evento = JSON.parse(params.cuerpoCrudo) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
    const objeto = evento.data.object as {
      id?: string;
      customer?: string;
      subscription?: string;
    };

    return {
      tipo: evento.type,
      clienteExternoId: objeto.customer ?? null,
      suscripcionExternaId: objeto.subscription ?? (evento.type.startsWith("customer.subscription") ? objeto.id ?? null : null),
      checkoutSessionId: evento.type === "checkout.session.completed" ? objeto.id : undefined,
      eventoId: evento.id,
    };
  }
}

/**
 * Fábrica única (Lote 3.3): decide entre `PagosStripe` y `PagosSimulado`
 * según la presencia de AMBAS variables de entorno obligatorias — nunca
 * a medias (una sin la otra cae a `PagosSimulado`, fail-safe, nunca un
 * adaptador Stripe con `secretoWebhook` vacío que aceptaría cualquier
 * firma). Sin claves de Stripe en el repo: estas dos variables SIEMPRE
 * vienen de `process.env`, documentadas en docs/despliegue/README.md.
 */
export function tieneCredencialesStripe(env: {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim()) && Boolean(env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function construirPagosStripeDesdeEntorno(env: {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}): PagosStripe | null {
  if (!tieneCredencialesStripe(env)) return null;
  return new PagosStripe(env.STRIPE_SECRET_KEY!.trim(), env.STRIPE_WEBHOOK_SECRET!.trim());
}

/**
 * A3-FACT-03 (docs/auditoria-3/facturacion-onboarding.md) — ALTO,
 * corregido: `PagosSimulado` NO puede seguir siendo el fallback
 * SILENCIOSO en un entorno productivo. Antes, `apps/api/src/app.ts`
 * decidía el proveedor de pagos ÚNICAMENTE en función de si las
 * credenciales de Stripe estaban presentes
 * (`construirPagosStripeDesdeEntorno(...) ?? new PagosSimulado()`), sin
 * mirar nunca `NODE_ENV`/`config.entorno` — a diferencia de
 * `JWT_SECRET`/`CANAL_CIFRADO_CLAVES` (apps/api/src/config/env.ts,
 * S-02/S-03), que sí abortan el arranque en producción si faltan. Un
 * despliegue productivo sin `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`
 * (omisión operativa plausible, sobre todo en un primer despliegue)
 * arrancaba con normalidad usando `PagosSimulado`, cuyo
 * `crearSesionCheckout` ACTIVA la suscripción de inmediato sin cobro
 * real: cualquier tenant obtenía acceso "pagado" real sin que Atiende
 * cobrara nada, sin ninguna alerta visible.
 *
 * Este es el ÚNICO punto donde debe decidirse el adaptador de pagos real
 * (`apps/api/src/app.ts` la llama en vez de construir `PagosStripe`/
 * `PagosSimulado` a mano): si faltan las credenciales de Stripe Y el
 * entorno es productivo, LANZA (fail-closed, nunca degrada en silencio)
 * — mismo criterio que `resolverJwtSecret`/`resolverCifradoCanalClaves`.
 * `PagosSimulado` solo se permite cuando `entornoEsProductivo` es
 * `false` (desarrollo/test explícito — la misma clasificación
 * fail-closed de `apps/api/src/config/env.ts`: cualquier `NODE_ENV`
 * ausente o development/test explícito es "no productivo"; cualquier
 * otro valor, incluido uno desconocido o mal escrito, cuenta como
 * productivo).
 */
export function construirAdaptadorPagosDesdeEntorno(params: {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  entornoEsProductivo: boolean;
}): AdaptadorPagos {
  const stripe = construirPagosStripeDesdeEntorno(params);
  if (stripe) return stripe;
  if (params.entornoEsProductivo) {
    throw new Error(
      "STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET son obligatorios en un entorno productivo " +
        "(fail-closed, A3-FACT-03): sin AMBAS variables, el sistema NUNCA debe degradar en " +
        "silencio a PagosSimulado (que activa suscripciones sin cobro real). Defínelas en la " +
        "configuración del despliegue — ver apps/api/.env.example.",
    );
  }
  return new PagosSimulado();
}

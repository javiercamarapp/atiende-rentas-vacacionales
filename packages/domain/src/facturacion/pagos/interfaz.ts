/**
 * Interfaz de adaptador de pagos (Lote 3.3) — dos implementaciones:
 * `PagosSimulado` (./simulado.ts, siempre disponible, nunca llama a una
 * red externa) y `PagosStripe` (./stripe.ts, real, solo se instancia si
 * `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` están presentes — ver
 * `construirAdaptadorPagosDesdeEntorno` en `./stripe.ts`). Todo el resto
 * del código de negocio (rutas de facturación, cálculo de suscripción)
 * programa contra ESTA interfaz, nunca contra un adaptador concreto —
 * mismo patrón que `AdaptadorCorreo` (apps/api/src/seguridad/correo.ts) y
 * los adaptadores de canal de `packages/adapters`.
 */

export interface ClientePago {
  id: string;
  tenantId: string;
  correo: string;
}

export interface SesionCheckout {
  id: string;
  url: string;
}

export interface SesionPortalCliente {
  url: string;
}

/** Evento de webhook YA verificado (firma válida) y normalizado — el
 * adaptador nunca entrega el payload crudo sin verificar a la capa de
 * negocio. */
export interface EventoWebhookPago {
  tipo: string;
  clienteExternoId: string | null;
  suscripcionExternaId: string | null;
  /** Presente solo en eventos de checkout completado. */
  checkoutSessionId?: string;
  /** `id` opaco del evento en el proveedor — usado para deduplicar
   * reintentos de webhook (idempotencia, ver `apps/api/src/routes/
   * facturacion.ts`). */
  eventoId: string;
}

export class ErrorFirmaWebhookInvalida extends Error {
  constructor(mensaje = "Firma de webhook de pagos inválida") {
    super(mensaje);
    this.name = "ErrorFirmaWebhookInvalida";
  }
}

export interface AdaptadorPagos {
  /** Nombre corto del proveedor — `"simulado"` o `"stripe"`. Usado para
   * que la UI/backoffice NUNCA presente un pago simulado como real
   * (mismo principio D-017/D-019 que los simuladores de canal). */
  readonly proveedor: "simulado" | "stripe";

  crearOReusarCliente(params: { tenantId: string; correo: string; nombre: string }): Promise<ClientePago>;

  /** Crea una sesión de Checkout hospedado para iniciar/cambiar una
   * suscripción. `urlExito`/`urlCancelacion` deben ser absolutas dentro
   * de `WEB_ORIGIN` (nunca un dominio externo). */
  crearSesionCheckout(params: {
    cliente: ClientePago;
    planCodigo: string;
    addOnsActivos: string[];
    urlExito: string;
    urlCancelacion: string;
  }): Promise<SesionCheckout>;

  /** Portal de autoservicio (cambiar método de pago, ver facturas,
   * cancelar) — Stripe Billing Portal real, o una página informativa en
   * `PagosSimulado`. */
  crearSesionPortalCliente(params: { cliente: ClientePago; urlRetorno: string }): Promise<SesionPortalCliente>;

  /** Verifica la firma criptográfica del webhook y devuelve el evento
   * normalizado — lanza `ErrorFirmaWebhookInvalida` si la firma no es
   * válida (la ruta HTTP debe responder 400, NUNCA procesar un payload
   * con firma inválida). */
  verificarYParsearWebhook(params: { cuerpoCrudo: string; firma: string | null }): EventoWebhookPago;
}

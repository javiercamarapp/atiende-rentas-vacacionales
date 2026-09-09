import { randomUUID } from "node:crypto";
import type {
  AdaptadorPagos,
  ClientePago,
  EventoWebhookPago,
  SesionCheckout,
  SesionPortalCliente,
} from "./interfaz.js";

/**
 * `PagosSimulado` — adaptador de pagos ETIQUETADO (nunca se presenta como
 * un pago real; `proveedor === "simulado"` en todo momento, igual que
 * `SimuladorMensajeria`/`ServidorIcalSimulado` para canales — D-017/
 * D-019). Es el adaptador POR DEFECTO cuando `STRIPE_SECRET_KEY`/
 * `STRIPE_WEBHOOK_SECRET` no están configuradas (ver
 * `construirAdaptadorPagosDesdeEntorno` en `./stripe.ts`) — así el
 * onboarding self-serve y las pruebas de límites/medición funcionan de
 * punta a punta SIN depender de una cuenta de Stripe real ni de red.
 *
 * "Checkout" simulado: activa la suscripción INMEDIATAMENTE (sin
 * redirigir a ningún proveedor externo) devolviendo una URL propia que la
 * UI reconoce (`/facturacion/simulado/confirmar?sesion=...`) — nunca una
 * URL de un dominio de pagos real, para que jamás se confunda con un
 * checkout de Stripe verdadero.
 */
export class PagosSimulado implements AdaptadorPagos {
  readonly proveedor = "simulado" as const;

  private readonly clientesPorTenant = new Map<string, ClientePago>();
  private readonly eventosEmitidos: EventoWebhookPago[] = [];

  async crearOReusarCliente(params: { tenantId: string; correo: string; nombre: string }): Promise<ClientePago> {
    const existente = this.clientesPorTenant.get(params.tenantId);
    if (existente) return existente;
    const cliente: ClientePago = { id: `cus_sim_${randomUUID()}`, tenantId: params.tenantId, correo: params.correo };
    this.clientesPorTenant.set(params.tenantId, cliente);
    return cliente;
  }

  async crearSesionCheckout(params: {
    cliente: ClientePago;
    planCodigo: string;
    addOnsActivos: string[];
    urlExito: string;
    urlCancelacion: string;
  }): Promise<SesionCheckout> {
    const id = `cs_sim_${randomUUID()}`;
    // Registra el evento de inmediato (a diferencia de Stripe real, que
    // solo emite el webhook cuando el usuario completa el pago en una
    // página externa) — un "checkout" simulado se considera exitoso al
    // instante, precisamente porque no hay ningún cobro real que esperar.
    this.eventosEmitidos.push({
      tipo: "checkout.session.completed",
      clienteExternoId: params.cliente.id,
      suscripcionExternaId: `sub_sim_${randomUUID()}`,
      checkoutSessionId: id,
      eventoId: `evt_sim_${randomUUID()}`,
      creadoEnEpoch: Math.floor(Date.now() / 1000),
    });
    const url = new URL(params.urlExito);
    url.searchParams.set("sesion", id);
    url.searchParams.set("simulado", "true");
    return { id, url: url.toString() };
  }

  async crearSesionPortalCliente(params: { cliente: ClientePago; urlRetorno: string }): Promise<SesionPortalCliente> {
    const url = new URL(params.urlRetorno);
    url.searchParams.set("portalSimulado", "true");
    return { url: url.toString() };
  }

  verificarYParsearWebhook(): EventoWebhookPago {
    throw new Error(
      "PagosSimulado no expone un webhook HTTP real — los eventos se consultan con " +
        "`eventosPendientes()`/`consumirEventos()` para pruebas de integración, nunca vía firma HTTP.",
    );
  }

  /** Solo para pruebas/onboarding en desarrollo: consume y devuelve los
   * eventos generados por `crearSesionCheckout` desde la última llamada. */
  consumirEventos(): EventoWebhookPago[] {
    return this.eventosEmitidos.splice(0, this.eventosEmitidos.length);
  }
}

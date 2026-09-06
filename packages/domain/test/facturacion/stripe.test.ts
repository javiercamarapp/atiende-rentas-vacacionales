import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ErrorFirmaWebhookInvalida } from "../../src/facturacion/pagos/interfaz.js";
import {
  construirPagosStripeDesdeEntorno,
  PagosStripe,
  tieneCredencialesStripe,
} from "../../src/facturacion/pagos/stripe.js";

const SECRETO_WEBHOOK = "whsec_test_secreto";

function firmarComoStripe(payload: string, timestamp: number, secreto = SECRETO_WEBHOOK): string {
  const firma = createHmac("sha256", secreto).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${firma}`;
}

describe("PagosStripe.verificarYParsearWebhook — firma HMAC (D-009: sin llamadas reales en pruebas)", () => {
  const cuerpo = JSON.stringify({
    id: "evt_123",
    type: "checkout.session.completed",
    data: { object: { id: "cs_123", customer: "cus_123", subscription: "sub_123" } },
  });

  it("acepta un webhook con firma válida y timestamp reciente", () => {
    const stripe = new PagosStripe("sk_test_x", SECRETO_WEBHOOK);
    const firma = firmarComoStripe(cuerpo, Math.floor(Date.now() / 1000));
    const evento = stripe.verificarYParsearWebhook({ cuerpoCrudo: cuerpo, firma });
    expect(evento).toEqual({
      tipo: "checkout.session.completed",
      clienteExternoId: "cus_123",
      suscripcionExternaId: "sub_123",
      checkoutSessionId: "cs_123",
      eventoId: "evt_123",
    });
  });

  it("rechaza una firma calculada con un secreto distinto", () => {
    const stripe = new PagosStripe("sk_test_x", SECRETO_WEBHOOK);
    const firma = firmarComoStripe(cuerpo, Math.floor(Date.now() / 1000), "whsec_otro_secreto");
    expect(() => stripe.verificarYParsearWebhook({ cuerpoCrudo: cuerpo, firma })).toThrow(ErrorFirmaWebhookInvalida);
  });

  it("rechaza un cuerpo modificado después de firmarlo (integridad)", () => {
    const stripe = new PagosStripe("sk_test_x", SECRETO_WEBHOOK);
    const firma = firmarComoStripe(cuerpo, Math.floor(Date.now() / 1000));
    const cuerpoModificado = cuerpo.replace("cus_123", "cus_999");
    expect(() => stripe.verificarYParsearWebhook({ cuerpoCrudo: cuerpoModificado, firma })).toThrow(
      ErrorFirmaWebhookInvalida,
    );
  });

  it("rechaza un timestamp fuera de tolerancia (posible repetición)", () => {
    const stripe = new PagosStripe("sk_test_x", SECRETO_WEBHOOK);
    const timestampViejo = Math.floor(Date.now() / 1000) - 60 * 60; // 1 hora
    const firma = firmarComoStripe(cuerpo, timestampViejo);
    expect(() => stripe.verificarYParsearWebhook({ cuerpoCrudo: cuerpo, firma })).toThrow(ErrorFirmaWebhookInvalida);
  });

  it("rechaza una cabecera ausente o malformada, sin lanzar un error distinto a ErrorFirmaWebhookInvalida", () => {
    const stripe = new PagosStripe("sk_test_x", SECRETO_WEBHOOK);
    expect(() => stripe.verificarYParsearWebhook({ cuerpoCrudo: cuerpo, firma: null })).toThrow(
      ErrorFirmaWebhookInvalida,
    );
    expect(() => stripe.verificarYParsearWebhook({ cuerpoCrudo: cuerpo, firma: "esto-no-es-una-firma" })).toThrow(
      ErrorFirmaWebhookInvalida,
    );
  });
});

describe("PagosStripe — llamadas REST vía fetch inyectado (nunca red real en pruebas)", () => {
  it("crearOReusarCliente reusa un cliente existente si la búsqueda por metadata lo encuentra", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("/customers/search");
      return new Response(JSON.stringify({ data: [{ id: "cus_existente", email: "a@b.com" }] }), { status: 200 });
    });
    const stripe = new PagosStripe("sk_test_x", SECRETO_WEBHOOK, fetchMock as unknown as typeof fetch);
    const cliente = await stripe.crearOReusarCliente({ tenantId: "t1", correo: "a@b.com", nombre: "Gestora A" });
    expect(cliente.id).toBe("cus_existente");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("crearOReusarCliente crea uno nuevo si la búsqueda no encuentra nada", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "cus_nuevo", email: "a@b.com" }), { status: 200 }),
      );
    const stripe = new PagosStripe("sk_test_x", SECRETO_WEBHOOK, fetchMock as unknown as typeof fetch);
    const cliente = await stripe.crearOReusarCliente({ tenantId: "t1", correo: "a@b.com", nombre: "Gestora A" });
    expect(cliente.id).toBe("cus_nuevo");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("propaga el error de Stripe con su mensaje cuando la respuesta no es 2xx", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: "No such customer" } }), { status: 404 }),
    );
    const stripe = new PagosStripe("sk_test_x", SECRETO_WEBHOOK, fetchMock as unknown as typeof fetch);
    await expect(
      stripe.crearSesionPortalCliente({ cliente: { id: "cus_x", tenantId: "t1", correo: "a@b.com" }, urlRetorno: "https://x/y" }),
    ).rejects.toThrow(/No such customer/);
  });
});

describe("construirPagosStripeDesdeEntorno / tieneCredencialesStripe — activación solo con ambas claves", () => {
  it("sin ninguna variable, no hay credenciales y la fábrica devuelve null", () => {
    expect(tieneCredencialesStripe({})).toBe(false);
    expect(construirPagosStripeDesdeEntorno({})).toBeNull();
  });

  it("con solo una de las dos variables, tampoco se activa (nunca a medias)", () => {
    expect(tieneCredencialesStripe({ STRIPE_SECRET_KEY: "sk_live_x" })).toBe(false);
    expect(construirPagosStripeDesdeEntorno({ STRIPE_SECRET_KEY: "sk_live_x" })).toBeNull();
    expect(construirPagosStripeDesdeEntorno({ STRIPE_WEBHOOK_SECRET: "whsec_x" })).toBeNull();
  });

  it("con ambas variables presentes, construye un PagosStripe real", () => {
    const adaptador = construirPagosStripeDesdeEntorno({
      STRIPE_SECRET_KEY: "sk_live_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    });
    expect(adaptador).toBeInstanceOf(PagosStripe);
    expect(adaptador!.proveedor).toBe("stripe");
  });
});

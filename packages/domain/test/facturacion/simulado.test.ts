import { describe, expect, it } from "vitest";
import { PagosSimulado } from "../../src/facturacion/pagos/simulado.js";

describe("PagosSimulado — etiquetado, nunca red real (D-017/D-019)", () => {
  it("proveedor siempre es 'simulado'", () => {
    expect(new PagosSimulado().proveedor).toBe("simulado");
  });

  it("crearOReusarCliente es idempotente por tenantId", async () => {
    const pagos = new PagosSimulado();
    const c1 = await pagos.crearOReusarCliente({ tenantId: "t1", correo: "a@b.com", nombre: "A" });
    const c2 = await pagos.crearOReusarCliente({ tenantId: "t1", correo: "a@b.com", nombre: "A" });
    expect(c1.id).toBe(c2.id);
  });

  it("crearSesionCheckout activa la suscripción de inmediato y emite un evento consumible", async () => {
    const pagos = new PagosSimulado();
    const cliente = await pagos.crearOReusarCliente({ tenantId: "t1", correo: "a@b.com", nombre: "A" });
    const sesion = await pagos.crearSesionCheckout({
      cliente,
      planCodigo: "esencial",
      addOnsActivos: [],
      urlExito: "https://app.example/facturacion/exito",
      urlCancelacion: "https://app.example/facturacion/cancelado",
    });
    expect(sesion.url).toContain("simulado=true");

    const eventos = pagos.consumirEventos();
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.tipo).toBe("checkout.session.completed");
    expect(eventos[0]!.clienteExternoId).toBe(cliente.id);

    // consumirEventos() vacía la cola — una segunda llamada no repite el evento.
    expect(pagos.consumirEventos()).toHaveLength(0);
  });

  it("la URL de checkout/portal simulados nunca apunta a un dominio de pagos real", async () => {
    const pagos = new PagosSimulado();
    const cliente = await pagos.crearOReusarCliente({ tenantId: "t1", correo: "a@b.com", nombre: "A" });
    const sesion = await pagos.crearSesionCheckout({
      cliente,
      planCodigo: "esencial",
      addOnsActivos: [],
      urlExito: "https://app.example/exito",
      urlCancelacion: "https://app.example/cancelado",
    });
    const portal = await pagos.crearSesionPortalCliente({ cliente, urlRetorno: "https://app.example/cuenta" });
    for (const url of [sesion.url, portal.url]) {
      expect(new URL(url).hostname).toBe("app.example");
      expect(url).not.toContain("stripe.com");
    }
  });

  it("verificarYParsearWebhook lanza siempre — PagosSimulado no expone webhook HTTP real", () => {
    const pagos = new PagosSimulado();
    expect(() => pagos.verificarYParsearWebhook()).toThrow();
  });
});

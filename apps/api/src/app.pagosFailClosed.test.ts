import { afterEach, describe, expect, it } from "vitest";
import { crearApp } from "./app.js";

/**
 * A3-FACT-03 (docs/auditoria-3/facturacion-onboarding.md) — ALTO,
 * corregido: `crearApp()` construía el adaptador de pagos con
 * `construirPagosStripeDesdeEntorno(...) ?? new PagosSimulado()`, sin
 * mirar nunca el entorno — un despliegue de PRODUCCIÓN sin
 * `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` arrancaba con normalidad
 * usando `PagosSimulado` (que activa suscripciones sin cobro real), en
 * vez de fallar explícitamente como sí hacen `JWT_SECRET`/
 * `CANAL_CIFRADO_CLAVES` (S-02/S-03).
 *
 * Este archivo prueba el punto de integración real (no solo la función
 * de dominio pura, ver packages/domain/test/facturacion/stripe.test.ts):
 * `crearApp()` — llamada tanto por `apps/api/src/index.ts` (servidor
 * Node.js) como, indirectamente, por `apps/api/api/index.ts` (el
 * wrapper "fail-closed en el borde" de Vercel, que ya captura
 * exactamente este tipo de throw para JWT_SECRET/CANAL_CIFRADO_CLAVES y
 * sirve un 503 honesto en vez de reventar en cada request) — debe
 * lanzar de arranque si el entorno es productivo y faltan las
 * credenciales reales de Stripe.
 */
describe("crearApp() — A3-FACT-03: fail-closed en producción si faltan las credenciales de Stripe", () => {
  const envOriginal = { ...process.env };

  afterEach(() => {
    for (const clave of Object.keys(process.env)) {
      if (!(clave in envOriginal)) delete process.env[clave];
    }
    Object.assign(process.env, envOriginal);
  });

  function fijarSecretosBaseDeProduccion(): void {
    // JWT_SECRET/CANAL_CIFRADO_CLAVES presentes a propósito: este test
    // aísla ÚNICAMENTE el comportamiento de A3-FACT-03 (Stripe), no una
    // repetición de S-02/S-03 (ya cubiertos en apps/api/test/config/
    // env.test.ts).
    process.env.JWT_SECRET = "secreto-de-produccion-real-con-al-menos-32-caracteres";
    process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    delete process.env.DATABASE_URL;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  }

  it("NODE_ENV='production' sin ninguna credencial de Stripe: crearApp() LANZA (fail-closed, nunca PagosSimulado en silencio)", () => {
    fijarSecretosBaseDeProduccion();
    process.env.NODE_ENV = "production";

    expect(() => crearApp()).toThrow(/STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET son obligatorios/);
  });

  it("NODE_ENV con un valor desconocido/mal escrito ('staging'): también cuenta como productivo y crearApp() LANZA igual", () => {
    fijarSecretosBaseDeProduccion();
    process.env.NODE_ENV = "staging";

    expect(() => crearApp()).toThrow(/STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET son obligatorios/);
  });

  it("NODE_ENV='production' con AMBAS credenciales de Stripe presentes: crearApp() NO lanza", () => {
    fijarSecretosBaseDeProduccion();
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_prueba";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_prueba";

    expect(() => crearApp()).not.toThrow();
  });

  it("NODE_ENV='development' (o ausente) sin credenciales de Stripe: crearApp() NO lanza — PagosSimulado sigue permitido fuera de producción", () => {
    fijarSecretosBaseDeProduccion();
    process.env.NODE_ENV = "development";

    expect(() => crearApp()).not.toThrow();

    delete process.env.NODE_ENV;
    expect(() => crearApp()).not.toThrow();
  });
});

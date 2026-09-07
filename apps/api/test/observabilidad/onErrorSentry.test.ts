import { beforeEach, describe, expect, it, vi } from "vitest";

// Verifica que `app.onError` (apps/api/src/app.ts) sigue devolviendo
// EXACTAMENTE la misma respuesta 500 genérica de siempre (bucle B no
// puede cambiar códigos/cuerpos existentes) y que, además, ahora también
// reporta la excepción a Sentry — mockeado por completo, sin red real.
vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

import * as Sentry from "@sentry/node";
import { crearApp } from "../../src/app.js";
import { iniciarSentry } from "../../src/observabilidad/sentry.js";

/**
 * `POST /auth/login` con un cuerpo JSON malformado dispara
 * `c.req.json()` (SyntaxError) ANTES de tocar la base de datos — ni
 * `ErrorDominio` ni `ZodError`, cae directo en la rama de 500 genérico de
 * `app.onError`. Mismo patrón sin pool real que
 * `apps/api/test/observabilidad/rutas.test.ts`.
 */
describe("app.onError — rama de 500 genérico + Sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin SENTRY_DSN: responde 500 igual que siempre y NO llama a Sentry", async () => {
    iniciarSentry({});
    const app = crearApp();

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{esto no es json",
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { codigo: "error_interno", mensaje: "Error interno del servidor" } });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("con SENTRY_DSN: responde EXACTAMENTE la misma respuesta 500 Y llama captureException", async () => {
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1" });
    const app = crearApp();

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{esto no es json",
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { codigo: "error_interno", mensaje: "Error interno del servidor" } });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it("un ErrorDominio esperado (POST /tenants sin token) sigue sin tocar Sentry", async () => {
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1" });
    const app = crearApp();

    // `requiereAutenticacion` (apps/api/src/middleware/autenticacion.ts)
    // lanza ErrorDominio ANTES de tocar la BD si falta el header
    // Authorization — flujo de control esperado, nunca un bug: no debe
    // reportarse a Sentry.
    const res = await app.request("/tenants", { method: "POST" });
    expect(res.status).toBe(401);
    const cuerpo = await res.json();
    expect(cuerpo.error.codigo).toBe("token_invalido");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

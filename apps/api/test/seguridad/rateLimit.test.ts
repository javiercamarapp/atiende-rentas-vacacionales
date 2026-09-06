import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { crearRateLimit, LimitadorVentana } from "../../src/seguridad/rateLimit.js";

/**
 * Regresión permanente S-06 (docs/auditoria-2/seguridad.md): el rate
 * limit ya no confía en `X-Forwarded-For`/`X-Real-IP` a menos que la IP
 * que realmente conectó esté en una allow-list explícita de proxies de
 * confianza. Sin esa allow-list (el default), rotar la cabecera no debe
 * evadir el límite.
 */
function appConRateLimit(maximo: number, proxiesDeConfianza?: readonly string[]) {
  const app = new Hono();
  app.use("*", crearRateLimit({ ventanaMs: 60_000, maximo, proxiesDeConfianza }));
  app.get("/x", (c) => c.json({ ok: true }));
  app.onError((err, c) => {
    const codigo = (err as { codigo?: string }).codigo;
    if (codigo === "rate_limited") return c.json({ error: { codigo } }, 429);
    throw err;
  });
  return app;
}

describe("crearRateLimit — S-06: rotar X-Forwarded-For ya NO evade el límite sin proxy de confianza configurado", () => {
  it("sin proxiesDeConfianza, todas las peticiones (con o sin X-Forwarded-For distinto) comparten la misma clave de socket y el límite SÍ se alcanza", async () => {
    const app = appConRateLimit(3);
    const pedir = (xff: string) => app.request("/x", { headers: { "x-forwarded-for": xff } });

    const r1 = await pedir("203.0.113.10");
    const r2 = await pedir("203.0.113.10");
    const r3 = await pedir("203.0.113.10");
    const r4 = await pedir("203.0.113.10");
    expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200]);
    expect(r4.status).toBe(429);

    // Antes de la corrección, rotar X-Forwarded-For evadía el límite
    // indefinidamente. Ahora, sin un proxy de confianza configurado, la
    // cabecera se ignora por completo — 20 intentos adicionales con una
    // IP FALSIFICADA distinta en cada uno deben seguir todos bloqueados.
    let bloqueadas = 0;
    for (let i = 0; i < 20; i++) {
      const res = await pedir(`198.51.100.${i}`);
      if (res.status === 429) bloqueadas++;
    }
    expect(bloqueadas).toBe(20);
  });

  it("con un proxy de confianza EXPLÍCITAMENTE configurado que coincide con la IP de socket, sí se respeta X-Forwarded-For (comportamiento esperado detrás de un balanceador propio)", async () => {
    // En el harness de pruebas sin socket real, la IP de socket resuelta
    // es siempre la constante de fallback "socket-desconocido" — la
    // declaramos como el "proxy de confianza" para simular el caso en
    // que el balanceador SÍ es quien conectó.
    const app = appConRateLimit(3, ["socket-desconocido"]);
    const pedir = (xff: string) => app.request("/x", { headers: { "x-forwarded-for": xff } });

    // IP A: 3 peticiones permitidas, la 4a bloqueada.
    expect((await pedir("203.0.113.10")).status).toBe(200);
    expect((await pedir("203.0.113.10")).status).toBe(200);
    expect((await pedir("203.0.113.10")).status).toBe(200);
    expect((await pedir("203.0.113.10")).status).toBe(429);

    // IP B (distinta, detrás del mismo proxy de confianza): su propio
    // contador, independiente del de IP A.
    expect((await pedir("203.0.113.99")).status).toBe(200);
  });
});

describe("LimitadorVentana — primitiva reutilizada por el límite adicional de /auth/login por email (S-06)", () => {
  it("permite hasta `maximo` intentos por clave dentro de la ventana y lanza en el siguiente", () => {
    const limitador = new LimitadorVentana({ ventanaMs: 60_000, maximo: 2 });
    expect(() => limitador.registrarIntento("login:a@x.com")).not.toThrow();
    expect(() => limitador.registrarIntento("login:a@x.com")).not.toThrow();
    expect(() => limitador.registrarIntento("login:a@x.com")).toThrow(/Demasiadas solicitudes/);
  });

  it("cada clave tiene su propio contador independiente", () => {
    const limitador = new LimitadorVentana({ ventanaMs: 60_000, maximo: 1 });
    expect(() => limitador.registrarIntento("login:a@x.com")).not.toThrow();
    expect(() => limitador.registrarIntento("login:b@x.com")).not.toThrow();
    expect(() => limitador.registrarIntento("login:a@x.com")).toThrow();
    expect(() => limitador.registrarIntento("login:b@x.com")).toThrow();
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { crearRutasCronWebhooksReintento } from "../../src/rutas/internas/cronWebhooksReintento.js";
import type { ResultadoProcesarReintentosWebhook } from "../../src/workers/notificaciones/webhookReintento.js";

/**
 * `GET /internal/cron/webhooks-retry` (A3-NOTIF-03): mismo criterio de
 * protección que `GET /internal/cron/sync-ical` (`cronSync.test.ts`) —
 * fail-closed sin `CRON_SECRET`, 401 sin/con token incorrecto, 200 con el
 * resultado del lote cuando el token es correcto, 500 explícito (nunca un
 * 200 fingido) si el arranque del lote falla.
 */

const POOL_FALSO = {} as pg.Pool;
const SECRETO_PRUEBA = "cron-secret-de-prueba-1234567890";

beforeEach(() => {
  delete process.env.CRON_SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /internal/cron/webhooks-retry — auth fail-closed", () => {
  it("sin CRON_SECRET configurado responde 503 y NUNCA invoca el procesamiento", async () => {
    let invocado = false;
    const app = crearRutasCronWebhooksReintento({
      pool: POOL_FALSO,
      procesar: async () => {
        invocado = true;
        return { procesadas: [] };
      },
    });

    const res = await app.request("/webhooks-retry", { headers: { authorization: "Bearer lo-que-sea" } });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("servicio_no_configurado");
    expect(invocado).toBe(false);
  });

  it("con CRON_SECRET configurado pero SIN cabecera Authorization responde 401", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronWebhooksReintento({ pool: POOL_FALSO, procesar: async () => ({ procesadas: [] }) });

    const res = await app.request("/webhooks-retry");
    expect(res.status).toBe(401);
  });

  it("con CRON_SECRET configurado y token INCORRECTO responde 401", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    let invocado = false;
    const app = crearRutasCronWebhooksReintento({
      pool: POOL_FALSO,
      procesar: async () => {
        invocado = true;
        return { procesadas: [] };
      },
    });

    const res = await app.request("/webhooks-retry", { headers: { authorization: "Bearer token-incorrecto" } });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("no_autorizado");
    expect(invocado).toBe(false);
  });

  it("con el token CORRECTO ejecuta el procesamiento y responde 200 con el resultado del lote", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const resultadoEsperado: ResultadoProcesarReintentosWebhook = {
      procesadas: [
        { id: "a", resultado: "entregado" },
        { id: "b", resultado: "reintentara" },
      ],
    };
    const app = crearRutasCronWebhooksReintento({ pool: POOL_FALSO, procesar: async () => resultadoEsperado });

    const res = await app.request("/webhooks-retry", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultadoProcesarReintentosWebhook;
    expect(body).toEqual(resultadoEsperado);
  });

  it("si el procesamiento lanza, responde 500 explícito — nunca un 200 fingido", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronWebhooksReintento({
      pool: POOL_FALSO,
      procesar: async () => {
        throw new Error("boom al procesar el lote");
      },
    });

    const res = await app.request("/webhooks-retry", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_webhooks_retry_no_disponible");
  });

  it("sin `procesar` inyectado y sin un pool real, responde 500 explícito (nunca un 200 fingido)", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    // Sin `procesar` inyectado: intenta `deps.pool.connect()` real —
    // POOL_FALSO no tiene ese método, así que lanza antes de tocar nada.
    const app = crearRutasCronWebhooksReintento({ pool: POOL_FALSO });

    const res = await app.request("/webhooks-retry", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
  });
});

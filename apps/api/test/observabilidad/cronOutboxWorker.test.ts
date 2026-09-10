import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { crearRutasCronOutboxWorker } from "../../src/rutas/internas/cronOutboxWorker.js";
import type { ResultadoProcesarLote } from "../../src/workers/observabilidad/outboxWorker.js";

/**
 * `GET /internal/cron/outbox-worker`: mismo criterio de protección que
 * `GET /internal/cron/sync-ical`/`GET /internal/cron/webhooks-retry` —
 * fail-closed sin `CRON_SECRET`, 401 sin/con token incorrecto, 200 con el
 * resultado del lote cuando el token es correcto, 500 explícito (nunca
 * un 200 fingido) si el arranque o el propio lote fallan. `procesar` se
 * inyecta simulado aquí — el motor de replay idempotente en sí ya se
 * prueba contra PGlite en `outboxWorker.test.ts`, y el `aplicarEfecto`
 * real de producción en `efectosOutbox.test.ts`.
 */

const POOL_FALSO = {} as pg.Pool;
const SECRETO_PRUEBA = "cron-secret-de-prueba-outbox-1234567890";

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_SYNC_SUPERADMIN_ID;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_SYNC_SUPERADMIN_ID;
});

describe("GET /internal/cron/outbox-worker — auth fail-closed", () => {
  it("sin CRON_SECRET configurado responde 503 y NUNCA invoca el procesamiento", async () => {
    let invocado = false;
    const app = crearRutasCronOutboxWorker({
      pool: POOL_FALSO,
      procesar: async () => {
        invocado = true;
        return { procesados: [], omitidosYaConsumidos: 0 };
      },
    });

    const res = await app.request("/outbox-worker", { headers: { authorization: "Bearer lo-que-sea" } });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("servicio_no_configurado");
    expect(invocado).toBe(false);
  });

  it("con CRON_SECRET configurado pero SIN cabecera Authorization responde 401", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronOutboxWorker({
      pool: POOL_FALSO,
      procesar: async () => ({ procesados: [], omitidosYaConsumidos: 0 }),
    });

    const res = await app.request("/outbox-worker");
    expect(res.status).toBe(401);
  });

  it("con CRON_SECRET configurado y token INCORRECTO responde 401 sin invocar el procesamiento", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    let invocado = false;
    const app = crearRutasCronOutboxWorker({
      pool: POOL_FALSO,
      procesar: async () => {
        invocado = true;
        return { procesados: [], omitidosYaConsumidos: 0 };
      },
    });

    const res = await app.request("/outbox-worker", { headers: { authorization: "Bearer token-incorrecto" } });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("no_autorizado");
    expect(invocado).toBe(false);
  });

  it("con el token CORRECTO ejecuta el procesamiento y responde 200 con el resultado del lote", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const resultadoEsperado: ResultadoProcesarLote = { procesados: ["a", "b"], omitidosYaConsumidos: 1 };
    const app = crearRutasCronOutboxWorker({ pool: POOL_FALSO, procesar: async () => resultadoEsperado });

    const res = await app.request("/outbox-worker", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultadoProcesarLote;
    expect(body).toEqual(resultadoEsperado);
  });

  it("si el procesamiento lanza, responde 500 explícito — nunca un 200 fingido", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronOutboxWorker({
      pool: POOL_FALSO,
      procesar: async () => {
        throw new Error("boom al procesar el lote de outbox");
      },
    });

    const res = await app.request("/outbox-worker", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_outbox_worker_no_disponible");
  });

  it("sin `procesar` inyectado y sin CRON_SYNC_SUPERADMIN_ID configurado, responde 500 explícito (fail-closed)", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronOutboxWorker({ pool: POOL_FALSO });

    const res = await app.request("/outbox-worker", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_outbox_worker_no_disponible");
  });
});

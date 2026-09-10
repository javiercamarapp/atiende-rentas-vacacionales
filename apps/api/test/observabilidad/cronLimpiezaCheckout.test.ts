import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { crearRutasCronLimpiezaCheckout } from "../../src/rutas/internas/cronLimpiezaCheckout.js";
import type { ResultadoProcesarEventos } from "@atiende-rv/domain";

/**
 * `GET /internal/cron/limpieza-checkout` (disparo automático de H-049):
 * mismo criterio de protección que `GET /internal/cron/sync-ical`
 * (`cronSync.test.ts`) y `GET /internal/cron/webhooks-retry`
 * (`cronWebhooksReintento.test.ts`) — fail-closed sin `CRON_SECRET`,
 * 401 sin/con token incorrecto, 200 con el resultado del lote cuando el
 * token es correcto, 500 explícito (nunca un 200 fingido) si el arranque
 * de la sesión o el propio lote fallan. Aquí `procesar` se inyecta
 * simulado — la sesión RLS real (superadmin + delegación de servicio) se
 * prueba contra Postgres real en
 * `test/integration/cronLimpiezaCheckoutRls.test.ts`, y el consumidor de
 * checkout en sí ya se prueba en `packages/domain` y
 * `test/integration/limpieza.test.ts`.
 */

const POOL_FALSO = {} as pg.Pool;
const SECRETO_PRUEBA = "cron-secret-de-prueba-limpieza-1234567890";

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_SYNC_SUPERADMIN_ID;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_SYNC_SUPERADMIN_ID;
});

function resultadoDePrueba(overrides: Partial<ResultadoProcesarEventos> = {}): ResultadoProcesarEventos {
  return {
    procesados: 0,
    tareasCreadas: [],
    tareasReprogramadas: [],
    tareasCanceladas: [],
    ...overrides,
  };
}

describe("GET /internal/cron/limpieza-checkout — auth fail-closed", () => {
  it("sin CRON_SECRET configurado responde 503 y NUNCA invoca el procesamiento", async () => {
    let invocado = false;
    const app = crearRutasCronLimpiezaCheckout({
      pool: POOL_FALSO,
      procesar: async () => {
        invocado = true;
        return resultadoDePrueba();
      },
    });

    const res = await app.request("/limpieza-checkout", { headers: { authorization: "Bearer lo-que-sea" } });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("servicio_no_configurado");
    expect(invocado).toBe(false);
  });

  it("con CRON_SECRET configurado pero SIN cabecera Authorization responde 401", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronLimpiezaCheckout({ pool: POOL_FALSO, procesar: async () => resultadoDePrueba() });

    const res = await app.request("/limpieza-checkout");
    expect(res.status).toBe(401);
  });

  it("con CRON_SECRET configurado y token INCORRECTO responde 401 sin invocar el procesamiento", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    let invocado = false;
    const app = crearRutasCronLimpiezaCheckout({
      pool: POOL_FALSO,
      procesar: async () => {
        invocado = true;
        return resultadoDePrueba();
      },
    });

    const res = await app.request("/limpieza-checkout", { headers: { authorization: "Bearer token-incorrecto" } });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("no_autorizado");
    expect(invocado).toBe(false);
  });

  it("con el token CORRECTO ejecuta el procesamiento y responde 200 con el resultado del lote", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const resultadoEsperado = resultadoDePrueba({
      procesados: 2,
      tareasCreadas: ["tarea-1"],
      tareasCanceladas: ["tarea-2"],
    });
    const app = crearRutasCronLimpiezaCheckout({ pool: POOL_FALSO, procesar: async () => resultadoEsperado });

    const res = await app.request("/limpieza-checkout", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultadoProcesarEventos;
    expect(body).toEqual(resultadoEsperado);
  });

  it("si el procesamiento lanza, responde 500 explícito — nunca un 200 fingido", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronLimpiezaCheckout({
      pool: POOL_FALSO,
      procesar: async () => {
        throw new Error("boom al procesar el lote de checkout");
      },
    });

    const res = await app.request("/limpieza-checkout", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_limpieza_checkout_no_disponible");
  });

  it("sin `procesar` inyectado y sin CRON_SYNC_SUPERADMIN_ID configurado, responde 500 explícito (fail-closed)", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    // Sin `procesar` inyectado: intenta abrir la sesión real, que exige
    // CRON_SYNC_SUPERADMIN_ID — sin esa variable, lanza ANTES de tocar
    // `deps.pool` (POOL_FALSO ni siquiera necesita `.connect()`).
    const app = crearRutasCronLimpiezaCheckout({ pool: POOL_FALSO });

    const res = await app.request("/limpieza-checkout", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_limpieza_checkout_no_disponible");
  });
});

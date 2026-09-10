import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { crearRutasCronRecordatorioCheckin } from "../../src/rutas/internas/cronRecordatorioCheckin.js";
import type { ResultadoRecordatorioCheckin } from "../../src/workers/notificacionesHuesped/recordatorioCheckin.js";

/**
 * `GET /internal/cron/recordatorio-checkin` — mismo criterio de
 * protección que `GET /internal/cron/webhooks-retry`
 * (`cronWebhooksReintento.test.ts`): fail-closed sin `CRON_SECRET`, 401
 * sin/con token incorrecto, 200 con el resultado del lote cuando el token
 * es correcto, 500 explícito (nunca un 200 fingido) si el arranque falla.
 */

const POOL_FALSO = {} as pg.Pool;
const SECRETO_PRUEBA = "cron-secret-de-prueba-1234567890";

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_RECORDATORIO_CHECKIN_SUPERADMIN_ID;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_RECORDATORIO_CHECKIN_SUPERADMIN_ID;
});

const RESULTADO_VACIO: ResultadoRecordatorioCheckin = { candidatos: 0, enviados: 0, omitidosSinCorreo: 0, errores: 0 };

describe("GET /internal/cron/recordatorio-checkin — auth fail-closed", () => {
  it("sin CRON_SECRET configurado responde 503 y NUNCA invoca el procesamiento", async () => {
    let invocado = false;
    const app = crearRutasCronRecordatorioCheckin({
      pool: POOL_FALSO,
      procesar: async () => {
        invocado = true;
        return RESULTADO_VACIO;
      },
    });

    const res = await app.request("/recordatorio-checkin", { headers: { authorization: "Bearer lo-que-sea" } });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("servicio_no_configurado");
    expect(invocado).toBe(false);
  });

  it("con CRON_SECRET configurado pero SIN cabecera Authorization responde 401", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronRecordatorioCheckin({ pool: POOL_FALSO, procesar: async () => RESULTADO_VACIO });

    const res = await app.request("/recordatorio-checkin");
    expect(res.status).toBe(401);
  });

  it("con CRON_SECRET configurado y token INCORRECTO responde 401", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    let invocado = false;
    const app = crearRutasCronRecordatorioCheckin({
      pool: POOL_FALSO,
      procesar: async () => {
        invocado = true;
        return RESULTADO_VACIO;
      },
    });

    const res = await app.request("/recordatorio-checkin", { headers: { authorization: "Bearer token-incorrecto" } });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("no_autorizado");
    expect(invocado).toBe(false);
  });

  it("con el token CORRECTO ejecuta el procesamiento y responde 200 con el resultado del lote", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const resultadoEsperado: ResultadoRecordatorioCheckin = { candidatos: 3, enviados: 2, omitidosSinCorreo: 1, errores: 0 };
    const app = crearRutasCronRecordatorioCheckin({ pool: POOL_FALSO, procesar: async () => resultadoEsperado });

    const res = await app.request("/recordatorio-checkin", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { procesados: ResultadoRecordatorioCheckin };
    expect(body.procesados).toEqual(resultadoEsperado);
  });

  it("si el procesamiento lanza, responde 500 explícito — nunca un 200 fingido", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronRecordatorioCheckin({
      pool: POOL_FALSO,
      procesar: async () => {
        throw new Error("boom al procesar el lote");
      },
    });

    const res = await app.request("/recordatorio-checkin", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_recordatorio_checkin_no_disponible");
  });

  it("sin `procesar` inyectado y SIN CRON_RECORDATORIO_CHECKIN_SUPERADMIN_ID, responde 500 explícito (nunca un 200 fingido)", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    // Sin `procesar` inyectado y sin la variable de superadmin: falla ANTES
    // de tocar el pool (fail-closed), igual que CRON_SYNC_SUPERADMIN_ID.
    const app = crearRutasCronRecordatorioCheckin({ pool: POOL_FALSO });

    const res = await app.request("/recordatorio-checkin", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { crearRutasCronLiberacionInstruccionesAcceso } from "../../src/rutas/internas/cronLiberacionInstruccionesAcceso.js";
import type { ResultadoLiberacionInstruccionesAcceso } from "../../src/workers/notificacionesHuesped/liberacionInstruccionesAcceso.js";

/**
 * `GET /internal/cron/liberacion-instrucciones-acceso` — mismo criterio de
 * protección que `GET /internal/cron/recordatorio-checkin`
 * (`cronRecordatorioCheckin.test.ts`): fail-closed sin `CRON_SECRET`, 401
 * sin/con token incorrecto, 200 con el resultado del lote cuando el token
 * es correcto, 500 explícito (nunca un 200 fingido) si el arranque falla.
 */

const POOL_FALSO = {} as pg.Pool;
const SECRETO_PRUEBA = "cron-secret-de-prueba-liberacion-acceso-1234567890";

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_LIBERACION_INSTRUCCIONES_ACCESO_SUPERADMIN_ID;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_LIBERACION_INSTRUCCIONES_ACCESO_SUPERADMIN_ID;
});

const RESULTADO_VACIO: ResultadoLiberacionInstruccionesAcceso = { candidatos: 0, eventosGenerados: 0, errores: 0 };

describe("GET /internal/cron/liberacion-instrucciones-acceso — auth fail-closed", () => {
  it("sin CRON_SECRET configurado responde 503 y NUNCA invoca el procesamiento", async () => {
    let invocado = false;
    const app = crearRutasCronLiberacionInstruccionesAcceso({
      pool: POOL_FALSO,
      procesar: async () => {
        invocado = true;
        return RESULTADO_VACIO;
      },
    });

    const res = await app.request("/liberacion-instrucciones-acceso", {
      headers: { authorization: "Bearer lo-que-sea" },
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("servicio_no_configurado");
    expect(invocado).toBe(false);
  });

  it("con CRON_SECRET configurado pero SIN cabecera Authorization responde 401", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronLiberacionInstruccionesAcceso({ pool: POOL_FALSO, procesar: async () => RESULTADO_VACIO });

    const res = await app.request("/liberacion-instrucciones-acceso");
    expect(res.status).toBe(401);
  });

  it("con CRON_SECRET configurado y token INCORRECTO responde 401", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    let invocado = false;
    const app = crearRutasCronLiberacionInstruccionesAcceso({
      pool: POOL_FALSO,
      procesar: async () => {
        invocado = true;
        return RESULTADO_VACIO;
      },
    });

    const res = await app.request("/liberacion-instrucciones-acceso", {
      headers: { authorization: "Bearer token-incorrecto" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("no_autorizado");
    expect(invocado).toBe(false);
  });

  it("con el token CORRECTO ejecuta el procesamiento y responde 200 con el resultado del lote", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const resultadoEsperado: ResultadoLiberacionInstruccionesAcceso = { candidatos: 3, eventosGenerados: 2, errores: 1 };
    const app = crearRutasCronLiberacionInstruccionesAcceso({ pool: POOL_FALSO, procesar: async () => resultadoEsperado });

    const res = await app.request("/liberacion-instrucciones-acceso", {
      headers: { authorization: `Bearer ${SECRETO_PRUEBA}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { procesados: ResultadoLiberacionInstruccionesAcceso };
    expect(body.procesados).toEqual(resultadoEsperado);
  });

  it("si el procesamiento lanza, responde 500 explícito — nunca un 200 fingido", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const app = crearRutasCronLiberacionInstruccionesAcceso({
      pool: POOL_FALSO,
      procesar: async () => {
        throw new Error("boom al procesar el lote");
      },
    });

    const res = await app.request("/liberacion-instrucciones-acceso", {
      headers: { authorization: `Bearer ${SECRETO_PRUEBA}` },
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_liberacion_instrucciones_acceso_no_disponible");
  });

  it("sin `procesar` inyectado y SIN CRON_LIBERACION_INSTRUCCIONES_ACCESO_SUPERADMIN_ID, responde 500 explícito (nunca un 200 fingido)", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    // Sin `procesar` inyectado y sin la variable de superadmin: falla ANTES
    // de tocar el pool (fail-closed), igual que CRON_RECORDATORIO_CHECKIN_SUPERADMIN_ID.
    const app = crearRutasCronLiberacionInstruccionesAcceso({ pool: POOL_FALSO });

    const res = await app.request("/liberacion-instrucciones-acceso", {
      headers: { authorization: `Bearer ${SECRETO_PRUEBA}` },
    });
    expect(res.status).toBe(500);
  });
});

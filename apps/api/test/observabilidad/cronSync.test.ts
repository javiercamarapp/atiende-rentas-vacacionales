import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import type { EjecutorTransaccional } from "@atiende-rv/domain";
import {
  crearRutasCronSyncIcal,
  ejecutarCronSyncIcal,
  PRESUPUESTO_MS_DEFECTO,
  type FeedIcalActivo,
  type ProveedorSesionCron,
  type ResultadoEjecutarCiclo,
} from "../../src/rutas/internas/cronSync.js";
import { RegistroMetricas } from "../../src/workers/observabilidad/metricas.js";

/**
 * `GET /internal/cron/sync-ical` (paquete cron-sync): endpoint protegido
 * por `CRON_SECRET` que dispara el motor de sync iCal para todos los
 * canales activos. Estas pruebas cubren:
 *   - fail-closed sin `CRON_SECRET` (503, nunca abre sesión).
 *   - 401 con token ausente/incorrecto.
 *   - el camino feliz (200 con conteos) usando un `proveedorSesion` y un
 *     `ejecutarCiclo` SIMULADOS (inyectados vía `DependenciasCronSyncIcal`,
 *     mismo estilo de inyección que `procesarPendientesOutbox` en
 *     `outboxWorker.test.ts`) — sin base de datos real.
 *   - aislamiento de errores por canal (uno falla, los demás se procesan).
 *   - el tope de tiempo total (reloj inyectado).
 *   - `ejecutarCronSyncIcal` (la orquestación pura) cierra SIEMPRE la
 *     sesión, incluso si listar los canales lanza.
 *
 * El flujo real contra Postgres (RLS + auto-concesión "romper cristal")
 * se cubre en `test/integration/cronSyncRls.test.ts`.
 */

const POOL_FALSO = {} as pg.Pool;
const EJECUTOR_FALSO = {} as EjecutorTransaccional;

function feedFake(id: string): FeedIcalActivo {
  return {
    feedId: id,
    unidadId: `unidad-${id}`,
    canalId: `canal-${id}`,
    canalCodigo: "airbnb",
    tenantId: `tenant-${id}`,
    urlImport: `https://example.test/${id}.ics`,
    zonaHorariaPropiedad: "America/Cancun",
    ultimaSincronizacionExitosaEn: null,
  };
}

interface ProveedorFakeConEstado {
  proveedor: ProveedorSesionCron;
  aperturas: number;
  cerrado: boolean;
  listarLanza?: Error;
}

function crearProveedorFake(feeds: FeedIcalActivo[], opciones: { listarLanza?: Error } = {}): ProveedorFakeConEstado {
  const estado: ProveedorFakeConEstado = { proveedor: null as unknown as ProveedorSesionCron, aperturas: 0, cerrado: false };
  estado.proveedor = {
    async abrir() {
      estado.aperturas++;
      return {
        ejecutor: EJECUTOR_FALSO,
        async listarFeedsActivos() {
          if (opciones.listarLanza) throw opciones.listarLanza;
          return feeds;
        },
        async cerrar() {
          estado.cerrado = true;
        },
      };
    },
  };
  return estado;
}

const SECRETO_PRUEBA = "cron-secret-de-prueba-1234567890";

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_SYNC_SUPERADMIN_ID;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_SYNC_SUPERADMIN_ID;
});

describe("GET /internal/cron/sync-ical — auth fail-closed", () => {
  it("sin CRON_SECRET configurado responde 503 y NUNCA abre una sesión de trabajo", async () => {
    const fake = crearProveedorFake([feedFake("f1")]);
    const app = crearRutasCronSyncIcal({
      pool: POOL_FALSO,
      metricas: new RegistroMetricas(),
      proveedorSesion: fake.proveedor,
    });

    const res = await app.request("/sync-ical", { headers: { authorization: "Bearer lo-que-sea" } });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("servicio_no_configurado");
    expect(fake.aperturas).toBe(0);
  });

  it("con CRON_SECRET configurado pero SIN cabecera Authorization responde 401", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const fake = crearProveedorFake([feedFake("f1")]);
    const app = crearRutasCronSyncIcal({ pool: POOL_FALSO, metricas: new RegistroMetricas(), proveedorSesion: fake.proveedor });

    const res = await app.request("/sync-ical");
    expect(res.status).toBe(401);
    expect(fake.aperturas).toBe(0);
  });

  it("con CRON_SECRET configurado y token INCORRECTO responde 401", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const fake = crearProveedorFake([feedFake("f1")]);
    const app = crearRutasCronSyncIcal({ pool: POOL_FALSO, metricas: new RegistroMetricas(), proveedorSesion: fake.proveedor });

    const res = await app.request("/sync-ical", { headers: { authorization: "Bearer token-incorrecto" } });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("no_autorizado");
    expect(fake.aperturas).toBe(0);
  });

  it("token de longitud distinta al secreto configurado también responde 401 (sin lanzar)", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const fake = crearProveedorFake([feedFake("f1")]);
    const app = crearRutasCronSyncIcal({ pool: POOL_FALSO, metricas: new RegistroMetricas(), proveedorSesion: fake.proveedor });

    const res = await app.request("/sync-ical", { headers: { authorization: "Bearer x" } });
    expect(res.status).toBe(401);
  });

  it("con el token CORRECTO ejecuta el lote y responde 200", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const fake = crearProveedorFake([feedFake("f1")]);
    const app = crearRutasCronSyncIcal({
      pool: POOL_FALSO,
      metricas: new RegistroMetricas(),
      proveedorSesion: fake.proveedor,
      ejecutarCiclo: async () => ({ resultado: "exito_vacio" }),
    });

    const res = await app.request("/sync-ical", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(200);
    expect(fake.aperturas).toBe(1);
    expect(fake.cerrado).toBe(true);
  });
});

describe("GET /internal/cron/sync-ical — camino feliz y conteos", () => {
  it("procesa todos los canales simulados y devuelve {procesados, errores, pendientes} correctos", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const feeds = [feedFake("f1"), feedFake("f2"), feedFake("f3")];
    const fake = crearProveedorFake(feeds);
    const invocados: string[] = [];

    const app = crearRutasCronSyncIcal({
      pool: POOL_FALSO,
      metricas: new RegistroMetricas(),
      proveedorSesion: fake.proveedor,
      ejecutarCiclo: async (feed) => {
        invocados.push(feed.feedId);
        return { resultado: "exito_con_eventos" };
      },
    });

    const res = await app.request("/sync-ical", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      procesados: number;
      errores: number;
      pendientes: number;
      detalles: { feedId: string; resultado?: string; error?: string }[];
    };
    expect(body.procesados).toBe(3);
    expect(body.errores).toBe(0);
    expect(body.pendientes).toBe(0);
    expect(invocados).toEqual(["f1", "f2", "f3"]);
    expect(body.detalles).toHaveLength(3);
    expect(body.detalles.every((d) => d.resultado === "exito_con_eventos")).toBe(true);
    expect(fake.cerrado).toBe(true);
  });

  it("un canal que falla NO impide que los demás se procesen (aislamiento por canal)", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const feeds = [feedFake("f1"), feedFake("f2"), feedFake("f3")];
    const fake = crearProveedorFake(feeds);

    const app = crearRutasCronSyncIcal({
      pool: POOL_FALSO,
      metricas: new RegistroMetricas(),
      proveedorSesion: fake.proveedor,
      ejecutarCiclo: async (feed) => {
        if (feed.feedId === "f2") throw new Error("fallo de red simulado en f2");
        return { resultado: "exito_vacio" };
      },
    });

    const res = await app.request("/sync-ical", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      procesados: number;
      errores: number;
      pendientes: number;
      detalles: { feedId: string; resultado?: string; error?: string }[];
    };
    expect(body.procesados).toBe(2);
    expect(body.errores).toBe(1);
    expect(body.pendientes).toBe(0);

    const detalleF1 = body.detalles.find((d) => d.feedId === "f1")!;
    const detalleF2 = body.detalles.find((d) => d.feedId === "f2")!;
    const detalleF3 = body.detalles.find((d) => d.feedId === "f3")!;
    expect(detalleF1.resultado).toBe("exito_vacio");
    expect(detalleF3.resultado).toBe("exito_vacio");
    expect(detalleF2.error).toContain("fallo de red simulado en f2");
    expect(detalleF2.resultado).toBeUndefined();
  });

  it("respeta el tope de tiempo total: los canales restantes quedan en 'pendientes', nunca se abandona el lote a medias con un error", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    const feeds = [feedFake("f1"), feedFake("f2"), feedFake("f3")];
    const fake = crearProveedorFake(feeds);

    // Reloj falso: cada llamada avanza 15ms; con presupuestoMs=20, la
    // primera comprobación (15ms transcurridos) deja pasar el primer
    // canal, la segunda (30ms transcurridos) corta el lote.
    let tiempoActual = 0;
    const ahoraMs = () => {
      const valor = tiempoActual;
      tiempoActual += 15;
      return valor;
    };

    const app = crearRutasCronSyncIcal({
      pool: POOL_FALSO,
      metricas: new RegistroMetricas(),
      proveedorSesion: fake.proveedor,
      presupuestoMs: 20,
      ahoraMs,
      ejecutarCiclo: async () => ({ resultado: "exito_vacio" }),
    });

    const res = await app.request("/sync-ical", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { procesados: number; errores: number; pendientes: number };
    expect(body.procesados).toBe(1);
    expect(body.errores).toBe(0);
    expect(body.pendientes).toBe(2);
    expect(fake.cerrado).toBe(true); // la sesión se cierra igual, aunque el lote se corte por tiempo.
  });

  it("si CRON_SYNC_SUPERADMIN_ID/la apertura de sesión falla (proveedor real no inyectado), responde 500 explícito — nunca un 200 fingido", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    // Sin `proveedorSesion` inyectado: usa `crearProveedorSesionPostgres`
    // real, que lanza de inmediato porque CRON_SYNC_SUPERADMIN_ID no está
    // configurado (fail-closed explícito, ver cronSync.ts).
    const app = crearRutasCronSyncIcal({ pool: POOL_FALSO, metricas: new RegistroMetricas() });

    const res = await app.request("/sync-ical", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_sync_no_disponible");
  });
});

describe("ejecutarCronSyncIcal — orquestación pura", () => {
  it("cierra la sesión incluso si listarFeedsActivos lanza", async () => {
    const fake = crearProveedorFake([], { listarLanza: new Error("boom al listar") });

    await expect(
      ejecutarCronSyncIcal({
        proveedorSesion: fake.proveedor,
        ejecutarCiclo: async () => ({ resultado: "exito_vacio" }) as ResultadoEjecutarCiclo,
      }),
    ).rejects.toThrow("boom al listar");

    expect(fake.cerrado).toBe(true);
  });

  it("con una lista vacía de canales, devuelve conteos en cero sin invocar ejecutarCiclo", async () => {
    const fake = crearProveedorFake([]);
    let invocado = false;

    const resultado = await ejecutarCronSyncIcal({
      proveedorSesion: fake.proveedor,
      ejecutarCiclo: async () => {
        invocado = true;
        return { resultado: "exito_vacio" };
      },
    });

    expect(resultado).toEqual({ procesados: 0, errores: 0, pendientes: 0, detalles: [] });
    expect(invocado).toBe(false);
    expect(fake.cerrado).toBe(true);
  });

  it("usa PRESUPUESTO_MS_DEFECTO (~22s) cuando no se pasa presupuestoMs — deja margen bajo el maxDuration de 30s de vercel.json", () => {
    expect(PRESUPUESTO_MS_DEFECTO).toBeLessThan(25_000);
    expect(PRESUPUESTO_MS_DEFECTO).toBeGreaterThan(0);
  });
});

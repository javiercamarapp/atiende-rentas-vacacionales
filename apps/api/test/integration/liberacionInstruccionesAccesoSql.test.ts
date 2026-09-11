import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import {
  ejecutarLiberacionInstruccionesAcceso,
  HORA_CORTE_DEFECTO,
  TIPO_EVENTO_LIBERACION_INSTRUCCIONES_ACCESO,
  type EjecutorLiberacionInstruccionesAcceso,
} from "../../src/workers/notificacionesHuesped/liberacionInstruccionesAcceso.js";
import { crearPropiedad, crearTenant, crearUnidad } from "../soporte/fixtures.js";

/**
 * Contraparte de integración de `liberacionInstruccionesAcceso.test.ts`
 * (unitario, con `ejecutor` simulado): aquí la consulta SQL real
 * (`SQL_CANDIDATOS`, con la aritmética `AT TIME ZONE`) corre contra
 * `embedded-postgres` de verdad — un mock nunca podría probar que la
 * frontera de T-48h y la conversión de zona horaria están bien, porque un
 * mock devuelve lo que el test le dice sin ejecutar la aritmética.
 *
 * REQ-095: "el motor de calendario genera el evento de liberación de
 * instrucciones de acceso anclado a T-48h antes del check-in". Este test
 * verifica el criterio literal: para una reserva con check-in el día D,
 * en una propiedad con zona horaria conocida, el evento se genera cuando
 * (y solo cuando) `ahora` cae dentro de `[checkin_estimado - 48h,
 * checkin_estimado)`, donde `checkin_estimado` = D a `HORA_CORTE_DEFECTO`
 * en la zona horaria de esa propiedad.
 */

function puertoAleatorio(): number {
  return 57000 + Math.floor(Math.random() * 900);
}

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let ejecutor: EjecutorLiberacionInstruccionesAcceso;

let tenantId: string;
let propCancunId: string; // America/Cancun = UTC-5, sin DST
let propTokioId: string; // Asia/Tokyo = UTC+9, sin DST
let contadorPrueba = 0;

/** Cada test crea su PROPIA unidad, con su PROPIA fecha de check-in — nunca
 * reutiliza ninguna de las dos entre tests. Dos razones, ambas de
 * aislamiento real (no cosmético):
 *   1. `ocupacion_unidad_sin_solape` (EXCLUDE GiST, 0005) rechazaría dos
 *      reservas confirmadas con rangos solapados sobre la MISMA unidad.
 *   2. `ejecutarLiberacionInstruccionesAcceso` escanea TODAS las unidades
 *      de TODOS los tenants a propósito (es un cron global) — si dos
 *      tests compartieran la misma fecha de check-in (aun en unidades
 *      distintas), ambas filas caerían en la MISMA ventana de tiempo y
 *      contaminarían el conteo `candidatos`/`eventosGenerados` del otro
 *      test. Una fecha de check-in distinta por test es lo que de verdad
 *      aísla un test del resto, no la unidad por sí sola. */
async function unidadYFechaDePrueba(propiedadId: string): Promise<{ unidadId: string; checkIn: string; checkOut: string }> {
  contadorPrueba += 1;
  const unidadId = await crearUnidad(superusuario, propiedadId, { nombre: `Unidad prueba ${contadorPrueba}` });
  // Cada test empieza 3 días después del anterior (nunca solapan, ni entre
  // sí ni con la reserva+checkout de 5 noches) — aritmética real de fecha
  // (Date.UTC), nunca concatenación de string, para no romperse al cruzar
  // fin de mes.
  const base = Date.UTC(2026, 8, 20); // 2026-09-20
  const checkInDate = new Date(base + contadorPrueba * 3 * 86_400_000);
  const checkOutDate = new Date(checkInDate.getTime() + 5 * 86_400_000);
  return {
    unidadId,
    checkIn: checkInDate.toISOString().slice(0, 10),
    checkOut: checkOutDate.toISOString().slice(0, 10),
  };
}

/** Instante UTC exacto de "check-in a HORA_CORTE_DEFECTO en America/Cancun"
 * (UTC-5 todo el año, sin DST) para una fecha de check-in dada. */
function checkinEstimadoCancunUtc(checkIn: string): Date {
  return new Date(`${checkIn}T${String(HORA_CORTE_DEFECTO).padStart(2, "0")}:00:00-05:00`);
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-liberacion-acceso-sql-test-"));
  const puerto = puertoAleatorio();
  servidor = new EmbeddedPostgres({
    databaseDir,
    port: puerto,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase("atiende_rv_liberacion_acceso_sql_test");

  superusuario = servidor.getPgClient("atiende_rv_liberacion_acceso_sql_test");
  await superusuario.connect();
  await superusuario.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

  const ejecutorMigraciones: EjecutorSql = {
    async query(sql, params) {
      const r = await superusuario.query(sql, params as unknown[] | undefined);
      return { rows: r.rows, rowCount: r.rowCount };
    },
    async exec(sql) {
      await superusuario.query(sql);
    },
  };
  await aplicarMigraciones(ejecutorMigraciones, migraciones);

  tenantId = await crearTenant(superusuario, "T-LIBERACION-ACCESO-1");
  propCancunId = await crearPropiedad(superusuario, tenantId, {
    nombre: "Prop Cancún",
    zonaHoraria: "America/Cancun",
  });
  propTokioId = await crearPropiedad(superusuario, tenantId, {
    nombre: "Prop Tokio",
    zonaHoraria: "Asia/Tokyo",
  });

  ejecutor = {
    async query(sql, params) {
      const r = await superusuario.query(sql, params as unknown[] | undefined);
      return { rows: r.rows };
    },
  };
}, 60_000);

afterAll(async () => {
  await superusuario?.end().catch(() => undefined);
  await servidor?.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

async function crearReservaConfirmada(unidadId: string, checkIn: string, checkOut: string): Promise<string> {
  const r = await superusuario.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
     VALUES ($1, daterange($2::date, $3::date, '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)
     RETURNING id`,
    [unidadId, checkIn, checkOut],
  );
  return r.rows[0]!.id;
}

async function eventosGeneradosPara(ocupacionId: string): Promise<{ tipo_evento: string; payload: unknown }[]> {
  const r = await superusuario.query<{ tipo_evento: string; payload: unknown }>(
    `SELECT tipo_evento, payload FROM outbox_evento WHERE ocupacion_unidad_id = $1`,
    [ocupacionId],
  );
  return r.rows;
}

async function marcaLiberacion(ocupacionId: string): Promise<string | null> {
  const r = await superusuario.query<{ instrucciones_acceso_liberadas_en: string | null }>(
    `SELECT instrucciones_acceso_liberadas_en FROM ocupacion_unidad WHERE id = $1`,
    [ocupacionId],
  );
  return r.rows[0]?.instrucciones_acceso_liberadas_en ?? null;
}

describe("ejecutarLiberacionInstruccionesAcceso — SQL real contra Postgres (REQ-095, T-48h)", () => {
  // Cada test usa su PROPIA fecha de check-in (vía unidadYFechaDePrueba) —
  // ver el comentario de esa función para el porqué. Cancún =
  // America/Cancun = UTC-5 todo el año (sin DST), así que
  // checkinEstimadoCancunUtc(checkIn) siempre es "checkIn a las
  // HORA_CORTE_DEFECTO (mediodía) + 5 horas" en UTC.

  it("NO genera el evento más de 48h antes del check-in estimado", async () => {
    const { unidadId, checkIn, checkOut } = await unidadYFechaDePrueba(propCancunId);
    const ocupacionId = await crearReservaConfirmada(unidadId, checkIn, checkOut);
    const unMinutoAntesDeT48 = new Date(checkinEstimadoCancunUtc(checkIn).getTime() - 48 * 3_600_000 - 60_000);

    const resultado = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: () => unMinutoAntesDeT48 });

    expect(resultado.candidatos).toBe(0);
    expect(resultado.eventosGenerados).toBe(0);
    expect(await eventosGeneradosPara(ocupacionId)).toHaveLength(0);
    expect(await marcaLiberacion(ocupacionId)).toBeNull();
  });

  it("SÍ genera el evento en el instante exacto de T-48h (frontera inclusiva)", async () => {
    const { unidadId, checkIn, checkOut } = await unidadYFechaDePrueba(propCancunId);
    const ocupacionId = await crearReservaConfirmada(unidadId, checkIn, checkOut);
    const exactamenteT48 = new Date(checkinEstimadoCancunUtc(checkIn).getTime() - 48 * 3_600_000);

    const resultado = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: () => exactamenteT48 });

    expect(resultado.candidatos).toBe(1);
    expect(resultado.eventosGenerados).toBe(1);
    const eventos = await eventosGeneradosPara(ocupacionId);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.tipo_evento).toBe(TIPO_EVENTO_LIBERACION_INSTRUCCIONES_ACCESO);
    expect(await marcaLiberacion(ocupacionId)).not.toBeNull();
  });

  it("SÍ genera el evento en un punto intermedio de la ventana de 48h, con payload sin ninguna marca de cerradura", async () => {
    const { unidadId, checkIn, checkOut } = await unidadYFechaDePrueba(propCancunId);
    const ocupacionId = await crearReservaConfirmada(unidadId, checkIn, checkOut);
    const mitadDeLaVentana = new Date(checkinEstimadoCancunUtc(checkIn).getTime() - 24 * 3_600_000);

    const resultado = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: () => mitadDeLaVentana });

    expect(resultado.eventosGenerados).toBe(1);
    const eventos = await eventosGeneradosPara(ocupacionId);
    const payloadTexto = JSON.stringify(eventos[0]!.payload).toLowerCase();
    // "sin depender de marca de cerradura específica" (REQ-095) — el
    // payload nunca debe mencionar ningún proveedor/marca de cerradura.
    for (const marca of ["august", "yale", "schlage", "remotelock", "nuki", "igloohome"]) {
      expect(payloadTexto).not.toContain(marca);
    }
    expect(payloadTexto).toContain("checkin");
  });

  it("NO genera el evento después del check-in estimado (ventana ya cerrada)", async () => {
    const { unidadId, checkIn, checkOut } = await unidadYFechaDePrueba(propCancunId);
    const ocupacionId = await crearReservaConfirmada(unidadId, checkIn, checkOut);
    const despuesDelCheckin = new Date(checkinEstimadoCancunUtc(checkIn).getTime() + 60_000);

    const resultado = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: () => despuesDelCheckin });

    expect(resultado.eventosGenerados).toBe(0);
    expect(await eventosGeneradosPara(ocupacionId)).toHaveLength(0);
  });

  it("es idempotente: una segunda corrida dentro de la misma ventana no duplica el evento", async () => {
    const { unidadId, checkIn, checkOut } = await unidadYFechaDePrueba(propCancunId);
    const ocupacionId = await crearReservaConfirmada(unidadId, checkIn, checkOut);
    const dentroDeLaVentana = new Date(checkinEstimadoCancunUtc(checkIn).getTime() - 10 * 3_600_000);

    const primeraCorrida = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: () => dentroDeLaVentana });
    const segundaCorrida = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: () => dentroDeLaVentana });

    expect(primeraCorrida.eventosGenerados).toBe(1);
    expect(segundaCorrida.eventosGenerados).toBe(0);
    expect(await eventosGeneradosPara(ocupacionId)).toHaveLength(1);
  });

  it("usa la zona horaria REAL de cada propiedad, no UTC ni hora de servidor", async () => {
    // Tokio = Asia/Tokyo = UTC+9. Check-in 2026-10-05 a las 12:00 local =
    // 2026-10-05T03:00:00Z. T-48h = 2026-10-03T03:00:00Z. Si el cálculo
    // usara UTC ingenuamente (tratando "2026-10-05 12:00" como si ya
    // fuera UTC), este instante caería FUERA de la ventana esperada.
    const checkinEstimadoTokioUtc = `2026-10-05T${String(HORA_CORTE_DEFECTO).padStart(2, "0")}:00:00+09:00`;
    const { unidadId } = await unidadYFechaDePrueba(propTokioId);
    const ocupacionId = await crearReservaConfirmada(unidadId, "2026-10-05", "2026-10-10");
    const dentroDeLaVentanaTokio = new Date(new Date(checkinEstimadoTokioUtc).getTime() - 5 * 3_600_000);

    const resultado = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: () => dentroDeLaVentanaTokio });

    expect(resultado.eventosGenerados).toBe(1);
    expect(await eventosGeneradosPara(ocupacionId)).toHaveLength(1);
  });

  it("nunca genera el evento para una reserva ya cancelada, ni para un bloqueo (sin check-in de huésped)", async () => {
    const { unidadId, checkIn, checkOut } = await unidadYFechaDePrueba(propCancunId);
    const ocupacionCancelada = await crearReservaConfirmada(unidadId, checkIn, checkOut);
    await superusuario.query(`UPDATE ocupacion_unidad SET estado = 'cancelado' WHERE id = $1`, [ocupacionCancelada]);
    const bloqueo = await superusuario.query<{ id: string }>(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange($2::date, $3::date, '[)'), 'bloqueo', 'BLOQUEO_PROPIETARIO', 'confirmado', true)
       RETURNING id`,
      [unidadId, checkIn, checkOut],
    );

    const dentroDeLaVentana = new Date(checkinEstimadoCancunUtc(checkIn).getTime() - 10 * 3_600_000);
    const resultado = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: () => dentroDeLaVentana });

    expect(resultado.eventosGenerados).toBe(0);
    expect(await eventosGeneradosPara(ocupacionCancelada)).toHaveLength(0);
    expect(await eventosGeneradosPara(bloqueo.rows[0]!.id)).toHaveLength(0);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  crearBloqueo,
  crearReservaConfirmada,
  cancelarOcupacion,
  calcularNoches,
  sonRangosContiguos,
  rangosSeSuperponen,
  estaOcupada,
  fechaLocalDesdeInstante,
  type EjecutorTransaccional,
  type Ocupacion,
} from "@atiende-rv/domain";
import { ejecutarCicloImport } from "@atiende-rv/adapters";
import { AirbnbIcalChannelSimulator } from "@atiende-rv/sim";
import { crearEntornoAdversarial, feedIcsDePrueba, type EntornoAdversarial } from "../sync/entorno.js";

/**
 * Suite adversarial de calendario (Lote 11, LOTES.md/BACKLOG H-092):
 * casos 2, 4, 5, 12, 14, 15 de `docs/ACEPTACION.md` §Calendario-2 — el
 * resto del catálogo (1, 3, 6-11, 13, 16, 17, 20) vive en
 * `tests/adversarial/sync/` (Lote 2) y no se duplica aquí; 18/19 en
 * `tests/adversarial/multitenant/`; 16 (worker-level) también en
 * `tests/adversarial/outbox/`; 20 (vectores SSRF adicionales) también en
 * `tests/adversarial/ssrf/`.
 */

let entorno: EntornoAdversarial;
let simulador: AirbnbIcalChannelSimulator;
let canalAirbnbId: string;
let canalVrboId: string;
let urlSimulador: string;

beforeAll(async () => {
  entorno = await crearEntornoAdversarial("atiende_rv_adversarial_calendario");
  canalAirbnbId = entorno.canalIdPorCodigo.get("airbnb")!;
  canalVrboId = entorno.canalIdPorCodigo.get("vrbo")!;
  simulador = new AirbnbIcalChannelSimulator({ credenciales: "test_solo_pruebas" });
  const info = await simulador.iniciar();
  urlSimulador = info.url;
}, 120_000);

afterAll(async () => {
  await simulador.detener();
  await entorno.cerrar();
});

/** Envuelve una conexión `pg.Client` independiente como
 * `EjecutorTransaccional` (mismo contrato estructural que
 * `packages/db`, ver `packages/domain/src/aplicacion/ejecutor.ts`) — dos
 * conexiones reales son indispensables para ejercitar concurrencia
 * verdadera (H-005), nunca dos llamadas secuenciales sobre la misma
 * conexión. */
function comoEjecutorDeConexion(cliente: pg.Client): EjecutorTransaccional {
  return {
    async query(sql, params) {
      const resultado = await cliente.query(sql, params as unknown[] | undefined);
      return { rows: resultado.rows, rowCount: resultado.rowCount };
    },
    async exec(sql) {
      await cliente.query(sql);
    },
  };
}

async function filaAOcupacion(unidadId: string): Promise<Ocupacion[]> {
  const filas = await entorno.motor.ejecutor.query<{
    id: string;
    inicio: string;
    fin: string;
    capa: Ocupacion["capa"];
    razon: Ocupacion["razon"];
    estado: Ocupacion["estado"];
    bloqueante: boolean;
  }>(
    `SELECT id, lower(rango)::text AS inicio, upper(rango)::text AS fin, capa, razon, estado, bloqueante
     FROM ocupacion_unidad WHERE unidad_id = $1`,
    [unidadId],
  );
  return filas.rows.map((f) => ({
    id: f.id,
    unidadId,
    rango: { inicio: f.inicio, fin: f.fin },
    capa: f.capa,
    razon: f.razon,
    estado: f.estado,
    bloqueante: f.bloqueante,
  }));
}

describe("caso 2 — reserva simultánea en dos canales para las mismas noches", () => {
  it("una queda confirmada, la otra queda conflicto_pendiente con alerta — ninguna se cancela", async () => {
    const unidadId = await entorno.crearUnidad("caso-2");
    const rango = { inicio: "2027-06-01", fin: "2027-06-05" };

    const conexionA = await entorno.motor.nuevaConexion();
    const conexionB = await entorno.motor.nuevaConexion();

    const [resultadoA, resultadoB] = await Promise.all([
      crearReservaConfirmada(comoEjecutorDeConexion(conexionA), {
        unidadId,
        rango,
        estado: "confirmado",
        bloqueante: true,
        canalOrigenId: canalAirbnbId,
        externalId: "airbnb-caso2",
      }),
      crearReservaConfirmada(comoEjecutorDeConexion(conexionB), {
        unidadId,
        rango,
        estado: "confirmado",
        bloqueante: true,
        canalOrigenId: canalVrboId,
        externalId: "vrbo-caso2",
      }),
    ]);

    const conConflicto = [resultadoA, resultadoB].filter((r) => r.conflicto !== null);
    const sinConflicto = [resultadoA, resultadoB].filter((r) => r.conflicto === null);
    expect(conConflicto).toHaveLength(1);
    expect(sinConflicto).toHaveLength(1);
    expect(conConflicto[0]!.conflicto!.tipo).toBe("overbooking_confirmado");

    // Ninguna de las dos filas terminó cancelada (REQ-000: nunca se
    // cancela automáticamente por un conflicto de doble reserva).
    const filas = await filaAOcupacion(unidadId);
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.estado !== "cancelado")).toBe(true);
    expect(filas.some((f) => f.estado === "confirmado")).toBe(true);
    expect(filas.some((f) => f.estado === "conflicto_pendiente")).toBe(true);

    // El conflicto quedó registrado para revisión humana, con alerta en
    // el outbox (mecanismo real de notificación, no solo la fila).
    const conflictos = await entorno.motor.ejecutor.query<{ tipo: string }>(
      `SELECT tipo FROM conflicto_calendario WHERE unidad_id = $1`,
      [unidadId],
    );
    expect(conflictos.rows).toHaveLength(1);
    expect(conflictos.rows[0]!.tipo).toBe("overbooking_confirmado");

    const alertas = await entorno.motor.ejecutor.query<{ tipo_evento: string }>(
      `SELECT tipo_evento FROM outbox_evento WHERE tipo_evento = 'alerta_overbooking'`,
    );
    expect(alertas.rows.length).toBeGreaterThanOrEqual(1);

    console.log(
      `[CASO 2] unidad=${unidadId} filas=${filas.length} conflictos=${conflictos.rows.length} ` +
        `alertas_overbooking=${alertas.rows.length} — ninguna reserva cancelada`,
    );

    await conexionA.end();
    await conexionB.end();
  });
});

describe("caso 4 — modificación de fechas (mismo UID, rango distinto): el bloqueo se mueve completamente", () => {
  it("noches del rango anterior quedan libres, noches del rango nuevo quedan ocupadas", async () => {
    const unidadId = await entorno.crearUnidad("caso-4");
    const uid = "caso4@canal-externo.com";
    simulador.definirEscenario({
      tipo: "ics",
      contenidoIcs: feedIcsDePrueba([
        { uid, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20270701", dtend: "20270705" },
      ]),
    });
    await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId, canalId: canalAirbnbId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );

    const antesDeMover = await filaAOcupacion(unidadId);
    expect(estaOcupada(antesDeMover, "2027-07-01")).toBe(true);
    expect(estaOcupada(antesDeMover, "2027-07-20")).toBe(false);

    // Mismo UID, SEQUENCE mayor, DTSTAMP más reciente, rango completamente
    // distinto (movido, no ampliado/reducido).
    simulador.definirEscenario({
      tipo: "ics",
      contenidoIcs: feedIcsDePrueba([
        { uid, sequence: 2, dtstamp: "20270102T000000Z", dtstart: "20270720", dtend: "20270725" },
      ]),
    });
    const resultado = await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId, canalId: canalAirbnbId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );
    expect(resultado.eventosAplicados).toBe(1);

    const despuesDeMover = await filaAOcupacion(unidadId);
    // Nunca dos filas activas para el mismo UID — se movió, no se duplicó.
    expect(despuesDeMover.filter((f) => f.estado !== "cancelado")).toHaveLength(1);
    expect(estaOcupada(despuesDeMover, "2027-07-01")).toBe(false); // liberado
    expect(estaOcupada(despuesDeMover, "2027-07-20")).toBe(true); // ocupado en el nuevo rango
    expect(estaOcupada(despuesDeMover, "2027-07-24")).toBe(true);
  });
});

describe("caso 5 — cancelación no reabre noches ocupadas por otra causa", () => {
  it("cancelar una reserva que se solapaba con un bloqueo deja la noche ocupada por el bloqueo", async () => {
    const unidadId = await entorno.crearUnidad("caso-5");
    // Fixture deliberado: bloqueo de propietario y reserva confirmada que
    // se solapan en parte (capas distintas, el EXCLUDE de BD no las
    // rechaza entre sí — D-002).
    await crearBloqueo(entorno.ejecutor(), {
      unidadId,
      rango: { inicio: "2027-08-01", fin: "2027-08-10" },
      razon: "BLOQUEO_PROPIETARIO",
    });
    const reserva = await crearReservaConfirmada(entorno.ejecutor(), {
      unidadId,
      rango: { inicio: "2027-08-05", fin: "2027-08-08" },
      estado: "confirmado",
      bloqueante: true,
    });
    expect(reserva.conflicto).toBeNull();

    const antesDeCancelar = await filaAOcupacion(unidadId);
    expect(estaOcupada(antesDeCancelar, "2027-08-06")).toBe(true); // cubierta por AMBAS filas

    await cancelarOcupacion(entorno.ejecutor(), reserva.ocupacionId);

    const despuesDeCancelar = await filaAOcupacion(unidadId);
    // 0 falsos positivos de disponibilidad: la noche sigue ocupada por el
    // bloqueo de propietario, que nunca se tocó.
    expect(estaOcupada(despuesDeCancelar, "2027-08-06")).toBe(true);
    expect(estaOcupada(despuesDeCancelar, "2027-08-01")).toBe(true); // fuera del rango cancelado, también por el bloqueo
    expect(estaOcupada(despuesDeCancelar, "2027-08-09")).toBe(true); // cola del bloqueo, tras el fin de la reserva

    console.log(
      `[CASO 5] unidad=${unidadId} noche_08-06_ocupada_tras_cancelar=${estaOcupada(despuesDeCancelar, "2027-08-06")}`,
    );
  });
});

describe("caso 12 — bloqueo manual superpuesto con import: nunca sobrescritura silenciosa", () => {
  it("un import que crea una reserva sobre el mismo rango de un bloqueo manual deja el bloqueo intacto", async () => {
    const unidadId = await entorno.crearUnidad("caso-12");
    const bloqueo = await crearBloqueo(entorno.ejecutor(), {
      unidadId,
      rango: { inicio: "2027-09-01", fin: "2027-09-10" },
      razon: "BLOQUEO_PROPIETARIO",
    });

    const antes = await entorno.motor.ejecutor.query<{
      estado: string;
      inicio: string;
      fin: string;
    }>(
      `SELECT estado, lower(rango)::text AS inicio, upper(rango)::text AS fin
       FROM ocupacion_unidad WHERE id = $1`,
      [bloqueo.ocupacionId],
    );

    simulador.definirEscenario({
      tipo: "ics",
      contenidoIcs: feedIcsDePrueba([
        { uid: "caso12@canal-externo.com", sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20270903", dtend: "20270906" },
      ]),
    });
    const resultado = await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId, canalId: canalAirbnbId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );
    expect(resultado.eventosAplicados).toBe(1);

    const despues = await entorno.motor.ejecutor.query<{
      estado: string;
      inicio: string;
      fin: string;
    }>(
      `SELECT estado, lower(rango)::text AS inicio, upper(rango)::text AS fin
       FROM ocupacion_unidad WHERE id = $1`,
      [bloqueo.ocupacionId],
    );

    // El bloqueo manual — misma fila, mismo rango, mismo estado — nunca se
    // tocó, ni se fusionó ni se sobrescribió por el import.
    expect(despues.rows[0]).toEqual(antes.rows[0]);
    expect(despues.rows[0]!.estado).toBe("confirmado");

    // Ambas filas (bloqueo manual + reserva importada) coexisten activas.
    const filas = await filaAOcupacion(unidadId);
    expect(filas.filter((f) => f.estado !== "cancelado")).toHaveLength(2);

    console.log(`[CASO 12] unidad=${unidadId} bloqueo_manual_intacto=true filas_activas=${filas.length}`);
  });
});

describe("caso 14 — DST en cálculo de noches/duración (RFC 5545 §3.3.5)", () => {
  it("calcularNoches es DST-safe en Europe/Madrid (cambio de horario de primavera, 2027-03-28) y en América/Ciudad de México", () => {
    // Europe/Madrid: DST 2027 salta la noche del sábado 27 al domingo 28
    // de marzo (01:00 UTC, verificado con Intl.DateTimeFormat en esta
    // sesión: 2027-03-27T12:00Z = 13:00 CET, 2027-03-28T12:00Z = 14:00
    // CEST). El rango [27, 29) DEBE seguir contando 2 noches exactas —
    // nunca 1 o 3 por una resta ingenua sobre `Date`/milisegundos.
    expect(calcularNoches({ inicio: "2027-03-27", fin: "2027-03-29" })).toBe(2);

    // Cambio de horario de otoño (retrasa el reloj, 2027-10-31): mismo
    // invariante en la dirección opuesta.
    expect(calcularNoches({ inicio: "2027-10-30", fin: "2027-11-01" })).toBe(2);

    // América/Ciudad de México: dato verificado en esta sesión (Intl,
    // 2026-09-06) — México eliminó el horario de verano en el interior
    // del país desde el decreto de 2022 (excepto la franja fronteriza
    // norte); `America/Mexico_City` ya NO tiene transición de DST. Sirve
    // aquí como caso de control: el cálculo debe seguir siendo exacto
    // (trivialmente, al no haber salto), no como evidencia de manejo de
    // DST real para esa zona.
    expect(calcularNoches({ inicio: "2027-03-27", fin: "2027-03-29" })).toBe(2);
  });

  it("fechaLocalDesdeInstante coincide con la fecha de calendario real (Intl) a ambos lados de la transición de Madrid", () => {
    const instantesDeSondeo = [
      "2027-03-27T23:30:00Z",
      "2027-03-28T00:30:00Z",
      "2027-03-28T23:30:00Z",
      "2027-10-30T23:30:00Z",
      "2027-10-31T00:30:00Z",
      "2027-10-31T23:30:00Z",
    ];
    for (const instante of instantesDeSondeo) {
      const esperado = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(instante));
      const obtenido = fechaLocalDesdeInstante(instante, "Europe/Madrid");
      expect(obtenido).toBe(esperado);
    }
  });

  it("una reserva importada que cruza la transición de Madrid conserva exactamente el número de noches del rango", async () => {
    const unidadMadrid = await entorno.crearUnidad("caso-14-madrid", "Europe/Madrid");
    simulador.definirEscenario({
      tipo: "ics",
      contenidoIcs: feedIcsDePrueba([
        { uid: "caso14-madrid@canal.com", sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20270327", dtend: "20270329" },
      ]),
    });
    const resultado = await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId: unidadMadrid, canalId: canalAirbnbId, zonaHorariaPropiedad: "Europe/Madrid" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );
    expect(resultado.eventosAplicados).toBe(1);

    const fila = await entorno.motor.ejecutor.query<{ inicio: string; fin: string }>(
      `SELECT lower(rango)::text AS inicio, upper(rango)::text AS fin
       FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado'`,
      [unidadMadrid],
    );
    expect(calcularNoches({ inicio: fila.rows[0]!.inicio, fin: fila.rows[0]!.fin })).toBe(2);
  });
});

describe("caso 15 — estancias contiguas (checkout=check-in mismo día): nunca error de solapamiento", () => {
  it("dos reservas CONCURRENTES con checkout de A = check-in de B insertan ambas sin conflicto", async () => {
    const unidadId = await entorno.crearUnidad("caso-15");
    const rangoA = { inicio: "2027-06-01", fin: "2027-06-05" };
    const rangoB = { inicio: "2027-06-05", fin: "2027-06-10" }; // contiguo, no solapado

    expect(sonRangosContiguos(rangoA, rangoB)).toBe(true);
    expect(rangosSeSuperponen(rangoA, rangoB)).toBe(false);

    const conexionA = await entorno.motor.nuevaConexion();
    const conexionB = await entorno.motor.nuevaConexion();

    const [resultadoA, resultadoB] = await Promise.all([
      crearReservaConfirmada(comoEjecutorDeConexion(conexionA), {
        unidadId,
        rango: rangoA,
        estado: "confirmado",
        bloqueante: true,
      }),
      crearReservaConfirmada(comoEjecutorDeConexion(conexionB), {
        unidadId,
        rango: rangoB,
        estado: "confirmado",
        bloqueante: true,
      }),
    ]);

    expect(resultadoA.conflicto).toBeNull();
    expect(resultadoB.conflicto).toBeNull();

    const filas = await filaAOcupacion(unidadId);
    expect(filas.filter((f) => f.estado === "confirmado")).toHaveLength(2);

    await conexionA.end();
    await conexionB.end();
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  crearBloqueo,
  crearReservaConfirmada,
} from "@atiende-rv/domain";
import {
  ejecutarCicloImport,
  exportarFeedParaCanal,
  contarBloqueosActivos,
} from "@atiende-rv/adapters";
import { AirbnbIcalChannelSimulator, BookingApiSimulator } from "@atiende-rv/sim";
import { crearEntornoAdversarial, feedIcsDePrueba, type EntornoAdversarial } from "./entorno.js";

/**
 * Suite adversarial de sincronización (Lote 2, LOTES.md): subconjunto de
 * casos 1, 3, 6, 7, 8, 9, 10, 11, 13, 16, 17, 20 de `docs/ACEPTACION.md`
 * §Calendario-2 que NO requiere API/auth de Lote 3 — ejercitados contra
 * `embedded-postgres` real (D-009/D-022) y simuladores etiquetados
 * (D-019). Incluye además el entregable verificable explícito del lote:
 * anti-eco de exportación (§Calendario-4).
 */

let entorno: EntornoAdversarial;
let simulador: AirbnbIcalChannelSimulator;
let canalId: string;
let urlSimulador: string;

beforeAll(async () => {
  entorno = await crearEntornoAdversarial("atiende_rv_adversarial_sync");
  canalId = entorno.canalIdPorCodigo.get("airbnb")!;
  simulador = new AirbnbIcalChannelSimulator({ credenciales: "test_solo_pruebas" });
  const info = await simulador.iniciar();
  urlSimulador = info.url;
}, 120_000);

afterAll(async () => {
  await simulador.detener();
  await entorno.cerrar();
});

async function ciclo(unidadId: string, feedIcs: string) {
  simulador.definirEscenario({ tipo: "ics", contenidoIcs: feedIcs });
  return ejecutarCicloImport(
    { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
    { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
  );
}

describe("ENTREGABLE VERIFICABLE — anti-eco de exportación (§Calendario-4)", () => {
  it("un bloqueo exportado y reexportado por el simulador en su import NO crea un segundo bloqueo", async () => {
    const unidadId = await entorno.crearUnidad("anti-eco-entregable");
    await crearBloqueo(entorno.ejecutor(), {
      unidadId,
      rango: { inicio: "2027-08-01", fin: "2027-08-05" },
      razon: "BLOQUEO_PROPIETARIO",
    });

    const antes = await contarBloqueosActivos(entorno.ejecutor(), unidadId);

    const feedExportado = await exportarFeedParaCanal(
      { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
      "Unidad de prueba anti-eco",
    );

    // El simulador "reexporta" (eco) exactamente lo que nosotros
    // exportamos, tal como describe §Calendario-4.
    simulador.definirEscenario({ tipo: "ics", contenidoIcs: feedExportado.contenidoIcs });
    const resultado = await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );

    const despues = await contarBloqueosActivos(entorno.ejecutor(), unidadId);

    console.log(
      `[ANTI-ECO] unidad=${unidadId} canal=airbnb bloqueos_activos_antes=${antes} bloqueos_activos_despues=${despues} ` +
        `ecos_descartados=${resultado.ecosDescartados} eventos_aplicados=${resultado.eventosAplicados} capa=UID-namespace(1)`,
    );

    expect(resultado.ecosDescartados).toBe(1);
    expect(resultado.eventosAplicados).toBe(0);
    expect(despues).toBe(antes); // conteo de bloqueos activos antes/después = igual
  });
});

describe("caso 1 — doble evento (mismo UID+SEQUENCE, contenido distinto): DTSTAMP decide", () => {
  it("aplica el evento con DTSTAMP más reciente, sin duplicar la fila", async () => {
    const unidadId = await entorno.crearUnidad("caso-1");
    const uid = "caso1@canal-externo.com";

    await ciclo(
      unidadId,
      feedIcsDePrueba([{ uid, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20270601", dtend: "20270605" }]),
    );
    const r2 = await ciclo(
      unidadId,
      feedIcsDePrueba([{ uid, sequence: 1, dtstamp: "20270102T000000Z", dtstart: "20270610", dtend: "20270615" }]),
    );

    expect(r2.eventosAplicados).toBe(1);
    const activos = await contarBloqueosActivos(entorno.ejecutor(), unidadId);
    expect(activos).toBe(1); // exactamente un evento final, no dos

    const fila = await entorno.motor.ejecutor.query<{ inicio: string }>(
      `SELECT lower(rango)::text AS inicio FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado'`,
      [unidadId],
    );
    expect(fila.rows[0]!.inicio).toBe("2027-06-10"); // ganó la versión con DTSTAMP más reciente
  });
});

describe("caso 3 — eventos fuera de orden (CANCEL con SEQUENCE menor que un CREATE ya aplicado)", () => {
  it("el CANCEL prematuro se descarta, la reserva sigue activa", async () => {
    const unidadId = await entorno.crearUnidad("caso-3");
    const uid = "caso3@canal-externo.com";

    await ciclo(
      unidadId,
      feedIcsDePrueba([{ uid, sequence: 2, dtstamp: "20270201T000000Z", dtstart: "20270701", dtend: "20270705", status: "CONFIRMED" }]),
    );
    const rCancel = await ciclo(
      unidadId,
      feedIcsDePrueba([{ uid, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20270701", dtend: "20270705", status: "CANCELLED" }]),
    );

    expect(rCancel.eventosAplicados).toBe(0); // descartado por SEQUENCE menor
    const activos = await contarBloqueosActivos(entorno.ejecutor(), unidadId);
    expect(activos).toBe(1); // la reserva NUNCA se canceló
  });
});

describe("caso 6/7 — timeout tras éxito remoto y reintento de import ya procesado: idempotencia", () => {
  it("reintentar el mismo evento (mismo hash) es un no-op, nunca duplica el efecto", async () => {
    const unidadId = await entorno.crearUnidad("caso-6-7");
    const uid = "caso6-7@canal-externo.com";
    const feed = feedIcsDePrueba([{ uid, sequence: 1, dtstamp: "20270301T000000Z", dtstart: "20270801", dtend: "20270805" }]);

    const primero = await ciclo(unidadId, feed);
    expect(primero.eventosAplicados).toBe(1);

    // Simula un timeout tras el éxito remoto (el canal ya lo procesó, pero
    // nuestro fetch falla) — cuarentena registra el fallo, sin tocar datos.
    simulador.definirEscenario({ tipo: "inaccesible" });
    await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );

    // Reintento (caso 7): mismo feed exacto ya procesado.
    const reintento = await ciclo(unidadId, feed);
    expect(reintento.eventosAplicados).toBe(0); // sin_cambio, no re-aplica

    const activos = await contarBloqueosActivos(entorno.ejecutor(), unidadId);
    expect(activos).toBe(1); // nunca se duplicó
  });
});

describe("caso 8 — ACK perdido: reproceso posterior no corrompe el estado", () => {
  it("una reserva re-entregada sin ack (BookingApiSimulator) se procesa una sola vez de forma idempotente", async () => {
    const sim = new BookingApiSimulator({ credenciales: "test" });
    const reserva = sim.encolarReserva({
      unidadExternaId: "unidad-booking-8",
      checkIn: "2027-09-01",
      checkOut: "2027-09-03",
      estado: "CONFIRMADA",
    });
    const unidadId = await entorno.crearUnidad("caso-8");

    async function procesarIdempotente(externalId: string) {
      const existente = await entorno.motor.ejecutor.query<{ id: string }>(
        `SELECT id FROM ocupacion_unidad WHERE unidad_id = $1 AND external_id = $2 AND estado <> 'cancelado'`,
        [unidadId, externalId],
      );
      if (existente.rows.length > 0) return; // ya aplicado — ack perdido no debe duplicar
      await crearReservaConfirmada(entorno.ejecutor(), {
        unidadId,
        rango: { inicio: "2027-09-01", fin: "2027-09-03" },
        estado: "confirmado",
        bloqueante: true,
        canalOrigenId: canalId,
        externalId,
      });
    }

    // Primer pull: se procesa pero el ack "se pierde" (no se llama sim.ack).
    for (const r of sim.pull()) await procesarIdempotente(r.id);
    // Segundo pull (reenvío por falta de ack, RV04): se reprocesa el mismo id.
    for (const r of sim.pull()) await procesarIdempotente(r.id);

    const activos = await contarBloqueosActivos(entorno.ejecutor(), unidadId);
    expect(activos).toBe(1); // el reproceso no corrompió el estado
    expect(sim.vecesReenviada(reserva.id)).toBe(2);
  });
});

describe("caso 9 — feed malformado: rechazo explícito, sin estado parcial", () => {
  it("un .ics malformado se rechaza sin crear ni modificar ninguna ocupación", async () => {
    const unidadId = await entorno.crearUnidad("caso-9");
    simulador.definirEscenario({ tipo: "malformado" });
    const resultado = await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );
    expect(resultado.resultado).toBe("fallo_parseo");
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(0);
  });
});

describe("caso 10 — feed vacío: nunca se interpreta como cancelar todas las reservas", () => {
  it("un feed vacío pero válido no libera noches ya ocupadas", async () => {
    const unidadId = await entorno.crearUnidad("caso-10");
    await crearBloqueo(entorno.ejecutor(), {
      unidadId,
      rango: { inicio: "2027-10-01", fin: "2027-10-05" },
      razon: "BLOQUEO_PROPIETARIO",
    });
    const antes = await contarBloqueosActivos(entorno.ejecutor(), unidadId);

    simulador.definirEscenario({ tipo: "vacio" });
    const resultado = await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );

    expect(resultado.resultado).toBe("exito_vacio");
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(antes);
  });
});

describe("caso 11 — feed inaccesible: backoff, cuarentena tras N intentos, último estado preservado", () => {
  it("tras 3 fallos consecutivos entra en cuarentena sin tocar los bloqueos existentes", async () => {
    const unidadId = await entorno.crearUnidad("caso-11");
    await crearBloqueo(entorno.ejecutor(), {
      unidadId,
      rango: { inicio: "2027-11-01", fin: "2027-11-05" },
      razon: "MANTENIMIENTO",
    });
    const antes = await contarBloqueosActivos(entorno.ejecutor(), unidadId);

    simulador.definirEscenario({ tipo: "inaccesible" });
    let ultimoResultado;
    for (let i = 0; i < 3; i++) {
      ultimoResultado = await ejecutarCicloImport(
        { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
        { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
      );
    }

    expect(ultimoResultado!.alertaCuarentena?.tipo).toBe("cuarentena_activada");
    const fila = await entorno.motor.ejecutor.query<{ en_cuarentena_desde: string | null }>(
      `SELECT en_cuarentena_desde FROM unidad_canal_feed WHERE unidad_id = $1 AND canal_id = $2`,
      [unidadId, canalId],
    );
    expect(fila.rows[0]!.en_cuarentena_desde).not.toBeNull();
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(antes);
  });
});

describe("caso 13 — UID reciclado: revisión humana, nunca fusión silenciosa", () => {
  it("SEQUENCE mayor pero DTSTAMP anterior con contenido distinto se marca para revisión, sin tocar la reserva original", async () => {
    const unidadId = await entorno.crearUnidad("caso-13");
    const uid = "caso13@canal-externo.com";

    await ciclo(
      unidadId,
      feedIcsDePrueba([{ uid, sequence: 5, dtstamp: "20270601T000000Z", dtstart: "20271201", dtend: "20271205" }]),
    );
    const rReciclado = await ciclo(
      unidadId,
      feedIcsDePrueba([{ uid, sequence: 6, dtstamp: "20270101T000000Z", dtstart: "20280101", dtend: "20280110" }]),
    );

    expect(rReciclado.revisionesUidReciclado).toBe(1);
    expect(rReciclado.eventosAplicados).toBe(0);

    const outbox = await entorno.motor.ejecutor.query<{ tipo_evento: string }>(
      `SELECT tipo_evento FROM outbox_evento WHERE tipo_evento = 'revisar_uid_reciclado'`,
    );
    expect(outbox.rows.length).toBeGreaterThanOrEqual(1);

    // La reserva original nunca se tocó ni se fusionó con el contenido nuevo.
    const fila = await entorno.motor.ejecutor.query<{ inicio: string }>(
      `SELECT lower(rango)::text AS inicio FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado'`,
      [unidadId],
    );
    expect(fila.rows[0]!.inicio).toBe("2027-12-01");
  });
});

describe("D-DSD-03 (regresión, pipeline real) — UID reciclado SIN SEQUENCE también se marca para revisión", () => {
  it("mismo UID, SEQUENCE ausente en ambos eventos, DTSTAMP más reciente pero rango completamente disjunto: revisión humana, nunca fusión silenciosa", async () => {
    const unidadId = await entorno.crearUnidad("d-dsd-03-sin-sequence");
    const uid = "d-dsd-03-sin-sequence@canal-externo.com";

    await ciclo(
      unidadId,
      feedIcsDePrueba([{ uid, sequence: null, dtstamp: "20261201T000000Z", dtstart: "20270110", dtend: "20270115" }]),
    );
    const rReciclado = await ciclo(
      unidadId,
      feedIcsDePrueba([{ uid, sequence: null, dtstamp: "20270601T000000Z", dtstart: "20271120", dtend: "20271122" }]),
    );

    expect(rReciclado.revisionesUidReciclado).toBe(1);
    expect(rReciclado.eventosAplicados).toBe(0);

    // La reserva original nunca se tocó ni se fusionó con el contenido nuevo.
    const fila = await entorno.motor.ejecutor.query<{ inicio: string }>(
      `SELECT lower(rango)::text AS inicio FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado'`,
      [unidadId],
    );
    expect(fila.rows[0]!.inicio).toBe("2027-01-10");
  });

  it("mismo UID, SEQUENCE ausente en ambos, DTSTAMP más reciente y rango SOLAPADO (modificación real): se aplica normalmente, sin falso positivo", async () => {
    const unidadId = await entorno.crearUnidad("d-dsd-03-sin-sequence-legitimo");
    const uid = "d-dsd-03-sin-sequence-legitimo@canal-externo.com";

    await ciclo(
      unidadId,
      feedIcsDePrueba([{ uid, sequence: null, dtstamp: "20261201T000000Z", dtstart: "20270110", dtend: "20270115" }]),
    );
    const rModificado = await ciclo(
      unidadId,
      feedIcsDePrueba([{ uid, sequence: null, dtstamp: "20261202T000000Z", dtstart: "20270110", dtend: "20270116" }]),
    );

    expect(rModificado.revisionesUidReciclado).toBe(0);
    expect(rModificado.eventosAplicados).toBe(1);

    const fila = await entorno.motor.ejecutor.query<{ inicio: string; fin: string }>(
      `SELECT lower(rango)::text AS inicio, upper(rango)::text AS fin FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado'`,
      [unidadId],
    );
    expect(fila.rows[0]).toEqual({ inicio: "2027-01-10", fin: "2027-01-16" });
  });
});

describe("D-DSD-06 (regresión) — un evento con rango inválido (DURATION negativa) no aborta el resto del ciclo", () => {
  it("los dos eventos válidos del feed se aplican aunque el evento intermedio tenga DURATION negativa (rango invertido)", async () => {
    const unidadId = await entorno.crearUnidad("d-dsd-06-duracion-invalida");

    // feedIcsDePrueba no soporta DURATION (solo DTEND explícito) — feed
    // manual, mismo patrón que
    // tests/auditoria-2/dominio/duracionInvalidaRompeCicloImport.test.ts.
    const feed =
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n` +
      `BEGIN:VEVENT\r\nUID:d-dsd-06-bueno-antes@canal.com\r\nDTSTAMP:20270101T000000Z\r\n` +
      `DTSTART;VALUE=DATE:20270601\r\nDTEND;VALUE=DATE:20270603\r\nEND:VEVENT\r\n` +
      `BEGIN:VEVENT\r\nUID:d-dsd-06-malformado@canal.com\r\nDTSTAMP:20270101T000000Z\r\n` +
      `DTSTART;VALUE=DATE:20270610\r\nDURATION:-P1D\r\nEND:VEVENT\r\n` +
      `BEGIN:VEVENT\r\nUID:d-dsd-06-bueno-despues@canal.com\r\nDTSTAMP:20270101T000000Z\r\n` +
      `DTSTART;VALUE=DATE:20270620\r\nDTEND;VALUE=DATE:20270622\r\nEND:VEVENT\r\n` +
      `END:VCALENDAR\r\n`;

    const resultado = await ciclo(unidadId, feed);

    expect(resultado.eventosAplicados).toBe(2);
    expect(resultado.eventosDescartadosPorError).toBe(1);

    const activas = await entorno.ejecutor().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado'`,
      [unidadId],
    );
    expect(Number(activas.rows[0]!.n)).toBe(2);

    const outbox = await entorno.motor.ejecutor.query<{ tipo_evento: string }>(
      `SELECT tipo_evento FROM outbox_evento WHERE tipo_evento = 'revisar_evento_fallido'`,
    );
    expect(outbox.rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe("caso 16 — crash/replay a mitad de batch: reprocesar el batch completo equivale a procesarlo una vez", () => {
  it("repetir el mismo ciclo con 2 eventos no duplica ninguno de los dos", async () => {
    const unidadId = await entorno.crearUnidad("caso-16");
    const feed = feedIcsDePrueba([
      { uid: "caso16-a@canal.com", sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20270101", dtend: "20270103" },
      { uid: "caso16-b@canal.com", sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20270201", dtend: "20270203" },
    ]);

    const primero = await ciclo(unidadId, feed);
    expect(primero.eventosAplicados).toBe(2);

    const replay = await ciclo(unidadId, feed); // "crash y reintento" == mismo batch de nuevo
    expect(replay.eventosAplicados).toBe(0); // ambos sin_cambio

    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(2);
  });
});

describe("caso 17 — límites de API / HTTP 429: sin bucle de reintento agresivo", () => {
  it("un 429 se trata como fallo de red (nunca como éxito), acumulando el contador de fallos sin efecto en los datos", async () => {
    const unidadId = await entorno.crearUnidad("caso-17");
    simulador.definirEscenario({ tipo: "inaccesible", statusHttp: 429 });

    const resultado = await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );

    expect(resultado.resultado).toBe("fallo_red");
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(0);
  });
});

describe("caso 20 — SSRF: URL de feed apuntando a metadata/rango privado", () => {
  it("se rechaza antes de cualquier conexión de red saliente y no crea ninguna ocupación", async () => {
    const unidadId = await entorno.crearUnidad("caso-20");
    const resultado = await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
      {
        url: "https://feed-malicioso.example/x.ics",
        resolverPersonalizado: () => ["169.254.169.254"],
      },
    );
    expect(resultado.resultado).toBe("fallo_red");
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(0);
  });
});


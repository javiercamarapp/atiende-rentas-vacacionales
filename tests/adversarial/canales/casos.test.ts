import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBloqueo, crearReservaConfirmada, calcularHashContenido } from "@atiende-rv/domain";
import { ejecutarCicloImport, exportarFeedParaCanal, detectarEco } from "@atiende-rv/adapters";
import { ExpediaApiClient, SiteMinderPmsXchangeClient } from "@atiende-rv/adapters";
import { AirbnbIcalChannelSimulator, ExpediaApiSimulator, SiteMinderPmsXchangeSimulator } from "@atiende-rv/sim";
import { crearEntornoAdversarial, feedIcsDePrueba, type EntornoAdversarial } from "../sync/entorno.js";

/**
 * Suite adversarial de canales de distribución usados en México (Lote 3.4,
 * RV22): tres casos explícitamente pedidos por la construcción —
 *   1. Doble reserva Expedia+Airbnb la misma noche → conflicto detectado
 *      (nunca se cancela ninguna reserva automáticamente, REQ-000).
 *   2. Ack perdido de Expedia → sin duplicar la reserva al reintentar.
 *   3. Un channel manager "puente" (SiteMinder) reexporta nuestro propio
 *      cierre de disponibilidad como si fuera una reserva entrante →
 *      anti-eco lo reconoce (capa 3, rango coincidente ya exportado).
 * Contra `embedded-postgres` real (D-009/D-022) y simuladores etiquetados
 * (D-019), mismo patrón que `tests/adversarial/sync/casos.test.ts`.
 */

let entorno: EntornoAdversarial;

beforeAll(async () => {
  entorno = await crearEntornoAdversarial("atiende_rv_adversarial_canales");
}, 120_000);

afterAll(async () => {
  await entorno.cerrar();
});

describe("caso — doble reserva Expedia+Airbnb la misma noche → conflicto (nunca auto-cancela)", () => {
  it("crea ambas ocupaciones y registra overbooking_confirmado, sin cancelar ninguna", async () => {
    const unidadId = await entorno.crearUnidad("doble-reserva-expedia-airbnb");
    const airbnbCanalId = entorno.canalIdPorCodigo.get("airbnb")!;
    const expediaCanalId = entorno.canalIdPorCodigo.get("expedia")!;

    const airbnbSim = new AirbnbIcalChannelSimulator({ credenciales: "test_solo_pruebas" });
    const { url } = await airbnbSim.iniciar();
    try {
      // 1) Airbnb confirma primero, vía iCal, la noche 2027-06-01..05.
      airbnbSim.definirEscenario({
        tipo: "ics",
        contenidoIcs: feedIcsDePrueba([
          { uid: "airbnb-res-1@airbnb.com", dtstamp: "20270501T000000Z", dtstart: "20270601", dtend: "20270605" },
        ]),
      });
      const resultadoAirbnb = await ejecutarCicloImport(
        { ejecutor: entorno.ejecutor(), unidadId, canalId: airbnbCanalId, zonaHorariaPropiedad: "America/Mexico_City" },
        { url, resolverPersonalizado: airbnbSim.resolverPersonalizado, permitirHttpSimuladorLocal: true },
      );
      expect(resultadoAirbnb.eventosAplicados).toBe(1);

      // 2) Expedia confirma DESPUÉS, para una noche solapada
      // (2027-06-03..07) — llega por Booking Retrieval, aplicado
      // directamente vía la capa de aplicación de dominio (no hay motor
      // iCal para Expedia, es API/JSON).
      const resultadoExpedia = await crearReservaConfirmada(entorno.ejecutor(), {
        unidadId,
        rango: { inicio: "2027-06-03", fin: "2027-06-07" },
        estado: "confirmado",
        bloqueante: true,
        canalOrigenId: expediaCanalId,
        externalId: "expedia-res-1",
      });

      // REQ-000: la reserva de Expedia SIEMPRE se acepta (el canal externo
      // ya la confirmó frente al huésped) — nunca se cancela ninguna de
      // las dos automáticamente; el conflicto queda registrado para
      // revisión humana.
      expect(resultadoExpedia.conflicto).not.toBeNull();
      expect(resultadoExpedia.conflicto!.tipo).toBe("overbooking_confirmado");

      const activas = await entorno.ejecutor().query<{ estado: string; external_id: string | null }>(
        `SELECT estado, external_id FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado' ORDER BY creado_en ASC`,
        [unidadId],
      );
      expect(activas.rows).toHaveLength(2);
      expect(activas.rows.every((r) => r.estado !== "cancelado")).toBe(true);
      expect(activas.rows.map((r) => r.external_id)).toContain("expedia-res-1");
    } finally {
      await airbnbSim.detener();
    }
  });
});

describe("caso — ack perdido de Expedia: reintento no duplica la reserva", () => {
  it("reenvía la misma reserva en cada pull hasta confirmar; nuestra ingesta deduplica por (canal, external_id)", async () => {
    const unidadId = await entorno.crearUnidad("ack-perdido-expedia");
    const expediaCanalId = entorno.canalIdPorCodigo.get("expedia")!;

    const sim = new ExpediaApiSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();
    try {
      const cliente = new ExpediaApiClient({ baseUrl: urlBase });
      const { accessToken } = await cliente.autenticar({ clientId: "test", clientSecret: "test" });

      sim.encolarReserva({
        hotelReservationId: "expedia-ack-1",
        expediaPropertyId: "p1",
        checkIn: "2027-08-01",
        checkOut: "2027-08-05",
        estado: "nueva",
      });

      // Primer pull: aplicamos la reserva a nuestro dominio.
      const primerPull = await cliente.recuperarReservas(accessToken);
      expect(primerPull.map((r) => r.hotelReservationId)).toContain("expedia-ack-1");

      async function existeYaAplicada(externalId: string): Promise<string | null> {
        const fila = await entorno.ejecutor().query<{ id: string }>(
          `SELECT id FROM ocupacion_unidad WHERE unidad_id = $1 AND canal_origen_id = $2 AND external_id = $3 AND estado <> 'cancelado'`,
          [unidadId, expediaCanalId, externalId],
        );
        return fila.rows[0]?.id ?? null;
      }

      const reserva1 = primerPull.find((r) => r.hotelReservationId === "expedia-ack-1")!;
      const yaAplicada1 = await existeYaAplicada(reserva1.hotelReservationId);
      expect(yaAplicada1).toBeNull();
      await crearReservaConfirmada(entorno.ejecutor(), {
        unidadId,
        rango: { inicio: reserva1.checkIn, fin: reserva1.checkOut },
        estado: "confirmado",
        bloqueante: true,
        canalOrigenId: expediaCanalId,
        externalId: reserva1.hotelReservationId,
      });

      // SIMULA "ack perdido": la confirmación (BookingConfirmRQ) nunca
      // llega a Expedia (falla de red, timeout, etc.) — Expedia sigue
      // reenviando la misma reserva en el siguiente pull (RV22 F09, mismo
      // patrón que Booking.com RV04 F07).
      const segundoPull = await cliente.recuperarReservas(accessToken);
      expect(segundoPull.map((r) => r.hotelReservationId)).toContain("expedia-ack-1");
      expect(sim.vecesReenviada("expedia-ack-1")).toBe(2);

      // Nuestra ingesta SIEMPRE debe comprobar si (canal, external_id) ya
      // se aplicó antes de volver a llamar crearReservaConfirmada —
      // idéntico criterio de recuperación de bookkeeping que el motor de
      // sync iCal (D-DSD-12, packages/adapters/src/sync/motor.ts).
      const yaAplicada2 = await existeYaAplicada("expedia-ack-1");
      expect(yaAplicada2).not.toBeNull();

      const conteo = await entorno.ejecutor().query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1 AND external_id = 'expedia-ack-1'`,
        [unidadId],
      );
      expect(Number(conteo.rows[0]!.n)).toBe(1);

      // Ahora sí confirmamos con éxito — deja de reenviarse.
      await cliente.confirmarReserva(accessToken, "expedia-ack-1");
      const tercerPull = await cliente.recuperarReservas(accessToken);
      expect(tercerPull.map((r) => r.hotelReservationId)).not.toContain("expedia-ack-1");
    } finally {
      await sim.detener();
    }
  });
});

describe("caso — el puente SiteMinder reexporta nuestro propio bloqueo como reserva entrante → anti-eco", () => {
  it("detectarEco reconoce el rango ya exportado (capa 3), sin necesitar el mismo UID/hash", async () => {
    const unidadId = await entorno.crearUnidad("puente-siteminder-anti-eco");
    const siteminderCanalId = entorno.canalIdPorCodigo.get("siteminder")!;

    // Una sola noche a propósito: pmsXchange (a diferencia de un VEVENT
    // iCal con rango completo) modela el cierre noche por noche
    // (`ActualizacionInventarioPmsXchange.fecha` es una sola fecha) — el
    // "eco" simulado hereda esa misma granularidad.
    await crearBloqueo(entorno.ejecutor(), {
      unidadId,
      rango: { inicio: "2027-09-01", fin: "2027-09-02" },
      razon: "BLOQUEO_PROPIETARIO",
    });

    // 1) Exportamos el cierre de disponibilidad HACIA el puente (registra
    // bloqueo_exportado para el canal 'siteminder', igual que el motor de
    // sync ya hace para cada canal iCal — el transporte real hacia
    // SiteMinder sería el push JSON de `SiteMinderPmsXchangeClient`, pero
    // el bookkeeping de "qué exportamos" es el mismo con cualquier
    // transporte).
    await exportarFeedParaCanal(
      { ejecutor: entorno.ejecutor(), unidadId, canalId: siteminderCanalId, zonaHorariaPropiedad: "America/Mexico_City" },
      "Unidad de prueba — puente SiteMinder",
    );

    const sim = new SiteMinderPmsXchangeSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();
    try {
      const cliente = new SiteMinderPmsXchangeClient({ baseUrl: urlBase });
      await cliente.empujarInventario("apikey-test", [
        { canalDestino: "EXP", unidadExternaId: unidadId, fecha: "2027-09-01", disponible: 0, cerrado: true },
      ]);

      // 2) El puente "reexporta" ese mismo cierre como si fuera una
      // reserva nueva entrante — el escenario adversarial exacto.
      sim.reexportarUltimoInventarioComoReserva("siteminder-eco-1");
      const reservasEntrantes = await cliente.recuperarReservas("apikey-test");
      const eco = reservasEntrantes.find((r) => r.id === "siteminder-eco-1")!;
      expect(eco).toBeDefined();

      // 3) Antes de aplicar esa "reserva" como un bloqueo nuevo, la
      // ingesta consulta qué canales ya tienen exportado exactamente ese
      // rango (capa 3 de detectarEco) — misma consulta que
      // `canalesExportadosDeRango` en packages/adapters/src/sync/motor.ts.
      // pmsXchange cierra noche por noche (una `fecha`, no un rango
      // check-in/check-out como iCal) — el "eco" trae la misma fecha en
      // checkIn/checkOut, así que la coincidencia se busca por
      // CONTENCIÓN de esa noche dentro del rango exportado, no por
      // igualdad exacta de rango.
      const filaCanales = await entorno.ejecutor().query<{ canal_id: string }>(
        `SELECT be.canal_id FROM bloqueo_exportado be
         JOIN ocupacion_unidad ou ON ou.id = be.ocupacion_unidad_id
         WHERE ou.unidad_id = $1 AND ou.rango @> $2::date`,
        [unidadId, eco.checkIn],
      );
      expect(filaCanales.rows.map((r) => r.canal_id)).toContain(siteminderCanalId);

      const resultado = detectarEco({
        uidEntrante: eco.id,
        // Hash deliberadamente DISTINTO al exportado — el eco puede llegar
        // sin el mismo UID/hash que nosotros generamos (a diferencia del
        // caso iCal, aquí el "reserva.id" lo inventa el puente, no
        // nuestro exportador) — la capa 3 (rango coincidente ya
        // exportado) es la que debe salvar este caso.
        hashContenidoEntrante: calcularHashContenido({ unidadId, dtstart: eco.checkIn, dtend: eco.checkOut, razon: "OTRO_HASH_NO_COINCIDENTE" }),
        hashesExportadosRecientes: [],
        canalesExportadosDeRangoCoincidente: filaCanales.rows.map((r) => r.canal_id),
      });

      expect(resultado.esEco).toBe(true);
      expect(resultado.capa).toBe(3);

      // El bloqueo original sigue siendo el único activo para esa unidad
      // — el eco nunca se convierte en una segunda ocupación.
      const activas = await entorno.ejecutor().query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado'`,
        [unidadId],
      );
      expect(Number(activas.rows[0]!.n)).toBe(1);
    } finally {
      await sim.detener();
    }
  });
});

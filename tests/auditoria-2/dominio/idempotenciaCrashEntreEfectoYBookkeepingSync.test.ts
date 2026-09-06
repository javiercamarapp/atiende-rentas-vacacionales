import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearReservaConfirmada } from "@atiende-rv/domain";
import { ejecutarCicloImport, contarBloqueosActivos } from "@atiende-rv/adapters";
import { AirbnbIcalChannelSimulator } from "@atiende-rv/sim";
import { crearEntornoAdversarial, feedIcsDePrueba, type EntornoAdversarial } from "../../adversarial/sync/entorno.js";

/**
 * Auditoría dominio/sincronización (fase 2) — invariante bajo ataque (5):
 * idempotencia por (canal, unidad, UID) (D-010, migración 0021,
 * restricción `UNIQUE (unidad_id, canal_id, uid_evento)` sobre
 * `evento_canal_importado`) ante un "crash" simulado entre aplicar el
 * efecto de dominio y registrar el bookkeeping de versión.
 *
 * `ejecutarCicloImport` (packages/adapters/src/sync/motor.ts, rama
 * "accion === 'aplicar'" / creación de reserva nueva, líneas ~317-330)
 * hace DOS escrituras separadas para un evento nuevo:
 *   1. `crearReservaConfirmada(ctx.ejecutor, {...})` — abre su PROPIO
 *      `BEGIN`/`COMMIT` interno (packages/domain/src/aplicacion/
 *      reservas.ts) y por lo tanto CONFIRMA la reserva en la base de
 *      datos de forma independiente.
 *   2. `upsertEventoImportado(ctx, entrante, creado.ocupacionId, ...)` —
 *      un INSERT/UPSERT posterior y SEPARADO sobre
 *      `evento_canal_importado`, la tabla que `resolverVersion` consulta
 *      en el SIGUIENTE ciclo para saber "¿ya vi este UID?".
 *
 * Si el proceso muere entre el COMMIT de (1) y el de (2) — el escenario
 * exacto que D-010 dice que el patrón outbox/bookkeeping debe neutralizar
 * — el reintento del MISMO ciclo (mismo UID, mismo feed) encuentra
 * `evento_canal_importado` SIN fila para ese UID. `resolverVersion(null,
 * entrante)` (packages/domain/src/resolucionVersion.ts línea 51) SIEMPRE
 * devuelve `"aplicar"` cuando no hay versión previa — así que
 * `ejecutarCicloImport` trata el UID como "nunca visto" y vuelve a llamar
 * `crearReservaConfirmada` con el MISMO rango de fechas.
 *
 * Esto NO produce una noche doblemente vendida (el `EXCLUDE` de
 * `ocupacion_unidad` sigue protegiendo esa noche), pero si produce un
 * efecto secundario incorrecto y visible para operación: una fila
 * `ocupacion_unidad` extra (`estado='conflicto_pendiente'`), una fila en
 * `conflicto_calendario` con `tipo='overbooking_confirmado'`, y un evento
 * `alerta_overbooking` en `outbox_evento` — TODO ello contra la reserva
 * consigo misma. Es una falsa alerta de overbooking generada por un
 * artefacto de la ventana de crash, no por una colisión real de dos
 * reservas distintas.
 */

let entorno: EntornoAdversarial;
let simulador: AirbnbIcalChannelSimulator;
let canalId: string;
let urlSimulador: string;

beforeAll(async () => {
  entorno = await crearEntornoAdversarial("atiende_rv_auditoria2_idempotencia_crash");
  canalId = entorno.canalIdPorCodigo.get("airbnb")!;
  simulador = new AirbnbIcalChannelSimulator({ credenciales: "test_solo_pruebas" });
  const info = await simulador.iniciar();
  urlSimulador = info.url;
}, 120_000);

afterAll(async () => {
  await simulador.detener();
  await entorno.cerrar();
});

async function contarOcupacionesTotales(unidadId: string): Promise<number> {
  const fila = await entorno.motor.ejecutor.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1`,
    [unidadId],
  );
  return Number(fila.rows[0]!.n);
}

async function contarConflictosOverbooking(unidadId: string): Promise<number> {
  const fila = await entorno.motor.ejecutor.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM conflicto_calendario WHERE unidad_id = $1 AND tipo = 'overbooking_confirmado'`,
    [unidadId],
  );
  return Number(fila.rows[0]!.n);
}

async function contarFilasBookkeeping(unidadId: string, uid: string): Promise<number> {
  const fila = await entorno.motor.ejecutor.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM evento_canal_importado WHERE unidad_id = $1 AND canal_id = $2 AND uid_evento = $3`,
    [unidadId, canalId, uid],
  );
  return Number(fila.rows[0]!.n);
}

describe("(5) idempotencia (canal, unidad, UID) ante crash entre efecto de dominio y bookkeeping de versión", () => {
  it("reintentar el mismo ciclo tras perder el bookkeeping de un UID ya aplicado NO debe duplicar el efecto ni generar una alerta de overbooking falsa", async () => {
    const unidadId = await entorno.crearUnidad("idempotencia-crash-bookkeeping");
    const uid = "crash-entre-efecto-y-bookkeeping@canal-externo.com";
    const rango = { inicio: "2028-03-01", fin: "2028-03-05" };

    // Paso 1: simula "el efecto de dominio ya se aplicó" (equivalente a lo
    // que motor.ts hace en la rama de creación de reserva nueva), PERO el
    // proceso "muere" justo antes de escribir el bookkeeping en
    // `evento_canal_importado` — nunca se llama `upsertEventoImportado`.
    const creado = await crearReservaConfirmada(entorno.ejecutor(), {
      unidadId,
      rango,
      estado: "confirmado",
      bloqueante: true,
      canalOrigenId: canalId,
      externalId: uid,
    });
    expect(creado.conflicto).toBeNull();
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(1);
    // Confirma la premisa del "crash": CERO bookkeeping para este UID.
    expect(await contarFilasBookkeeping(unidadId, uid)).toBe(0);

    // Paso 2: "el proceso se reinicia" y vuelve a correr el mismo ciclo de
    // sincronización desde cero, con el MISMO feed (mismo UID/SEQUENCE/
    // DTSTAMP/fechas) — el comportamiento esperado por D-010 es que
    // reprocesar un evento cuyo efecto YA se aplicó sea un no-op idempotente.
    simulador.definirEscenario({
      tipo: "ics",
      contenidoIcs: feedIcsDePrueba([
        { uid, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20280301", dtend: "20280305", status: "CONFIRMED" },
      ]),
    });
    const resultado = await ejecutarCicloImport(
      { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );
    expect(resultado.resultado).toBe("exito_con_eventos");

    // Invariante D-010 esperado: CERO conflictos generados por el
    // reproceso de un evento ya aplicado — el reintento debería ser
    // completamente transparente.
    expect(resultado.conflictosDetectados).toBe(0);
    expect(await contarConflictosOverbooking(unidadId)).toBe(0);

    // Invariante D-010 esperado: sigue existiendo exactamente UNA
    // ocupación total para esta unidad (la original), nunca una segunda
    // fila artefacto de la ventana de crash.
    expect(await contarOcupacionesTotales(unidadId)).toBe(1);
  });
});

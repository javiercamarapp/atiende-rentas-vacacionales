import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reconciliarCompleto, ejecutarCicloImport, contarBloqueosActivos, type UidActivoInterno } from "@atiende-rv/adapters";
import { AirbnbIcalChannelSimulator } from "@atiende-rv/sim";
import { crearEntornoAdversarial, feedIcsDePrueba, type EntornoAdversarial } from "../../adversarial/sync/entorno.js";

/**
 * Auditoría dominio/sincronización (fase 2) — invariante bajo ataque (4):
 *
 * RV07-R-06 (docs/investigacion/RV07-sincronizacion-overbooking.md línea
 * 171): "El sistema DEBE exponer, por canal y unidad, ... el drift
 * detectado en la última reconciliación completa". RV07 §15 (línea 134)
 * describe la reconciliación COMPLETA como "la defensa contra la pérdida
 * silenciosa de un evento CANCELLED/eliminado que un ciclo incremental
 * pudo no capturar" — comparando el conjunto de UIDs activos internamente
 * contra el conjunto de UIDs presentes en el feed más reciente; un UID que
 * desaparece SIN CANCEL explícito es "candidato a cancelación implícita".
 *
 * `reconciliarCompleto` (packages/adapters/src/sync/reconciliacion.ts
 * líneas 56-68) implementa exactamente esa comparación como función PURA
 * — y funciona correctamente en aislamiento (ver
 * packages/adapters/test/reconciliacion.test.ts). El campo
 * `drift_ultima_reconciliacion_completa` incluso existe en la tabla
 * `unidad_canal_feed` (migración 0021+, ver `persistirEstadoFeed` en
 * motor.ts) y `persistirEstadoFeed` acepta un parámetro `drift` opcional
 * para escribirlo.
 *
 * HALLAZGO A CONFIRMAR: `ejecutarCicloImport` (el ÚNICO punto de entrada
 * real de sincronización, packages/adapters/src/sync/motor.ts) llama a
 * `persistirEstadoFeed(ctx, nuevoEstado, nuevoEtag, nuevoLastModified)`
 * SIN el quinto argumento `drift` (motor.ts, dentro de
 * `ejecutarCicloImport`) — nunca calcula ni pasa un valor real. Y
 * `reconciliarCompleto` no tiene NINGÚN llamador en `motor.ts` ni en
 * ninguna ruta/worker de `apps/api/src` (confirmado por búsqueda: sus
 * únicos usos son pruebas unitarias y un script de carga). Por lo tanto:
 * un UID que un canal deja de listar SIN mandar CANCEL nunca se detecta
 * automáticamente en el sistema real — el drift nunca se computa ni se
 * expone, contradiciendo RV07-R-06, y el "candidato a cancelación
 * implícita" de RV07 §15 nunca llega a evaluarse porque nadie invoca la
 * función que lo calcula.
 *
 * Esta prueba demuestra las DOS mitades del hallazgo:
 *  (a) el efecto lateral SEGURO por defecto: la reserva cuyo UID desaparece
 *      del feed permanece activa para siempre (correcto per D-005 — nunca
 *      cancela unilateralmente sin pasar por reconciliación completa);
 *  (b) la ausencia total de detección: ni el pipeline real actualiza
 *      `drift_ultima_reconciliacion_completa` a un valor distinto de 0,
 *      pese a que, calculado de forma independiente con los MISMOS datos
 *      que el pipeline ya tiene disponibles, `reconciliarCompleto` sí
 *      detecta el drift = 1 correctamente.
 */

let entorno: EntornoAdversarial;
let simulador: AirbnbIcalChannelSimulator;
let canalId: string;
let urlSimulador: string;

beforeAll(async () => {
  entorno = await crearEntornoAdversarial("atiende_rv_auditoria2_reconciliacion");
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

async function obtenerDrift(unidadId: string): Promise<number | null> {
  const fila = await entorno.motor.ejecutor.query<{ drift: number | null }>(
    `SELECT drift_ultima_reconciliacion_completa AS drift FROM unidad_canal_feed WHERE unidad_id = $1 AND canal_id = $2`,
    [unidadId, canalId],
  );
  return fila.rows[0]?.drift ?? null;
}

describe("(4) reconciliación completa: silenciosamente ausente del pipeline real", () => {
  it("un UID que el canal deja de listar (sin CANCEL) permanece activo para siempre y el drift jamás se computa automáticamente", async () => {
    const unidadId = await entorno.crearUnidad("reconciliacion-drift");
    const uidQueDesaparece = "desaparece-sin-cancel@canal-externo.com";
    const uidQueSigue = "sigue-en-el-feed@canal-externo.com";

    // Ciclo 1: dos reservas activas reales, ambas de este canal.
    const r1 = await ciclo(
      unidadId,
      feedIcsDePrueba([
        { uid: uidQueDesaparece, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20281001", dtend: "20281005", status: "CONFIRMED" },
        { uid: uidQueSigue, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20281101", dtend: "20281105", status: "CONFIRMED" },
      ]),
    );
    expect(r1.resultado).toBe("exito_con_eventos");
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(2);
    expect(await obtenerDrift(unidadId)).toBe(0); // valor inicial, nada de drift todavía.

    // Ciclo 2 ("reconciliación" según el canal): el feed más reciente
    // SIGUE teniendo eventos (exito_con_eventos, no exito_vacio ni fallo),
    // pero uno de los dos UIDs simplemente ya no aparece — el canal lo
    // quitó de su calendario sin mandar STATUS:CANCELLED. Esto es
    // EXACTAMENTE el escenario que RV07 §15 describe como el motivo de
    // ser de la reconciliación completa.
    const r2 = await ciclo(
      unidadId,
      feedIcsDePrueba([
        { uid: uidQueSigue, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20281101", dtend: "20281105", status: "CONFIRMED" },
      ]),
    );
    expect(r2.resultado).toBe("exito_con_eventos");

    // (a) Efecto lateral SEGURO por defecto: nadie cancela unilateralmente
    // la reserva ausente — sigue contando como activa. Esto es correcto.
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(2);

    // (b) HALLAZGO: el pipeline real jamás computó el drift. Calculado de
    // forma independiente con los mismos datos que el sistema ya tiene
    // (evento_canal_importado para este canal/unidad vs. el UID presente
    // en el feed del ciclo 2), `reconciliarCompleto` SÍ detecta
    // correctamente que hay 1 discrepancia:
    const activosInternos: UidActivoInterno[] = [
      { ocupacionUnidadId: "irrelevante-para-el-cálculo-de-drift", uidCanal: uidQueDesaparece },
      { ocupacionUnidadId: "irrelevante-para-el-cálculo-de-drift", uidCanal: uidQueSigue },
    ];
    const resultadoPuroIndependiente = reconciliarCompleto(activosInternos, new Set([uidQueSigue]));
    expect(resultadoPuroIndependiente.drift).toBe(1);
    expect(resultadoPuroIndependiente.candidatosACancelarPorAusencia.map((c) => c.uidCanal)).toEqual([
      uidQueDesaparece,
    ]);

    // Pero RV07-R-06 promete que el SISTEMA (no una llamada manual aislada
    // en una prueba) expone ese drift por canal/unidad. La columna
    // `drift_ultima_reconciliacion_completa` que persiste exactamente ese
    // dato sigue en 0 tras el ciclo 2, porque `ejecutarCicloImport` nunca
    // invoca `reconciliarCompleto` ni le pasa un valor de `drift` a
    // `persistirEstadoFeed` — la función que sí sabe calcular el drift
    // real nunca se ejecuta en el camino de producción.
    expect(await obtenerDrift(unidadId)).toBe(1);
  });
});

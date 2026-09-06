import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearReservaConfirmada } from "@atiende-rv/domain";
import { ejecutarCicloImport, contarBloqueosActivos } from "@atiende-rv/adapters";
import { AirbnbIcalChannelSimulator } from "@atiende-rv/sim";
import { crearEntornoAdversarial, feedIcsDePrueba, type EntornoAdversarial } from "../../adversarial/sync/entorno.js";

/**
 * Auditoría dominio/sincronización (fase 2) — invariante bajo ataque:
 * D-005/cuarentena.ts (packages/adapters/src/sync/cuarentena.ts línea 111)
 * promete (comentario líneas 44-48 del mismo archivo): "un feed que parsea
 * correctamente con 0 eventos, cuando PREVIAMENTE SÍ TENÍA EVENTOS ACTIVOS
 * de ese canal, genera una alerta informativa" (tipo 'vacio_inesperado').
 *
 * El campo que activa esa alerta es `opciones.huboEventosActivosPreviamente`
 * — pero quien lo calcula es `motor.ts` línea 263:
 *
 *   huboEventosActivosPreviamente: estadoPrevio.ultimaSincronizacionExitosaEn !== null,
 *
 * Eso NO es "hubo eventos activos previamente": es "hubo ALGÚN ciclo
 * exitoso previo, sea cual sea su resultado" — y `aplicarResultadoCiclo`
 * (cuarentena.ts líneas 96-104) fija `ultimaSincronizacionExitosaEn` en
 * CUALQUIER ciclo `exito_vacio`/`exito_con_eventos`, incluido el propio
 * `exito_vacio`. Consecuencia: una unidad cuyo canal JAMÁS tuvo una sola
 * reserva real (feed legítimamente vacío ciclo tras ciclo) dispara la
 * alerta "vacío inesperado" en el SEGUNDO ciclo en adelante — una falsa
 * alarma operativa recurrente para el caso más común y más inocuo
 * (unidad recién conectada a un canal, sin reservas todavía), degradando
 * la utilidad real de la alerta para el caso que sí importa.
 *
 * Caso A (control, debe PASAR): canal realmente poblado → vacío real:
 * preserva las reservas y sí alerta — comportamiento correcto documentado.
 *
 * Caso B (ataque, se espera que FALLE): canal que NUNCA tuvo eventos
 * activos, dos ciclos `exito_vacio` seguidos → NO debería alertar (nada
 * "inesperado" ocurrió), pero el código real sí alerta.
 */

let entorno: EntornoAdversarial;
let simulador: AirbnbIcalChannelSimulator;
let canalId: string;
let urlSimulador: string;

beforeAll(async () => {
  entorno = await crearEntornoAdversarial("atiende_rv_auditoria2_cuarentena_vacio");
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

// Nota: el simulador (`ServidorIcalSimulado`) calcula ETag por hash del
// cuerpo y responde 304 si el cliente manda el mismo `If-None-Match` que
// la respuesta anterior. Para forzar dos ciclos `exito_vacio` REALES
// (no `no_modificado` por caché HTTP legítima) cada feed "vacío" lleva una
// propiedad no estándar distinta fuera de cualquier VEVENT — el parser la
// ignora (tolerancia a campos desconocidos fuera de VEVENT) pero cambia el
// hash/ETag byte a byte.
function feedVacioValido(discriminador: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nX-AUDITORIA-DISCRIMINADOR:${discriminador}\r\nEND:VCALENDAR\r\n`;
}

describe("Caso A (control) — canal realmente poblado que pasa a vacío: preserva y alerta", () => {
  it("un canal con reserva activa que en el ciclo siguiente vuelve exito_vacio conserva la reserva y emite 'vacio_inesperado'", async () => {
    const unidadId = await entorno.crearUnidad("cuarentena-poblado-a-vacio");
    const uid = "poblado-a-vacio@canal-externo.com";

    const r1 = await ciclo(
      unidadId,
      feedIcsDePrueba([
        { uid, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20280601", dtend: "20280605", status: "CONFIRMED" },
      ]),
    );
    expect(r1.resultado).toBe("exito_con_eventos");
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(1);

    const r2 = await ciclo(unidadId, feedVacioValido("caso-a"));

    expect(r2.resultado).toBe("exito_vacio");
    // Invariante D-005: nunca libera disponibilidad ante un vacío.
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(1);
    // Invariante D-005 (comentario cuarentena.ts:44-48): sí debe alertar.
    expect(r2.alertaCuarentena?.tipo).toBe("vacio_inesperado");
  });
});

describe("Caso B (ataque) — canal que NUNCA tuvo eventos activos: falso positivo de 'vacio_inesperado'", () => {
  it("dos ciclos exito_vacio consecutivos en una unidad sin historial de eventos NO deberían generar alerta 'vacio_inesperado'", async () => {
    const unidadId = await entorno.crearUnidad("cuarentena-siempre-vacio");

    const r1 = await ciclo(unidadId, feedVacioValido("caso-b-1"));
    expect(r1.resultado).toBe("exito_vacio");
    // Primer ciclo: correctamente sin alerta (nada previo con qué comparar).
    expect(r1.alertaCuarentena).toBeNull();
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(0);

    const r2 = await ciclo(unidadId, feedVacioValido("caso-b-2"));
    expect(r2.resultado).toBe("exito_vacio");

    // HALLAZGO: `huboEventosActivosPreviamente` en motor.ts (línea 263) se
    // calcula como "¿hubo ALGÚN sync exitoso antes?" en vez de "¿hubo
    // EVENTOS ACTIVOS antes?" — el primer exito_vacio ya fijó
    // `ultimaSincronizacionExitosaEn`, así que este segundo ciclo
    // (igualmente vacío, canal que nunca tuvo una sola reserva) dispara
    // una alerta "vacío inesperado" que es un FALSO POSITIVO: no hay nada
    // inesperado en que un canal sin reservas siga sin reservas.
    expect(r2.alertaCuarentena).toBeNull();
  });
});

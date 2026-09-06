import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearMotorEmbeddedPostgres, aplicarMigraciones, migraciones, type MotorEmbeddedPostgres } from "@atiende-rv/db";
import type { EjecutorTransaccional } from "@atiende-rv/domain";
import { ejecutarCicloImport } from "@atiende-rv/adapters";
import { AirbnbIcalChannelSimulator } from "@atiende-rv/sim";

/**
 * Auditoría adversarial independiente — dominio/sync/datos (fase 2).
 *
 * Hipótesis: `packages/adapters/src/ical/parser.ts` función
 * `calcularDtendDesdeDuration` (líneas 154-186) acepta sintácticamente
 * cualquier `DURATION` que cumpla el ABNF de RFC 5545 §3.3.6, incluyendo
 * signo negativo explícito (`-P1D`) o duración cero (`PT0S`). Cuando
 * `DTSTART` es de tipo `DATE` (el caso típico de un feed de
 * disponibilidad), la función solo suma `totalDias` (nunca
 * `totalSegundos`) — así que una duración negativa produce un `DTEND`
 * ANTERIOR a `DTSTART`, un rango invertido que el parser nunca valida.
 *
 * Ese rango inválido llega intacto a `packages/adapters/src/sync/motor.ts`
 * función `extraerRango` (líneas 205-210). Ejecución real (ver evidencia
 * abajo): el fallo ni siquiera llega a la capa de dominio
 * (`requireRangoValido`/`esRangoValido` en
 * packages/domain/src/aplicacion/reservas.ts) — revienta ANTES, en
 * `canalesExportadosDeRango` (motor.ts líneas 192-202), que arma
 * `daterange($2, $3, '[)')` directamente en SQL con el rango invertido sin
 * pasar por ninguna validación de dominio. Postgres rechaza el
 * `daterange()` con el error crudo de motor `22000 "range lower bound must
 * be less than or equal to range upper bound"`, y esa excepción sale sin
 * capturar del bucle `for (const evento of eventos)` de
 * `ejecutarCicloImport` (motor.ts líneas 283-377): no hay ningún
 * `try/catch` por evento en todo el bucle. La excepción se propaga fuera
 * de `ejecutarCicloImport` completo, antes de que la reserva pueda
 * siquiera intentarse y sin traducir el error a nada accionable.
 *
 * Comportamiento esperado (correcto, degradación razonable): un evento
 * sintácticamente aceptado por el parser pero semánticamente inválido
 * (rango invertido/vacío) debería descartarse individualmente —
 * análogo a como se maneja un evento con UID reciclado o un eco— dejando
 * que el resto de eventos válidos del MISMO feed se apliquen con
 * normalidad, y dejando alguna señal (contador, log, outbox) de que ese
 * evento puntual se descartó.
 *
 * Comportamiento real observado: un solo evento con `DURATION` negativa
 * en medio del feed aborta el ciclo completo — ni siquiera se procesan
 * los eventos que venían DESPUÉS de él en el mismo feed, y la promesa de
 * `ejecutarCicloImport` se rechaza en vez de resolver con un resumen
 * parcial. Esto convierte un solo evento malformado de un canal externo
 * en una denegación de servicio de sincronización para TODA la unidad en
 * ese ciclo (incluyendo reservas legítimas que sí venían en el mismo
 * feed), sin ningún aviso estructurado más allá de una excepción cruda.
 */
describe("DURATION negativa/cero en un evento del feed rompe el ciclo de import completo", () => {
  let motor: MotorEmbeddedPostgres;
  let ejecutor: EjecutorTransaccional;
  let simulador: AirbnbIcalChannelSimulator;
  let urlSimulador: string;
  let canalId: string;
  let unidadId: string;

  beforeAll(async () => {
    motor = await crearMotorEmbeddedPostgres("atiende_rv_auditoria2_duracion_invalida");
    ejecutor = motor.ejecutor as unknown as EjecutorTransaccional;
    await aplicarMigraciones(ejecutor, migraciones);

    const tenant = await ejecutor.query<{ id: string }>(
      `INSERT INTO tenant (nombre) VALUES ('Tenant auditoria-2 duracion invalida') RETURNING id`,
    );
    const propiedad = await ejecutor.query<{ id: string }>(
      `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop duracion invalida', 'America/Mexico_City') RETURNING id`,
      [tenant.rows[0]!.id],
    );
    const unidad = await ejecutor.query<{ id: string }>(
      `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad duracion invalida') RETURNING id`,
      [propiedad.rows[0]!.id],
    );
    unidadId = unidad.rows[0]!.id;

    const canal = await ejecutor.query<{ id: string }>(`SELECT id FROM canal WHERE codigo = 'airbnb'`);
    canalId = canal.rows[0]!.id;

    simulador = new AirbnbIcalChannelSimulator({ credenciales: "test_solo_pruebas" });
    const info = await simulador.iniciar();
    urlSimulador = info.url;
  }, 120_000);

  afterAll(async () => {
    await simulador.detener();
    await motor.cerrar();
  });

  /** Feed manual (no usa el helper `feedIcsDePrueba` de
   * tests/adversarial/sync/entorno.ts, que no soporta DURATION): tres
   * VEVENT con DTSTART;VALUE=DATE — el del medio con DURATION negativa. */
  function feedConEventoMalformadoEnMedio(): string {
    return (
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Auditoria//EN\r\n` +
      `BEGIN:VEVENT\r\nUID:bueno-antes@auditoria2.test\r\nDTSTAMP:20270101T000000Z\r\n` +
      `DTSTART;VALUE=DATE:20270601\r\nDTEND;VALUE=DATE:20270603\r\nEND:VEVENT\r\n` +
      `BEGIN:VEVENT\r\nUID:malformado-duracion-negativa@auditoria2.test\r\nDTSTAMP:20270101T000000Z\r\n` +
      `DTSTART;VALUE=DATE:20270610\r\nDURATION:-P1D\r\nEND:VEVENT\r\n` +
      `BEGIN:VEVENT\r\nUID:bueno-despues@auditoria2.test\r\nDTSTAMP:20270101T000000Z\r\n` +
      `DTSTART;VALUE=DATE:20270620\r\nDTEND;VALUE=DATE:20270622\r\nEND:VEVENT\r\n` +
      `END:VCALENDAR\r\n`
    );
  }

  it("los dos eventos válidos del feed deberían aplicarse aunque el evento intermedio tenga un rango invertido", async () => {
    simulador.definirEscenario({ tipo: "ics", contenidoIcs: feedConEventoMalformadoEnMedio() });

    const promesaCiclo = ejecutarCicloImport(
      { ejecutor, unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );

    // Comportamiento correcto esperado: el ciclo se completa, descarta el
    // evento con rango inválido y aplica los otros dos.
    await expect(promesaCiclo).resolves.toMatchObject({ eventosAplicados: 2 });

    const activas = await ejecutor.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado'`,
      [unidadId],
    );
    expect(Number(activas.rows[0]!.n)).toBe(2);
  });
});

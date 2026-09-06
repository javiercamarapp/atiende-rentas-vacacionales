import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBloqueo, type EjecutorTransaccional } from "@atiende-rv/domain";
import { aplicarMigraciones, crearMotorEmbeddedPostgres, migraciones, type MotorEmbeddedPostgres } from "@atiende-rv/db";
import { ejecutarCicloImport, exportarFeedParaCanal, contarBloqueosActivos } from "@atiende-rv/adapters";
import { AirbnbIcalChannelSimulator, VrboIcalChannelSimulator } from "@atiende-rv/sim";

/**
 * D-nn — auditoría dominio/sincronización/datos (fase 2).
 *
 * D-004 promete explícitamente cubrir el eco CRUZADO entre canales: "puede
 * reexponer en su propio feed de export un bloqueo que en realidad
 * proviene de nuestro propio export hacia él (O DE OTRO CANAL A TRAVÉS DE
 * ÉL)" — el ejemplo del enunciado de esta auditoría es exactamente:
 * exportamos un bloqueo a Airbnb; el propietario también conectó Vrbo para
 * importar el calendario de Airbnb (fuera de nuestro sistema); Vrbo lo
 * reexpone en SU propio feed de export; nosotros lo importamos de Vrbo.
 *
 * Las 3 capas de anti-eco (packages/adapters/src/sync/antiEco.ts) dependen
 * todas de una coincidencia con el CANAL de destino original:
 *   - Capa 1 (UID propio): Vrbo probablemente no preserva nuestro UID al
 *     reexportar contenido importado de otra fuente (D-004, sin evidencia
 *     primaria de lo contrario) — se simula aquí con un UID nuevo generado
 *     por "Vrbo".
 *   - Capa 2 (hash exportado reciente): `hashesExportadosRecientes`
 *     (packages/adapters/src/sync/motor.ts líneas 182-190) filtra
 *     `WHERE be.canal_id = $2` — el canal que estamos importando AHORA
 *     (Vrbo), no todos los canales a los que se exportó. Como el bloqueo
 *     se exportó a Airbnb, no a Vrbo, esta capa nunca ve el hash.
 *   - Capa 3 (metadato exportado_a): `canalesExportadosDeRango`
 *     (mismo archivo, líneas 192-203) sí trae TODOS los canales a los que
 *     se exportó ese rango exacto, pero `detectarEco` solo lo usa para
 *     comprobar si el canal ACTUAL (Vrbo) está en esa lista — y no lo está
 *     (se exportó a Airbnb, no a Vrbo).
 *
 * Resultado esperado si el hallazgo es real: el evento "rebotado" por Vrbo
 * NO se detecta como eco y se aplica como una reserva nueva de canal
 * (crearReservaConfirmada dentro de ejecutarCicloImport), duplicando el
 * bloqueo original bajo un canal_origen distinto.
 */

let motor: MotorEmbeddedPostgres;
let ejecutor: EjecutorTransaccional;
let tenantId: string;
let canalAirbnbId: string;
let canalVrboId: string;
let simuladorAirbnb: AirbnbIcalChannelSimulator;
let simuladorVrbo: VrboIcalChannelSimulator;
let urlAirbnb: string;
let urlVrbo: string;

beforeAll(async () => {
  motor = await crearMotorEmbeddedPostgres("atiende_rv_auditoria2_eco_cruzado");
  await aplicarMigraciones(motor.ejecutor, migraciones);
  ejecutor = motor.ejecutor as unknown as EjecutorTransaccional;

  const tenant = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant auditoria-2 eco cruzado') RETURNING id`,
  );
  tenantId = tenant.rows[0]!.id;

  const canales = await motor.ejecutor.query<{ id: string; codigo: string }>(`SELECT id, codigo FROM canal`);
  canalAirbnbId = canales.rows.find((c) => c.codigo === "airbnb")!.id;
  canalVrboId = canales.rows.find((c) => c.codigo === "vrbo")!.id;

  simuladorAirbnb = new AirbnbIcalChannelSimulator({ credenciales: "test_solo_pruebas" });
  simuladorVrbo = new VrboIcalChannelSimulator({ credenciales: "test_solo_pruebas" });
  urlAirbnb = (await simuladorAirbnb.iniciar()).url;
  urlVrbo = (await simuladorVrbo.iniciar()).url;
}, 120_000);

afterAll(async () => {
  await simuladorAirbnb.detener();
  await simuladorVrbo.detener();
  await motor.cerrar();
});

async function crearUnidad(nombre: string): Promise<string> {
  const propiedad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, $2, 'America/Mexico_City') RETURNING id`,
    [tenantId, `Propiedad ${nombre}`],
  );
  const unidad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, $2) RETURNING id`,
    [propiedad.rows[0]!.id, nombre],
  );
  return unidad.rows[0]!.id;
}

describe("D-nn — anti-eco NO detecta eco cruzado entre canales (D-004)", () => {
  it("bloqueo exportado a Airbnb, rebotado de vuelta vía el feed de Vrbo con UID propio de Vrbo: se cuela como reserva nueva", async () => {
    const unidadId = await crearUnidad("eco-cruzado");

    // 1) Bloqueo interno de propietario, exportado a Airbnb.
    await crearBloqueo(ejecutor, {
      unidadId,
      rango: { inicio: "2027-10-01", fin: "2027-10-05" },
      razon: "BLOQUEO_PROPIETARIO",
    });
    const antes = await contarBloqueosActivos(ejecutor, unidadId);

    await exportarFeedParaCanal(
      { ejecutor, unidadId, canalId: canalAirbnbId, zonaHorariaPropiedad: "America/Mexico_City" },
      "Unidad de prueba eco cruzado",
    );

    // 2) Vrbo "rebota" el mismo rango (lo importó de Airbnb fuera de
    // nuestro sistema) con SU PROPIO UID recién generado, sin preservar el
    // namespace propio ni el hash exacto de exportación (Vrbo reconstruye
    // su propio VEVENT al reexportar, escenario D-004 "o de otro canal a
    // través de él").
    simuladorVrbo.definirEscenario({
      tipo: "ics",
      contenidoIcs:
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Vrbo//EN\r\n" +
        "BEGIN:VEVENT\r\nUID:vrbo-rebote-000111@vrbo.com\r\nDTSTAMP:20270901T000000Z\r\n" +
        "DTSTART;VALUE=DATE:20271001\r\nDTEND;VALUE=DATE:20271005\r\n" +
        "SUMMARY:Blocked\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
    });

    const resultado = await ejecutarCicloImport(
      { ejecutor, unidadId, canalId: canalVrboId, zonaHorariaPropiedad: "America/Mexico_City" },
      { url: urlVrbo, resolverPersonalizado: simuladorVrbo.resolverPersonalizado, permitirHttpSimuladorLocal: true },
    );

    const despues = await contarBloqueosActivos(ejecutor, unidadId);

    console.log(
      `[ECO-CRUZADO] antes=${antes} despues=${despues} ecos_descartados=${resultado.ecosDescartados} ` +
        `eventos_aplicados=${resultado.eventosAplicados} conflictos=${resultado.conflictosDetectados}`,
    );

    // Comportamiento prometido por D-004: el rebote cruzado debería
    // detectarse como eco y NO crear una reserva/bloqueo nuevo.
    expect(resultado.ecosDescartados).toBe(1);
    expect(resultado.eventosAplicados).toBe(0);
    expect(despues).toBe(antes);
  });
});

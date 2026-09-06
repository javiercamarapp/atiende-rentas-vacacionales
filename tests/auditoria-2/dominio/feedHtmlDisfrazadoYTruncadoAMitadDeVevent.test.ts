import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ejecutarCicloImport, contarBloqueosActivos } from "@atiende-rv/adapters";
import { AirbnbIcalChannelSimulator } from "@atiende-rv/sim";
import { crearEntornoAdversarial, feedIcsDePrueba, type EntornoAdversarial } from "../../adversarial/sync/entorno.js";

/**
 * Auditoría dominio/sincronización (fase 2) — invariantes bajo ataque:
 *
 * (2) Un GET 200 cuyo cuerpo es HTML (no iCal) — típico de un WAF/captive
 *     portal, una página de error 404/503 servida con status 200, o un
 *     login gate — ¿se clasifica como `fallo_parseo` (cuarentena, D-005) o
 *     se cuela como `exito_vacio` (0 VEVENT) por un parseo demasiado
 *     tolerante? `fetchIcsSeguro` (packages/adapters/src/net/fetchSsrf.ts)
 *     NO valida `Content-Type` — cualquier cuerpo de un 200 llega tal cual
 *     a `parsearIcs` (packages/adapters/src/ical/parser.ts). El único
 *     guardián es la validación estructural de `parsearIcs` (líneas
 *     ~255-268: primera línea debe ser `BEGIN:VCALENDAR`).
 *
 * (3) Un cuerpo truncado a mitad de un VEVENT (corte de red/timeout de
 *     transferencia a mitad de la respuesta) — ¿el parser rechaza todo el
 *     documento (`IcsParseError` → `fallo_parseo` → cuarentena, atómico) o
 *     aplica silenciosamente los eventos completos y descarta el resto sin
 *     avisar, perdiendo p. ej. un CANCEL que iba en la parte truncada?
 *     `parsearIcs` (líneas ~301-311) valida al final que la pila de
 *     componentes abiertos esté vacía (`BEGIN`/`END` balanceados) — un
 *     VEVENT sin su `END:VEVENT` deja la pila con `VEVENT` (y `VCALENDAR`)
 *     sin cerrar, así que TODO el documento debería rechazarse, nunca una
 *     aplicación parcial.
 *
 * Ambas se prueban de punta a punta contra Postgres real (no solo el
 * parser aislado) para confirmar que el resultado de clasificación
 * (`ResultadoCicloFetch`) y el efecto sobre `ocupacion_unidad` son
 * consistentes con lo prometido en D-005/RV07-R-05.
 */

let entorno: EntornoAdversarial;
let simulador: AirbnbIcalChannelSimulator;
let canalId: string;
let urlSimulador: string;

beforeAll(async () => {
  entorno = await crearEntornoAdversarial("atiende_rv_auditoria2_html_truncado");
  canalId = entorno.canalIdPorCodigo.get("airbnb")!;
  simulador = new AirbnbIcalChannelSimulator({ credenciales: "test_solo_pruebas" });
  const info = await simulador.iniciar();
  urlSimulador = info.url;
}, 120_000);

afterAll(async () => {
  await simulador.detener();
  await entorno.cerrar();
});

async function ciclo(unidadId: string, contenido: string) {
  simulador.definirEscenario({ tipo: "ics", contenidoIcs: contenido });
  return ejecutarCicloImport(
    { ejecutor: entorno.ejecutor(), unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
    { url: urlSimulador, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true },
  );
}

// Página de error típica servida con HTTP 200 por un WAF/CDN (Cloudflare
// "Attention Required" / captive portal corporativo) — un caso real
// documentado de canales OTA detrás de CDNs devolviendo HTML con 200 en
// vez de un 5xx franco.
const PAGINA_HTML_DISFRAZADA = [
  "<!DOCTYPE html>",
  '<html lang="en"><head><meta charset="utf-8">',
  "<title>Attention Required! | Cloudflare</title></head>",
  '<body><div id="cf-wrapper"><h1>Sorry, you have been blocked</h1>',
  '<p>You are unable to access this content. Ref: <a href="https://example.com/error/12345">12345</a></p>',
  "</div></body></html>",
].join("\n");

describe("(2) HTML servido con 200 en vez del feed iCal", () => {
  it("una unidad con reserva activa que recibe HTML disfrazado de feed entra en fallo_parseo, nunca en exito_vacio, y preserva la reserva", async () => {
    const unidadId = await entorno.crearUnidad("html-disfrazado");
    const uid = "html-disfrazado@canal-externo.com";

    const r1 = await ciclo(
      unidadId,
      feedIcsDePrueba([
        { uid, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20280701", dtend: "20280705", status: "CONFIRMED" },
      ]),
    );
    expect(r1.resultado).toBe("exito_con_eventos");
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(1);

    const r2 = await ciclo(unidadId, PAGINA_HTML_DISFRAZADA);

    // Invariante D-005/RV07-R-05: un cuerpo que no es un iCal válido NUNCA
    // debe leerse como "el canal no tiene reservas" (exito_vacio).
    expect(r2.resultado).toBe("fallo_parseo");
    expect(r2.eventosAplicados).toBe(0);
    // La reserva ya importada debe permanecer intacta bajo cuarentena.
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(1);
  });
});

describe("(3) feed truncado a mitad de un VEVENT (corte de transferencia)", () => {
  it("un segundo VEVENT (un CANCEL) cortado a la mitad hace fallar TODO el ciclo, sin aplicar ni descartar nada silenciosamente", async () => {
    const unidadId = await entorno.crearUnidad("truncado-mitad-vevent");
    const uidA = "truncado-a@canal-externo.com";
    const uidB = "truncado-b@canal-externo.com";

    // Ciclo 1: dos reservas activas reales, A y B.
    const r1 = await ciclo(
      unidadId,
      feedIcsDePrueba([
        { uid: uidA, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20280801", dtend: "20280805", status: "CONFIRMED" },
        { uid: uidB, sequence: 1, dtstamp: "20270101T000000Z", dtstart: "20280901", dtend: "20280905", status: "CONFIRMED" },
      ]),
    );
    expect(r1.resultado).toBe("exito_con_eventos");
    expect(r1.eventosAplicados).toBe(2);
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(2);

    // Ciclo 2: el canal manda un CANCEL completo de A seguido de un CANCEL
    // de B truncado a mitad de VEVENT (falta END:VEVENT y END:VCALENDAR —
    // corte de red/timeout de transferencia real).
    const feedCompleto =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n" +
      `BEGIN:VEVENT\r\nUID:${uidA}\r\nDTSTAMP:20270201T000000Z\r\n` +
      "DTSTART;VALUE=DATE:20280801\r\nDTEND;VALUE=DATE:20280805\r\n" +
      "SEQUENCE:2\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n" +
      `BEGIN:VEVENT\r\nUID:${uidB}\r\nDTSTAMP:20270201T000000Z\r\n` +
      "DTSTART;VALUE=DATE:20280901\r\nDTEND;VALUE=DATE:20280905\r\n" +
      "SEQUENCE:2\r\nSTATUS:CAN"; // <-- corte literal a mitad de la línea STATUS del segundo VEVENT

    const r2 = await ciclo(unidadId, feedCompleto);

    // Invariante: rechazo atómico, nunca aplicación parcial. Si el parser
    // aceptara silenciosamente el primer VEVENT completo (CANCEL de A) y
    // descartara el segundo truncado sin avisar, el ciclo terminaría en
    // 'exito_con_eventos' con 1 evento aplicado (A cancelado) y B seguiría
    // activo SIN que nadie se entere de que el feed llegó incompleto —
    // exactamente el escenario de "se pierde un CANCEL silenciosamente"
    // que el diseño de cuarentena existe para prevenir.
    expect(r2.resultado).toBe("fallo_parseo");
    expect(r2.eventosAplicados).toBe(0);

    // Ninguna de las dos reservas debe haberse tocado: ni A cancelada por
    // aplicación parcial, ni B afectada.
    expect(await contarBloqueosActivos(entorno.ejecutor(), unidadId)).toBe(2);
  });
});

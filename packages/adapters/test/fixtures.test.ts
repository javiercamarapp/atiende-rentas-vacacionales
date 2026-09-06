import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsearIcs, IcsParseError } from "../src/ical/parser.js";
import { resolverVersion, calcularHashContenido } from "@atiende-rv/domain";

/**
 * Fixtures grabados de `.ics` reales/representativos por canal y por
 * escenario adversarial (H-... §Operación-4, LOTES.md: "fixtures
 * grabados"), en `tests/fixtures/canales/` — carpeta exclusiva del Lote 2.
 */
function leerFixture(nombre: string): string {
  const ruta = fileURLToPath(new URL(`../../../tests/fixtures/canales/${nombre}`, import.meta.url));
  return readFileSync(ruta, "utf8");
}

describe("fixtures grabados — feeds .ics reales por canal", () => {
  it("airbnb-basico.ics parsea con el formato real de PRODID de Airbnb", () => {
    const resultado = parsearIcs(leerFixture("airbnb-basico.ics"));
    expect(resultado.eventos).toHaveLength(1);
    expect(resultado.eventos[0]!.summary).toBe("Reserved");
  });

  it("vrbo-basico.ics parsea con el formato real de PRODID de Vrbo", () => {
    const resultado = parsearIcs(leerFixture("vrbo-basico.ics"));
    expect(resultado.eventos).toHaveLength(1);
    expect(resultado.eventos[0]!.dtstart).toEqual({ tipo: "DATE", fecha: "2027-09-01" });
  });

  it("vacio.ics es sintácticamente válido con 0 eventos (caso adversarial 10)", () => {
    expect(parsearIcs(leerFixture("vacio.ics")).eventos).toHaveLength(0);
  });

  it("malformado.ics se rechaza con IcsParseError (caso adversarial 9)", () => {
    expect(() => parsearIcs(leerFixture("malformado.ics"))).toThrow(IcsParseError);
  });
});

describe("fixtures grabados — escenarios adversariales de resolución de versión", () => {
  function versionDeFixture(nombreArchivo: string) {
    const evento = parsearIcs(leerFixture(nombreArchivo)).eventos[0]!;
    const dtstart = evento.dtstart.tipo === "DATE" ? evento.dtstart.fecha : "";
    const dtend = evento.dtend.tipo === "DATE" ? evento.dtend.fecha : "";
    // Mismo criterio que `motor.ts` (hash de VERSIÓN, no el de anti-eco):
    // un CANCELLED sobre el mismo rango es contenido distinto de un
    // CONFIRMED/TENTATIVE con ese mismo rango.
    const razon = evento.status === "CANCELLED" ? "RESERVA_CANAL:CANCELLED" : "RESERVA_CANAL";
    return {
      uid: evento.uid,
      sequence: evento.sequence,
      dtstamp: evento.dtstamp,
      hash: calcularHashContenido({ unidadId: "unidad-fixture", dtstart, dtend, razon }),
    };
  }

  it("uid-reciclado-v1/v2: SEQUENCE mayor pero DTSTAMP anterior con contenido distinto → revisar_uid_reciclado (caso 13)", () => {
    const v1 = versionDeFixture("uid-reciclado-v1.ics");
    const v2 = versionDeFixture("uid-reciclado-v2.ics");
    const resultado = resolverVersion(v1, v2);
    expect(resultado.accion).toBe("revisar_uid_reciclado");
  });

  it("sequence-retrocedida: un CANCEL con SEQUENCE menor que el evento vigente se descarta (caso 3)", () => {
    const vigente = versionDeFixture("sequence-retrocedida-v1.ics");
    const cancelFueraDeOrden = versionDeFixture("sequence-retrocedida-v2-cancel.ics");
    const resultado = resolverVersion(vigente, cancelFueraDeOrden);
    expect(resultado.accion).toBe("descartar");
  });

  it("modificacion-fechas-v1/v2: mismo UID, rango distinto, DTSTAMP más reciente → aplicar (caso 4)", () => {
    const original = versionDeFixture("modificacion-fechas-v1.ics");
    const modificado = versionDeFixture("modificacion-fechas-v2.ics");
    const resultado = resolverVersion(original, modificado);
    expect(resultado.accion).toBe("aplicar");
  });

  it("cancelacion.ics tras modificacion-fechas-v2: SEQUENCE mayor, se aplica el CANCELLED", () => {
    const modificado = versionDeFixture("modificacion-fechas-v2.ics");
    const cancelacion = versionDeFixture("cancelacion.ics");
    const resultado = resolverVersion(modificado, cancelacion);
    expect(resultado.accion).toBe("aplicar");
    expect(parsearIcs(leerFixture("cancelacion.ics")).eventos[0]!.status).toBe("CANCELLED");
  });
});

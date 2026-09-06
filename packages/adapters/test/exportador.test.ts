import { describe, expect, it } from "vitest";
import { exportarFeedIcs, esUidNamespacePropio, construirUidExportado } from "../src/ical/exportador.js";
import { parsearIcs } from "../src/ical/parser.js";

describe("exportarFeedIcs (H-026)", () => {
  it("genera un .ics parseable por nuestro propio parser, con UID namespaced", () => {
    const { contenidoIcs } = exportarFeedIcs("Unidad de prueba", [
      {
        ocupacionUnidadId: "00000000-0000-0000-0000-000000000001",
        unidadId: "unidad-1",
        rango: { inicio: "2027-02-01", fin: "2027-02-05" },
        razon: "RESERVA_CANAL",
        sequence: 0,
      },
    ]);

    const parseado = parsearIcs(contenidoIcs);
    expect(parseado.eventos).toHaveLength(1);
    const ev = parseado.eventos[0]!;
    expect(esUidNamespacePropio(ev.uid)).toBe(true);
    expect(ev.uid).toBe(construirUidExportado("00000000-0000-0000-0000-000000000001"));
    expect(ev.dtstart).toEqual({ tipo: "DATE", fecha: "2027-02-01" });
    expect(ev.dtend).toEqual({ tipo: "DATE", fecha: "2027-02-05" });
  });

  it("nunca incluye datos de huésped en SUMMARY (RV06 'qué NO transporta iCal')", () => {
    const { contenidoIcs } = exportarFeedIcs("Unidad", [
      {
        ocupacionUnidadId: "id-1",
        unidadId: "unidad-1",
        rango: { inicio: "2027-01-01", fin: "2027-01-02" },
        razon: "BLOQUEO_PROPIETARIO",
        sequence: 0,
      },
    ]);
    expect(contenidoIcs).not.toMatch(/@(gmail|hotmail|yahoo)/i);
    expect(contenidoIcs).toContain("SUMMARY:Bloqueado por el propietario");
  });

  it("pliega líneas largas a 75 octetos (RFC 5545 §3.1)", () => {
    const { contenidoIcs } = exportarFeedIcs("X".repeat(200), []);
    const lineas = contenidoIcs.split("\r\n");
    for (const linea of lineas) {
      if (linea.startsWith(" ")) continue; // continuación, se mide junto a la anterior
      expect(Buffer.byteLength(linea, "utf8")).toBeLessThanOrEqual(75);
    }
  });
});

describe("esUidNamespacePropio", () => {
  it("reconoce solo UIDs con nuestro namespace y dominio exactos", () => {
    expect(esUidNamespacePropio(construirUidExportado("x"))).toBe(true);
    expect(esUidNamespacePropio("atiende-rv-x@otro-dominio.com")).toBe(false);
    expect(esUidNamespacePropio("cualquier-otro-uid@airbnb.com")).toBe(false);
  });
});

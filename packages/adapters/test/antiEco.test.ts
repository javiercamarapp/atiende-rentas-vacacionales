import { describe, expect, it } from "vitest";
import { detectarEco } from "../src/sync/antiEco.js";
import { construirUidExportado } from "../src/ical/exportador.js";

describe("detectarEco — anti-eco 3 capas (D-004, §Calendario-4)", () => {
  it("capa 1: UID con namespace propio se detecta como eco sin mirar hash/metadatos", () => {
    const resultado = detectarEco({
      uidEntrante: construirUidExportado("00000000-0000-0000-0000-000000000001"),
      hashContenidoEntrante: "no-importa",
      canalId: "canal-x",
      hashesExportadosRecientes: [],
      canalesExportadosDeRangoCoincidente: [],
    });
    expect(resultado.esEco).toBe(true);
    expect(resultado.capa).toBe(1);
  });

  it("capa 2: UID reescrito por el canal pero hash de contenido coincide con lo exportado", () => {
    const resultado = detectarEco({
      uidEntrante: "uid-reescrito-por-vrbo@vrbo.com",
      hashContenidoEntrante: "hash-abc",
      canalId: "canal-x",
      hashesExportadosRecientes: ["hash-abc", "hash-def"],
      canalesExportadosDeRangoCoincidente: [],
    });
    expect(resultado.esEco).toBe(true);
    expect(resultado.capa).toBe(2);
  });

  it("capa 3: metadato exportado_a coincide aunque UID y hash no lo hagan", () => {
    const resultado = detectarEco({
      uidEntrante: "uid-desconocido@canal.com",
      hashContenidoEntrante: "hash-no-coincide",
      canalId: "canal-x",
      hashesExportadosRecientes: [],
      canalesExportadosDeRangoCoincidente: ["canal-x"],
    });
    expect(resultado.esEco).toBe(true);
    expect(resultado.capa).toBe(3);
  });

  it("un evento genuinamente externo no se marca como eco", () => {
    const resultado = detectarEco({
      uidEntrante: "reserva-real-de-airbnb@airbnb.com",
      hashContenidoEntrante: "hash-genuino",
      canalId: "canal-x",
      hashesExportadosRecientes: ["hash-otro"],
      canalesExportadosDeRangoCoincidente: ["canal-y"],
    });
    expect(resultado.esEco).toBe(false);
    expect(resultado.capa).toBeNull();
  });
});

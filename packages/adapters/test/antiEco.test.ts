import { describe, expect, it } from "vitest";
import { detectarEco } from "../src/sync/antiEco.js";
import { construirUidExportado } from "../src/ical/exportador.js";

describe("detectarEco — anti-eco 3 capas (D-004, §Calendario-4)", () => {
  it("capa 1: UID con namespace propio se detecta como eco sin mirar hash/metadatos", () => {
    const resultado = detectarEco({
      uidEntrante: construirUidExportado("00000000-0000-0000-0000-000000000001"),
      hashContenidoEntrante: "no-importa",
      hashesExportadosRecientes: [],
      canalesExportadosDeRangoCoincidente: [],
    });
    expect(resultado.esEco).toBe(true);
    expect(resultado.capa).toBe(1);
  });

  it("capa 2: UID reescrito por el canal pero hash de contenido coincide con lo exportado (a cualquier canal)", () => {
    const resultado = detectarEco({
      uidEntrante: "uid-reescrito-por-vrbo@vrbo.com",
      hashContenidoEntrante: "hash-abc",
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
      hashesExportadosRecientes: [],
      canalesExportadosDeRangoCoincidente: ["canal-x"],
    });
    expect(resultado.esEco).toBe(true);
    expect(resultado.capa).toBe(3);
  });

  it("D-DSD-04 (regresión): capa 2 detecta el eco aunque el hash se haya exportado a un canal DISTINTO del que lo devuelve", () => {
    // Exportamos a Airbnb (hash-abc); Vrbo nos lo devuelve reflejado con un
    // UID propio de Vrbo — el canal de origen del rebote (Vrbo) nunca
    // exportó nada, pero el hash coincide con lo que exportamos a Airbnb.
    const resultado = detectarEco({
      uidEntrante: "vrbo-rebote-000111@vrbo.com",
      hashContenidoEntrante: "hash-abc",
      hashesExportadosRecientes: ["hash-abc"],
      canalesExportadosDeRangoCoincidente: [],
    });
    expect(resultado.esEco).toBe(true);
    expect(resultado.capa).toBe(2);
  });

  it("D-DSD-04 (regresión): capa 3 detecta el eco aunque el rango se haya exportado a un canal DISTINTO del que lo devuelve", () => {
    const resultado = detectarEco({
      uidEntrante: "vrbo-rebote-000222@vrbo.com",
      hashContenidoEntrante: "hash-no-coincide",
      hashesExportadosRecientes: [],
      // El rango se exportó a "canal-airbnb", pero el evento entrante llega
      // por un canal distinto (el llamador ya no filtra por canal actual).
      canalesExportadosDeRangoCoincidente: ["canal-airbnb"],
    });
    expect(resultado.esEco).toBe(true);
    expect(resultado.capa).toBe(3);
  });

  it("un evento genuinamente externo no se marca como eco", () => {
    const resultado = detectarEco({
      uidEntrante: "reserva-real-de-airbnb@airbnb.com",
      hashContenidoEntrante: "hash-genuino",
      hashesExportadosRecientes: ["hash-otro"],
      canalesExportadosDeRangoCoincidente: [],
    });
    expect(resultado.esEco).toBe(false);
    expect(resultado.capa).toBeNull();
  });
});

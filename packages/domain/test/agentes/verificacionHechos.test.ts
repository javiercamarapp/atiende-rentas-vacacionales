import { describe, expect, it } from "vitest";
import {
  extraerHechosCitados,
  TOOLS_SUJETAS_A_VERIFICACION_DE_HECHOS,
  verificarHechosCitados,
} from "../../src/agentes/verificacionHechos.js";

describe("extraerHechosCitados — extracción léxica de montos/fechas", () => {
  it("extrae un monto con símbolo $ y lo normaliza a 2 decimales", () => {
    const hechos = extraerHechosCitados("El total de tu estadía es $850.");
    expect(hechos).toHaveLength(1);
    expect(hechos[0]).toMatchObject({ tipo: "monto", valorNormalizado: "850.00" });
  });

  it("extrae un monto con separador de miles y decimales (US$1,500.50)", () => {
    const hechos = extraerHechosCitados("Confirmado: US$1,500.50 por las 3 noches.");
    expect(hechos).toHaveLength(1);
    expect(hechos[0]).toMatchObject({ tipo: "monto", valorNormalizado: "1500.50" });
  });

  it("extrae una fecha ISO 8601", () => {
    const hechos = extraerHechosCitados("Tu check-in es el 2026-06-01, disfruta tu estadía.");
    expect(hechos).toHaveLength(1);
    expect(hechos[0]).toMatchObject({ tipo: "fecha", valorNormalizado: "2026-06-01" });
  });

  it("extrae varios hechos mezclados en el mismo texto, en orden de aparición", () => {
    const hechos = extraerHechosCitados("Check-in 2026-06-01, check-out 2026-06-05, total $400.");
    expect(hechos.map((h) => h.tipo)).toEqual(["fecha", "fecha", "monto"]);
  });

  it("un número suelto sin símbolo de moneda NO se trata como monto (evita falsos positivos constantes)", () => {
    const hechos = extraerHechosCitados("Somos 3 huéspedes, llegamos a las 15 horas.");
    expect(hechos).toHaveLength(0);
  });

  it("texto sin ningún monto ni fecha devuelve un arreglo vacío", () => {
    expect(extraerHechosCitados("Gracias por tu mensaje, un miembro de nuestro equipo te responderá.")).toEqual([]);
  });
});

describe("verificarHechosCitados — cruce contra contextoResumen (patrón 4)", () => {
  it("sin ninguna cita en el texto, siempre verificado (nunca bloquea por AUSENCIA de datos)", () => {
    const resultado = verificarHechosCitados("Gracias por tu mensaje, lo revisaremos pronto.", {});
    expect(resultado.verificado).toBe(true);
    expect(resultado.hechosNoVerificados).toEqual([]);
  });

  it("un monto citado que coincide EXACTO con contextoResumen (aunque el formato de origen difiera) verifica", () => {
    const resultado = verificarHechosCitados("El total de tu reserva es $850.", { precioTotalUsd: "850" });
    expect(resultado.verificado).toBe(true);
  });

  it("una fecha citada que coincide con contextoResumen verifica", () => {
    const resultado = verificarHechosCitados("Tu check-in es el 2026-06-01.", {
      propiedadNombre: "Casa Azul",
      fechaCheckIn: "2026-06-01",
    });
    expect(resultado.verificado).toBe(true);
  });

  it("un monto citado que NO coincide con ningún valor de contextoResumen NO verifica", () => {
    const resultado = verificarHechosCitados("Confirmado, el total es $1200.", { precioTotalUsd: "850.00" });
    expect(resultado.verificado).toBe(false);
    expect(resultado.hechosNoVerificados).toHaveLength(1);
    expect(resultado.hechosNoVerificados[0]).toMatchObject({ tipo: "monto", valorNormalizado: "1200.00" });
  });

  it("una fecha citada que NO coincide con ningún valor de contextoResumen NO verifica", () => {
    const resultado = verificarHechosCitados("Tu check-in es el 2026-01-01.", {
      fechaCheckIn: "2026-06-01",
      fechaCheckOut: "2026-06-05",
    });
    expect(resultado.verificado).toBe(false);
    expect(resultado.hechosNoVerificados[0]).toMatchObject({ tipo: "fecha", valorNormalizado: "2026-01-01" });
  });

  it("contextoResumen vacío + una cita en el texto: NO verifica (ninguna fuente legítima posible)", () => {
    const resultado = verificarHechosCitados("El precio es $500.", {});
    expect(resultado.verificado).toBe(false);
  });

  it("varias citas: reporta CADA hecho no verificado, no solo el primero", () => {
    const resultado = verificarHechosCitados("Del 2026-01-01 al 2026-01-05 por $999.", {
      fechaCheckIn: "2026-06-01",
      precioTotalUsd: "850.00",
    });
    expect(resultado.hechosNoVerificados).toHaveLength(3);
  });

  it("valores de contextoResumen que no son montos/fechas (ej. nombre de propiedad) no generan falsos 'verificado'", () => {
    // Un nombre de propiedad como "Casa 850" nunca debería hacer pasar
    // por error un monto citado "$850" — normalizarMonto solo compara
    // contra valores que YA parecen un monto completo (PATRON_MONTO_COMPLETO
    // exige que el string ENTERO sea numérico, "Casa 850" no lo es).
    const resultado = verificarHechosCitados("El total es $850.", { propiedadNombre: "Casa 850" });
    expect(resultado.verificado).toBe(false);
  });
});

describe("TOOLS_SUJETAS_A_VERIFICACION_DE_HECHOS — alcance explícito del guardia", () => {
  it("incluye mensajeria_proponer_borrador (la tool que el patrón 4 señala explícitamente)", () => {
    expect(TOOLS_SUJETAS_A_VERIFICACION_DE_HECHOS.has("mensajeria_proponer_borrador")).toBe(true);
  });

  it("NO incluye precio_sugerir_ajuste ni limpieza_proponer_tarea — su trabajo legítimo es proponer un valor NUEVO", () => {
    expect(TOOLS_SUJETAS_A_VERIFICACION_DE_HECHOS.has("precio_sugerir_ajuste")).toBe(false);
    expect(TOOLS_SUJETAS_A_VERIFICACION_DE_HECHOS.has("limpieza_proponer_tarea")).toBe(false);
  });
});

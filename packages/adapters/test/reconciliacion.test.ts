import { describe, expect, it } from "vitest";
import { calcularBackoffMs, reconciliarCompleto } from "../src/sync/reconciliacion.js";

describe("calcularBackoffMs — caso adversarial 17 (HTTP 429, sin bucle agresivo)", () => {
  it("crece exponencialmente con el número de intento", () => {
    const opciones = { baseMs: 1000, maxMs: 60_000, factor: 2 };
    expect(calcularBackoffMs(1, opciones)).toBe(1000);
    expect(calcularBackoffMs(2, opciones)).toBe(2000);
    expect(calcularBackoffMs(3, opciones)).toBe(4000);
  });

  it("nunca excede el tope máximo configurado", () => {
    const opciones = { baseMs: 1000, maxMs: 5000, factor: 2 };
    expect(calcularBackoffMs(10, opciones)).toBe(5000);
  });

  it("respeta Retry-After del canal por encima del cálculo exponencial propio", () => {
    const opciones = { baseMs: 1000, maxMs: 600_000, factor: 2 };
    expect(calcularBackoffMs(1, opciones, 120)).toBe(120_000);
  });
});

describe("reconciliarCompleto — H-032, drift", () => {
  it("detecta como candidatos a cancelación implícita los UIDs activos que ya no están en el feed", () => {
    const activos = [
      { ocupacionUnidadId: "a", uidCanal: "uid-1" },
      { ocupacionUnidadId: "b", uidCanal: "uid-2" },
    ];
    const resultado = reconciliarCompleto(activos, new Set(["uid-1"]));
    expect(resultado.candidatosACancelarPorAusencia).toHaveLength(1);
    expect(resultado.candidatosACancelarPorAusencia[0]!.uidCanal).toBe("uid-2");
    expect(resultado.drift).toBe(1);
  });

  it("drift 0 cuando todos los UIDs activos siguen presentes", () => {
    const activos = [{ ocupacionUnidadId: "a", uidCanal: "uid-1" }];
    const resultado = reconciliarCompleto(activos, new Set(["uid-1", "uid-2"]));
    expect(resultado.drift).toBe(0);
  });
});

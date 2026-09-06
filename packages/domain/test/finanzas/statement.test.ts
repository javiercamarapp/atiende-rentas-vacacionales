import { describe, expect, it } from "vitest";
import { esMismoContenidoQueVersionAnterior, generarOwnerStatement } from "../../src/finanzas/statement.js";
import type { EntradaMovimientoReserva } from "../../src/finanzas/tipos.js";

const FUENTE = "RV12 L-RV12-02";

function reserva(id: string, montoBruto: number): EntradaMovimientoReserva {
  return {
    ocupacionUnidadId: id,
    moneda: "MXN",
    montoBrutoCentavos: montoBruto,
    comisionCanal: { yaNetoDeComision: true, comisionBasisPoints: 0, fuente: FUENTE },
    comisionGestor: { basisPoints: 1000, base: "neto_de_canal" },
    gastos: [],
    impuestos: [],
  };
}

describe("generarOwnerStatement — H-062 (idempotente, calculado desde reserva)", () => {
  const periodo = { inicio: "2026-08-01", fin: "2026-09-01" };

  it("agrega varias reservas del periodo en un solo statement con totales correctos", () => {
    const statement = generarOwnerStatement({
      ownerId: "owner-1",
      periodo,
      moneda: "MXN",
      reservas: [reserva("r1", 100000), reserva("r2", 200000)],
    });
    expect(statement.ingresosBrutosCentavos).toBe(300000);
    expect(statement.comisionGestorCentavos).toBe(10000 + 20000);
    expect(statement.netoCentavos).toBe(300000 - 30000);
  });

  it("es idempotente: la misma entrada produce el mismo hash de contenido", () => {
    const entrada = { ownerId: "owner-1", periodo, moneda: "MXN", reservas: [reserva("r1", 100000)] };
    const s1 = generarOwnerStatement(entrada);
    const s2 = generarOwnerStatement(entrada);
    expect(s1.hashContenido).toBe(s2.hashContenido);
    expect(esMismoContenidoQueVersionAnterior(s2, s1.hashContenido)).toBe(true);
  });

  it("un cambio en las reservas de entrada cambia el hash (nueva versión requerida)", () => {
    const s1 = generarOwnerStatement({ ownerId: "owner-1", periodo, moneda: "MXN", reservas: [reserva("r1", 100000)] });
    const s2 = generarOwnerStatement({ ownerId: "owner-1", periodo, moneda: "MXN", reservas: [reserva("r1", 150000)] });
    expect(s1.hashContenido).not.toBe(s2.hashContenido);
    expect(esMismoContenidoQueVersionAnterior(s2, s1.hashContenido)).toBe(false);
  });

  it("con una reserva de Airbnb configurada como monto ya neto de comisión, el statement no la vuelve a descontar (entregable del Lote 7)", () => {
    const statement = generarOwnerStatement({
      ownerId: "owner-1",
      periodo,
      moneda: "MXN",
      reservas: [reserva("r1", 84000)], // ya neto de la comisión host-only de Airbnb
    });
    const lineaComisionCanal = statement.lineas.find((l) => l.tipo === "comision_canal");
    expect(lineaComisionCanal).toBeUndefined();
    expect(statement.ingresosBrutosCentavos).toBe(84000);
  });

  it("rechaza reservas en una moneda distinta a la del statement", () => {
    const entrada = reserva("r1", 100000);
    entrada.moneda = "USD";
    expect(() =>
      generarOwnerStatement({ ownerId: "owner-1", periodo, moneda: "MXN", reservas: [entrada] }),
    ).toThrow();
  });

  it("sin versión anterior, nunca se considera 'mismo contenido'", () => {
    const s = generarOwnerStatement({ ownerId: "owner-1", periodo, moneda: "MXN", reservas: [reserva("r1", 100000)] });
    expect(esMismoContenidoQueVersionAnterior(s, null)).toBe(false);
  });
});

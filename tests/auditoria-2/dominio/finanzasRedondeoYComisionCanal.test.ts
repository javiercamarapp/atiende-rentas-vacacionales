import { describe, expect, it } from "vitest";
import {
  aplicarPorcentaje,
  calcularMovimientoReserva,
  centavosDesdeDecimal,
  decimalDesdeCentavos,
  sumarCentavos,
} from "@atiende-rv/domain/finanzas";

/**
 * Auditoría adversarial independiente (fase 2) — SOLO finanzas/pricing.
 *
 * Hipótesis 1a (redondeo de dinero con punto flotante): `packages/domain/
 * src/finanzas/redondeo.ts` afirma trabajar SIEMPRE en centavos enteros +
 * BigInt intermedio para porcentajes, "para nunca depender de la
 * representación binaria de punto flotante de un decimal (0.1 + 0.2 !==
 * 0.3)". Esta suite intenta romper esa afirmación con los casos clásicos
 * de drift de float (splits de comisión que no caen en un múltiplo exacto
 * de centavo: dividir/aplicar porcentajes sobre 100.00, 19.99, 0.1+0.2,
 * etc.) y confirma que el resultado es EXACTO (determinista, sin drift),
 * no una aproximación de punto flotante.
 *
 * Hipótesis 1c (modelo de comisión host-only vs. split por canal, RV13):
 * `calcularMovimientoReserva` decide con el flag `yaNetoDeComision`
 * (RV12 §2.1, L-RV12-02 "Airbnb: the entire fee is deducted from the
 * host's payout") si debe o no volver a restar la comisión de canal sobre
 * el bruto. Esta suite confirma que el motor NO aplica una fórmula
 * genérica única para ambos modelos (lo que sería incorrecto para
 * Airbnb): con `yaNetoDeComision: true` el monto recibido debe ser
 * IDÉNTICO al bruto de entrada (cero doble descuento); con `false` (caso
 * genérico Booking.com/Vrbo sin confirmar, R1 de RV12) sí debe restar la
 * comisión declarada en basis points.
 */

describe("1a: aritmética monetaria — ausencia de drift de punto flotante clásico", () => {
  it("0.1 + 0.2 en centavos es exacto (30), nunca 0.30000000000000004 vía float", () => {
    // El bug clásico de IEEE-754: 0.1 + 0.2 !== 0.3 en JS nativo.
    expect(0.1 + 0.2).not.toBe(0.3); // confirma que el bug de float SÍ existe en JS nativo…
    const diezCentavos = centavosDesdeDecimal("0.10");
    const veinteCentavos = centavosDesdeDecimal("0.20");
    // …pero el motor de dominio, trabajando en enteros, no lo hereda.
    expect(sumarCentavos(diezCentavos, veinteCentavos)).toBe(30);
    expect(decimalDesdeCentavos(sumarCentavos(diezCentavos, veinteCentavos))).toBe("0.30");
  });

  it("aplicarPorcentaje es determinista y reproducible para una comisión no exacta (16.00% de 19.99)", () => {
    const brutoCentavos = centavosDesdeDecimal("19.99"); // 1999 centavos
    const bp = 1600; // 16.00%
    const resultados = new Set<number>();
    for (let i = 0; i < 25; i++) {
      resultados.add(aplicarPorcentaje(brutoCentavos, bp));
    }
    // Determinismo estricto: SIEMPRE el mismo resultado, nunca varía por
    // redondeo de float acumulado entre llamadas repetidas.
    expect(resultados.size).toBe(1);
    // 1999 * 1600 / 10000 = 319.84 → half-up → 320 centavos ($3.20).
    expect([...resultados][0]).toBe(320);
  });

  it("dividir/repartir $100.00 en tres partes de comisión (33.33%/33.33%/33.34%) sin exceder el total ni perder centavos silenciosamente", () => {
    const totalCentavos = centavosDesdeDecimal("100.00"); // 10000 centavos
    // 100/3 = 33.333...%, expresado en basis points el motor exige enteros:
    // usamos 3333/3333/3334 bp (suma exacta = 10000 bp = 100.00%) — el
    // llamador es responsable de que las partes en bp sumen exactamente el
    // total, precisamente PORQUE el motor no hace división de bp fraccional.
    const parteA = aplicarPorcentaje(totalCentavos, 3333);
    const parteB = aplicarPorcentaje(totalCentavos, 3333);
    const parteC = aplicarPorcentaje(totalCentavos, 3334);
    const sumaPartes = sumarCentavos(parteA, parteB, parteC);
    // Invariante de negocio esperado: si los basis points de entrada suman
    // exactamente 10000 (100.00%), la suma de las partes en centavos debe
    // ser EXACTAMENTE el total — el motor no debe "perder" ni "regalar" un
    // centavo por redondeo half-up en cada parte por separado.
    expect(sumaPartes).toBe(totalCentavos);
  });

  it("centavosDesdeDecimal nunca usa parseFloat (rechaza formatos no numéricos limpios)", () => {
    expect(() => centavosDesdeDecimal("1e10")).toThrow();
    expect(() => centavosDesdeDecimal("NaN")).toThrow();
    expect(() => centavosDesdeDecimal("")).toThrow();
  });
});

describe("1c: modelo de comisión host-only (Airbnb) vs. split genérico (Booking/Vrbo) — RV13/RV12 §2.1", () => {
  const brutoCentavos = centavosDesdeDecimal("1000.00"); // 100000 centavos

  it("host-only (yaNetoDeComision=true, caso Airbnb confirmado L-RV12-02): el monto recibido es IDÉNTICO al bruto, sin doble descuento", () => {
    const movimiento = calcularMovimientoReserva({
      ocupacionUnidadId: "ocup-airbnb",
      moneda: "MXN",
      montoBrutoCentavos: brutoCentavos,
      comisionCanal: { yaNetoDeComision: true, comisionBasisPoints: 1600, fuente: "Airbnb host-only, L-RV12-02" },
      comisionGestor: { basisPoints: 1000, base: "neto_de_canal" },
      gastos: [],
      impuestos: [],
    });
    expect(movimiento.comisionCanalCentavos).toBe(0);
    expect(movimiento.montoRecibidoCentavos).toBe(brutoCentavos);
  });

  it("split genérico (yaNetoDeComision=false, caso Booking/Vrbo sin confirmar, R1 RV12): SÍ resta la comisión de canal declarada", () => {
    const movimiento = calcularMovimientoReserva({
      ocupacionUnidadId: "ocup-booking",
      moneda: "MXN",
      montoBrutoCentavos: brutoCentavos,
      comisionCanal: { yaNetoDeComision: false, comisionBasisPoints: 1600, fuente: "Booking.com — % editable, sin fuente oficial" },
      comisionGestor: { basisPoints: 1000, base: "neto_de_canal" },
      gastos: [],
      impuestos: [],
    });
    expect(movimiento.comisionCanalCentavos).toBe(16000); // 16% de 100000
    expect(movimiento.montoRecibidoCentavos).toBe(84000);
  });

  it("aplicar la fórmula del modelo split (bruto - comisión) sobre una reserva host-only sería incorrecto — confirmamos que el motor NO lo hace", () => {
    const comoHostOnly = calcularMovimientoReserva({
      ocupacionUnidadId: "ocup-x",
      moneda: "MXN",
      montoBrutoCentavos: brutoCentavos,
      comisionCanal: { yaNetoDeComision: true, comisionBasisPoints: 1600, fuente: "Airbnb host-only" },
      comisionGestor: { basisPoints: 0, base: "neto_de_canal" },
      gastos: [],
      impuestos: [],
    });
    const formulaGenericaIncorrecta = brutoCentavos - aplicarPorcentaje(brutoCentavos, 1600);
    // Si el motor tratara ambos modelos con la MISMA fórmula genérica
    // (bruto - comisión), el neto de una reserva Airbnb host-only saldría
    // 16% por debajo de lo real — el propietario vería un statement con
    // menos dinero del que Airbnb realmente le pagó.
    expect(comoHostOnly.netoCentavos).not.toBe(formulaGenericaIncorrecta);
    expect(comoHostOnly.netoCentavos).toBe(brutoCentavos);
  });
});

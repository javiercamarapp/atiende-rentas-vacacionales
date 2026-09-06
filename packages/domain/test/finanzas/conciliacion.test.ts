import { describe, expect, it } from "vitest";
import { conciliarPayout } from "../../src/finanzas/conciliacion.js";
import type { ReservaConciliable } from "../../src/finanzas/tipos.js";

describe("conciliarPayout — H-064 (Finanzas-2)", () => {
  const reservas: ReservaConciliable[] = [
    { ocupacionUnidadId: "oc-1", externalId: "VRBO-100", montoEsperadoCentavos: 50000 },
    { ocupacionUnidadId: "oc-2", externalId: "VRBO-200", montoEsperadoCentavos: 75000 },
    { ocupacionUnidadId: "oc-3", externalId: null, montoEsperadoCentavos: 30000 },
  ];

  it("concilia por referencia externa cuando el monto coincide", () => {
    const resultado = conciliarPayout(
      [{ referenciaExternaReserva: "VRBO-100", montoCentavos: 50000 }],
      reservas,
    );
    expect(resultado[0]!.estado).toBe("conciliado");
    expect(resultado[0]!.ocupacionUnidadId).toBe("oc-1");
  });

  it("marca discrepancia cuando la referencia coincide pero el monto no", () => {
    const resultado = conciliarPayout(
      [{ referenciaExternaReserva: "VRBO-200", montoCentavos: 70000 }],
      reservas,
    );
    expect(resultado[0]!.estado).toBe("discrepancia");
    expect(resultado[0]!.ocupacionUnidadId).toBe("oc-2");
    expect(resultado[0]!.montoEsperadoCentavos).toBe(75000);
  });

  it("concilia por monto exacto cuando no hay referencia externa", () => {
    const resultado = conciliarPayout([{ montoCentavos: 30000 }], reservas);
    expect(resultado[0]!.estado).toBe("conciliado");
    expect(resultado[0]!.ocupacionUnidadId).toBe("oc-3");
  });

  it("marca pendiente cuando no hay ninguna reserva candidata", () => {
    const resultado = conciliarPayout([{ montoCentavos: 999999 }], reservas);
    expect(resultado[0]!.estado).toBe("pendiente");
    expect(resultado[0]!.ocupacionUnidadId).toBeNull();
  });

  it("nunca reutiliza la misma reserva para dos líneas de payout distintas", () => {
    const resultado = conciliarPayout(
      [
        { referenciaExternaReserva: "VRBO-100", montoCentavos: 50000 },
        { montoCentavos: 50000 }, // mismo monto, pero oc-1 ya fue asignada
      ],
      reservas,
    );
    expect(resultado[0]!.estado).toBe("conciliado");
    expect(resultado[0]!.ocupacionUnidadId).toBe("oc-1");
    expect(resultado[1]!.ocupacionUnidadId).not.toBe("oc-1");
    expect(resultado[1]!.estado).toBe("pendiente");
  });
});

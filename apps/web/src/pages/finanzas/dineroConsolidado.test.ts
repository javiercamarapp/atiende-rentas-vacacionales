import { describe, expect, it } from "vitest";
import { decimalDesdeCentavos as canonico } from "@atiende-rv/domain/finanzas";
import { decimalDesdeCentavos as viaFinanzas } from "./api";
import { decimalDesdeCentavos as viaReportes } from "../reportes/api";

/**
 * Auditoría 2, corrección Q-01 (calidad-codigo.md): antes de esta
 * corrección `apps/web/src/pages/finanzas/api.ts` y
 * `apps/web/src/pages/reportes/api.ts` reimplementaban este formateador
 * de dinero con `Math.round`, mientras `packages/domain/finanzas` ya
 * declaraba `Math.trunc` como criterio único — con el caso límite `x.xx5`
 * (p. ej. un valor fraccionario de centavos por un bug de capas
 * superiores) dando resultados distintos entre las 3 copias. Ahora las 2
 * reexportan literalmente la misma función — esta prueba compara
 * explícitamente los 3 puntos (domain, finanzas/api.ts, reportes/api.ts;
 * el 4º punto, apps/api/routes/finanzas.ts, se cubre en
 * apps/api/test/finanzas/redondeoCompartido.test.ts) contra el mismo caso
 * límite que antes divergía.
 */
describe("Auditoría 2, Q-01 — mismo formateador en finanzas/api.ts y reportes/api.ts", () => {
  it("las 3 reexportaciones son literalmente la misma función (mismo objeto)", () => {
    expect(viaFinanzas).toBe(canonico);
    expect(viaReportes).toBe(canonico);
  });

  it("caso límite x.xx5 (1000.5 centavos): las 3 coinciden en '10.00', nunca en '10.01'", () => {
    expect(canonico(1000.5)).toBe("10.00");
    expect(viaFinanzas(1000.5)).toBe("10.00");
    expect(viaReportes(1000.5)).toBe("10.00");
  });

  it("caso típico de producción (entero): las 3 coinciden en el mismo resultado", () => {
    expect(canonico(75600)).toBe("756.00");
    expect(viaFinanzas(75600)).toBe("756.00");
    expect(viaReportes(75600)).toBe("756.00");
  });
});

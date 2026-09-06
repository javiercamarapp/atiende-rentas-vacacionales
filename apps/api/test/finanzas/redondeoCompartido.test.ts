import { describe, expect, it } from "vitest";
import { decimalDesdeCentavos } from "@atiende-rv/domain/finanzas";

/**
 * Auditoría 2, corrección Q-01 (calidad-codigo.md): `apps/api/src/routes/
 * finanzas.ts` (`renderizarStatementHtml`/`serializarStatementFila`)
 * reimplementaba este formateador con `Math.round`, divergiendo del
 * criterio único `Math.trunc` que `packages/domain/finanzas` ya declaraba
 * canónico. Se eliminó la copia local y `finanzas.ts` ahora importa
 * literalmente esta misma función — esta prueba fija su comportamiento en
 * el caso límite `x.xx5` que antes distinguía a las 4 copias (ver el
 * mismo caso en `packages/domain/test/finanzas/redondeo.test.ts` y en
 * `apps/web/src/pages/finanzas/dineroConsolidado.test.ts`).
 */
describe("Auditoría 2, Q-01 — apps/api delega en el formateador único de domain", () => {
  it("decimalDesdeCentavos(1000.5) trunca a '10.00' (nunca '10.01' del Math.round eliminado)", () => {
    expect(decimalDesdeCentavos(1000.5)).toBe("10.00");
  });

  it("formatea el neto de un Owner Statement típico igual que antes de la consolidación", () => {
    expect(decimalDesdeCentavos(840000 - 84000 - 50000)).toBe("7060.00");
  });
});

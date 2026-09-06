import { describe, expect, it } from "vitest";
import { DATASET_EVALS_AGENTES } from "../../src/agentes/evals/dataset.js";
import { ejecutarEvalsAgentes, UMBRAL_EVALS_ACIERTO_CONTENIDO } from "../../src/agentes/evals/runner.js";

/**
 * H-084 / RV19-R-19: el dataset de evals corre contra el proveedor
 * simulado y NO produce ningún fallo automático en casos adversariales.
 * Este test es el equivalente unitario de `npm run evals:agentes`
 * (packages/domain/package.json) — mismo runner, mismo dataset.
 */
describe("Evals de agentes (H-084, RV19-R-19, §Automatización-3)", () => {
  it("el dataset incluye casos normales y adversariales", () => {
    const categorias = new Set(DATASET_EVALS_AGENTES.map((c) => c.categoria));
    expect(categorias.has("normal")).toBe(true);
    expect(categorias.has("adversarial")).toBe(true);
    expect(DATASET_EVALS_AGENTES.filter((c) => c.categoria === "adversarial").length).toBeGreaterThanOrEqual(4);
  });

  it("cero fallos automáticos en casos adversariales contra el proveedor simulado", async () => {
    const reporte = await ejecutarEvalsAgentes();
    expect(reporte.fallosAutomaticosAdversariales).toBe(0);
  });

  it("la tasa de acierto de contenido en casos normales alcanza el umbral de promoción de fase (≥95%)", async () => {
    const reporte = await ejecutarEvalsAgentes();
    expect(reporte.tasaAciertoContenidoNormales).toBeGreaterThanOrEqual(UMBRAL_EVALS_ACIERTO_CONTENIDO);
  });

  it("pasaUmbral es true con el dataset de referencia completo", async () => {
    const reporte = await ejecutarEvalsAgentes();
    expect(reporte.pasaUmbral).toBe(true);
  });
});

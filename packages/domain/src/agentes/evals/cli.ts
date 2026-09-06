#!/usr/bin/env node
/**
 * Comando `npm run evals:agentes` (H-084, RV19-R-19, §Automatización-3).
 * Corre `DATASET_EVALS_AGENTES` contra el proveedor SIMULADO etiquetado
 * (nunca contra la API real de Claude — `ProveedorLLMSimulado` es la única
 * implementación importada aquí) y sale con código distinto de cero si:
 * - Algún caso ADVERSARIAL produjo una acción fuera de alcance (fallo
 *   automático, RV18 §7.3) — esto es lo que EXIGE LOTES.md: "falla si
 *   algún caso adversarial produce acción".
 * - La tasa de acierto de contenido en casos normales cae por debajo del
 *   umbral de promoción de fase (RV18 §7.4, 95%).
 */
import { ejecutarEvalsAgentes } from "./runner.js";

async function main(): Promise<void> {
  const reporte = await ejecutarEvalsAgentes();

  console.log(`\nEvals de agentes (Lote 9, H-084) — proveedor: simulado-etiquetado-v1\n`);
  for (const caso of reporte.casos) {
    const estado = caso.ok ? "OK  " : "FAIL";
    console.log(`  [${estado}] (${caso.categoria}) ${caso.id} — ${caso.detalle}`);
  }
  console.log(
    `\nTotal: ${reporte.total} | fallos automáticos adversariales: ${reporte.fallosAutomaticosAdversariales} | ` +
      `acierto contenido normal: ${reporte.tasaAciertoContenidoNormales.toFixed(1)}%\n`,
  );

  if (!reporte.pasaUmbral) {
    console.error(
      "RESULTADO: FALLA — hay fallos automáticos adversariales y/o el acierto de contenido cayó bajo el umbral (95%).",
    );
    process.exitCode = 1;
    return;
  }
  console.log("RESULTADO: OK — cero fallos automáticos adversariales, umbral de contenido cumplido.");
}

main().catch((error) => {
  console.error("Error inesperado corriendo evals:agentes:", error);
  process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * Orquestador de `npm run test:load` (Lote 11A, BACKLOG H-093). Corre los
 * 3 escenarios (import concurrente, ráfaga de reservas directas,
 * reconciliación con drift) como procesos `tsx` separados — cada uno
 * levanta su propio cluster `embedded-postgres` efímero, así que
 * aislarlos en procesos evita compartir estado entre escenarios y deja
 * que cada uno reporte su propio resultado sin interferencia. Nunca se
 * integra en `npm run ci` (LOTES.md Lote 11: la suite de carga queda
 * manual/CI nocturno, documentado en docs/PROGRESO.md) — es más lenta y
 * mide rendimiento, no corrección; mezclarla con el gate de PR normal
 * penalizaría a cada PR con una medición de carga que nadie pidió.
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Duplicado deliberadamente (no importado desde `comun.ts`): este archivo
// es JavaScript plano invocado por `node` directamente (`npm run
// test:load`), nunca por `tsx` — importar un `.ts` con anotaciones de
// tipo desde un `.mjs` cargado por el runtime nativo de Node fallaría al
// parsear. Los 3 escenarios sí son `.ts` y se invocan explícitamente vía
// `npx tsx` más abajo, donde SÍ pueden importar `comun.ts`.
const MARCA_RESULTADO = "RESULTADO_JSON:";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raizRepo = join(__dirname, "..", "..");

const ESCENARIOS = [
  { archivo: "escenarioA-importacion.ts", args: ["50", "3"] },
  { archivo: "escenarioB-rafagaReservas.ts", args: ["30"] },
  { archivo: "escenarioC-reconciliacion.ts", args: ["50", "10", "0.1"] },
];

function correrEscenario(archivo, args) {
  return new Promise((resolve, reject) => {
    const proceso = spawn("npx", ["tsx", join(__dirname, archivo), ...args], {
      cwd: raizRepo,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proceso.stdout.on("data", (d) => {
      stdout += d.toString();
      process.stdout.write(d);
    });
    proceso.stderr.on("data", (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });
    proceso.on("exit", (codigo) => {
      if (codigo !== 0) {
        reject(new Error(`${archivo} salió con código ${codigo}\n${stderr}`));
        return;
      }
      const linea = stdout.split("\n").find((l) => l.startsWith(MARCA_RESULTADO));
      if (!linea) {
        reject(new Error(`${archivo} no emitió ${MARCA_RESULTADO}`));
        return;
      }
      resolve(JSON.parse(linea.slice(MARCA_RESULTADO.length)));
    });
  });
}

async function main() {
  const logPath = join(raizRepo, "docs", "logs", "lote11a-load.log");
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, `# Log de ejecución — npm run test:load (Lote 11A)\n# Generado: ${new Date().toISOString()}\n\n`);

  const resultados = [];
  for (const { archivo, args } of ESCENARIOS) {
    appendFileSync(logPath, `\n=== ${archivo} ${args.join(" ")} ===\n`);
    console.log(`\n=== Ejecutando ${archivo} ${args.join(" ")} ===`);
    const t0 = Date.now();
    let resultado;
    let error = null;
    try {
      resultado = await correrEscenario(archivo, args);
    } catch (e) {
      error = e;
    }
    const duracionMs = Date.now() - t0;
    appendFileSync(logPath, `duración total del proceso: ${duracionMs}ms\n`);
    if (error) {
      appendFileSync(logPath, `ERROR: ${error.message}\n`);
      console.error(`[${archivo}] ERROR:`, error.message);
      resultados.push({ archivo, error: error.message });
    } else {
      appendFileSync(logPath, `${JSON.stringify(resultado, null, 2)}\n`);
      resultados.push({ archivo, resultado });
    }
  }

  const rutaJson = join(raizRepo, "docs", "logs", "load-resultado.json");
  writeFileSync(rutaJson, JSON.stringify({ generadoEn: new Date().toISOString(), resultados }, null, 2) + "\n");
  console.log(`\nResultados escritos en ${rutaJson} y ${logPath}`);

  const huboError = resultados.some((r) => r.error);
  if (huboError) {
    console.error("Al menos un escenario de carga falló en ejecutarse (no en sus mediciones) — ver el log.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[test:load] error fatal:", error);
  process.exit(1);
});

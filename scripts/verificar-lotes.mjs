#!/usr/bin/env node
/**
 * `npm run verificar:lotes` (Lote 10, item 6 del encargo: "corrige el
 * agregado raíz... script que imprime conteos por paquete"). Corre
 * `npm run test` (y, con `--integration`, también `test:integration`) por
 * cada workspace del monorepo, capturando la salida real de Vitest, y
 * construye una tabla de conteos — la misma fuente de verdad que ya usa
 * `npm test` en la raíz, solo que aquí se resume por paquete en vez de
 * dejarlo disperso en el log crudo.
 *
 * No inventa un mecanismo de conteo alternativo (contar `it(`/`test(` con
 * grep sería más rápido pero puede mentir: un `it.skip` o un archivo con
 * un `describe` vacío contaría igual que una prueba real que corrió). Este
 * script ejecuta las pruebas de verdad y lee el resumen que Vitest ya
 * imprime, exactamente como haría un humano revisando el log.
 *
 * Corrección Lote 11B: la versión anterior corría un solo
 * `npm run test --workspaces --if-present` y usaba la línea que npm
 * imprime por workspace (`> @scope/nombre@version test`) para saber a qué
 * paquete pertenece cada bloque de salida. Esa línea es el "banner" de
 * npm, no de Vitest, y `npm` la omite en modo silencioso (`npm -s run
 * verificar:lotes`, o cualquier invocación con `--silent`/`--loglevel
 * silent`) — sin ella `paqueteActual` nunca se fija y el conteo total
 * queda en 0 aunque Vitest sí haya corrido e impreso sus "Tests"/"Test
 * Files" reales. Para no depender de ese banner (ni de si npm decide o no
 * colorear su salida), este script enumera los workspaces él mismo a
 * partir de `apps/*`/`packages/*` y corre cada uno por separado con
 * `--workspace=<nombre> --if-present`, así cada salida capturada
 * pertenece a un único paquete sin necesidad de parsear ningún banner.
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const incluirIntegracion = args.includes("--integration");

function correr(comando, argsComando) {
  return new Promise((resolve) => {
    const partes = [];
    const proceso = spawn(comando, argsComando, { stdio: ["ignore", "pipe", "pipe"], cwd: raiz });
    proceso.stdout.on("data", (d) => partes.push(d.toString()));
    proceso.stderr.on("data", (d) => partes.push(d.toString()));
    proceso.on("close", (codigo) => resolve({ codigo: codigo ?? 1, salida: partes.join("") }));
  });
}

function quitarAnsi(texto) {
  return texto.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Enumera los workspaces reales del monorepo leyendo los patrones
 * `workspaces` del package.json raíz (glob simple de un solo nivel, que es
 * lo único que usa este repo: `apps/*`, `packages/*`) y devolviendo el
 * nombre declarado en cada `package.json` de workspace.
 */
function listarWorkspaces() {
  const pkgRaiz = JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8"));
  const nombres = [];
  for (const patron of pkgRaiz.workspaces ?? []) {
    const base = patron.endsWith("/*") ? patron.slice(0, -2) : patron;
    const dirBase = path.join(raiz, base);
    if (!existsSync(dirBase)) continue;
    for (const entrada of readdirSync(dirBase, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      const pkgPath = path.join(dirBase, entrada.name, "package.json");
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg.name) nombres.push(pkg.name);
    }
  }
  return nombres;
}

/**
 * Parsea la salida de Vitest de UN SOLO workspace (ya aislada por
 * `--workspace=<nombre>`): busca la última línea "Tests"/"Test Files" que
 * imprime como resumen final. Con o sin colores ANSI, con o sin el banner
 * de npm — no hace falta ninguno de los dos porque la salida completa ya
 * pertenece a un único paquete.
 */
function parsearConteo(salidaCruda) {
  const salida = quitarAnsi(salidaCruda);
  const lineas = salida.split("\n");
  const entrada = { tests: 0, archivos: 0, tieneSuite: false, fallidos: 0 };

  for (const linea of lineas) {
    const lineaTests = linea.match(/^\s*Tests\s+.*\((\d+)\)\s*$/);
    if (lineaTests) {
      entrada.tests += Number(lineaTests[1]);
      entrada.tieneSuite = true;
      const fallos = linea.match(/(\d+) failed/);
      if (fallos) entrada.fallidos += Number(fallos[1]);
    }
    const lineaArchivos = linea.match(/^\s*Test Files\s+.*\((\d+)\)\s*$/);
    if (lineaArchivos) entrada.archivos += Number(lineaArchivos[1]);
  }
  return entrada;
}

/**
 * Auditoría 2, corrección Q-10 (calidad-codigo.md): antes, si Vitest
 * cambiara el formato de su resumen ("Tests  27 passed (27)"), este
 * script reportaría silenciosamente "0 tests" para un workspace que SÍ
 * corrió pruebas — indistinguible de un workspace real sin suite Vitest
 * (`--if-present` sin script `test`). Se distingue explícitamente ambos
 * casos: si la salida cruda contiene el propio banner de arranque de
 * Vitest ("RUN v" — impreso siempre al iniciar, antes de cualquier
 * resumen) pero `parsearConteo` no encontró una línea "Tests"/"Test
 * Files", es una falla de parseo, no una ausencia real de pruebas.
 */
const VITEST_ARRANCO = /\bRUN\s+v\d/;

function conteoOFalloDeParseo(paquete, script, salidaCruda) {
  const entrada = parsearConteo(salidaCruda);
  if (VITEST_ARRANCO.test(quitarAnsi(salidaCruda)) && !entrada.tieneSuite) {
    throw new Error(
      `verificar-lotes: Vitest arrancó en "${paquete}" (script "${script}") pero no se pudo parsear su resumen ` +
        `("Tests"/"Test Files") — probablemente cambió el formato de salida de Vitest. Revisa la salida cruda en ` +
        `vez de confiar en un conteo de "0 tests", que aquí sería engañoso (el workspace sí corrió pruebas).`,
    );
  }
  return entrada;
}

async function conteosPorPaquete(workspaces, script) {
  const conteos = [];
  for (const paquete of workspaces) {
    const resultado = await correr("npm", ["run", script, `--workspace=${paquete}`, "--if-present"]);
    const entrada = conteoOFalloDeParseo(paquete, script, resultado.salida);
    conteos.push({ paquete, ...entrada });
  }
  return conteos;
}

function imprimirTabla(titulo, conteos) {
  console.log(`\n${titulo}`);
  console.log("-".repeat(titulo.length));
  let total = 0;
  let totalFallidos = 0;
  for (const c of conteos) {
    const etiqueta = c.tieneSuite ? `${c.tests} tests (${c.archivos} archivos)` : "sin suite Vitest (0)";
    const fallo = c.fallidos ? `  ⚠ ${c.fallidos} FALLIDOS` : "";
    console.log(`  ${c.paquete.padEnd(24)} ${etiqueta}${fallo}`);
    total += c.tests;
    totalFallidos += c.fallidos ?? 0;
  }
  console.log(`  ${"TOTAL".padEnd(24)} ${total} tests`);
  if (totalFallidos > 0) console.log(`  ⚠ ${totalFallidos} pruebas fallidas en total`);
  return { total, totalFallidos };
}

async function main() {
  console.log("Verificando cobertura de pruebas por paquete del monorepo (Lote 10)...");

  const workspaces = listarWorkspaces();

  const conteosUnit = await conteosPorPaquete(workspaces, "test");
  const resumenUnit = imprimirTabla("Pruebas unitarias (npm run test)", conteosUnit);

  let resumenIntegracion = { total: 0, totalFallidos: 0 };
  if (incluirIntegracion) {
    const conteosIntegracion = await conteosPorPaquete(workspaces, "test:integration");
    resumenIntegracion = imprimirTabla("Pruebas de integración (npm run test:integration)", conteosIntegracion);
  }

  const totalGeneral = resumenUnit.total + resumenIntegracion.total;
  console.log(`\nTOTAL GENERAL DEL MONOREPO: ${totalGeneral} pruebas`);

  const huboFallos = resumenUnit.totalFallidos > 0 || resumenIntegracion.totalFallidos > 0;
  if (huboFallos) {
    console.error("\nHay pruebas fallidas o un workspace rompió la corrida — revisa el log completo arriba.");
    process.exitCode = 1;
  }
}

// Exportado para la prueba de regresión (`verificar-lotes.test.mjs`, Lote
// 11B): permite probar `parsearConteo`/`listarWorkspaces` importando este
// módulo sin disparar `main()` (que lanza `npm run test` de verdad por cada
// workspace) — mismo patrón que un script CLI con guardia
// `require.main === module`, adaptado a ESM.
export { parsearConteo, listarWorkspaces, quitarAnsi, conteoOFalloDeParseo };

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

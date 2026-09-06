#!/usr/bin/env node
/**
 * `npm run verificar:lotes` (Lote 10, item 6 del encargo: "corrige el
 * agregado raíz... script que imprime conteos por paquete"). Corre
 * `npm run test --workspaces --if-present` (y, con `--integration`,
 * también `test:integration`) capturando la salida real de Vitest por
 * workspace, y construye una tabla de conteos — la misma fuente de verdad
 * que ya usa `npm test` en la raíz, solo que aquí se resume por paquete en
 * vez de dejarlo disperso en el log crudo.
 *
 * No inventa un mecanismo de conteo alternativo (contar `it(`/`test(` con
 * grep sería más rápido pero puede mentir: un `it.skip` o un archivo con
 * un `describe` vacío contaría igual que una prueba real que corrió). Este
 * script ejecuta las pruebas de verdad y lee el resumen que Vitest ya
 * imprime, exactamente como haría un humano revisando el log.
 */
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const incluirIntegracion = args.includes("--integration");

function correr(comando, argsComando) {
  return new Promise((resolve) => {
    const partes = [];
    const proceso = spawn(comando, argsComando, { stdio: ["ignore", "pipe", "pipe"] });
    proceso.stdout.on("data", (d) => partes.push(d.toString()));
    proceso.stderr.on("data", (d) => partes.push(d.toString()));
    proceso.on("close", (codigo) => resolve({ codigo: codigo ?? 1, salida: partes.join("") }));
  });
}

function quitarAnsi(texto) {
  return texto.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Parsea la salida de `npm run <script> --workspaces --if-present`:
 * cada workspace imprime `> @scope/nombre@version <script>` seguido, si
 * tiene pruebas Vitest reales, de una línea `Tests  N passed (N)` (u otros
 * conteos: failed/skipped). Workspaces sin ese script (`--if-present`) o
 * sin pruebas Vitest (p. ej. un stub `echo`) quedan en 0 explícito, no
 * omitidos — así un paquete que pierda su suite por accidente se nota en
 * la tabla en vez de desaparecer en silencio.
 */
function parsearConteosPorPaquete(salidaCruda) {
  const salida = quitarAnsi(salidaCruda);
  const lineas = salida.split("\n");
  const conteos = [];
  let paqueteActual = null;

  for (const linea of lineas) {
    const inicioPaquete = linea.match(/^> (@[\w-]+\/[\w-]+)@[\d.]+ \S+/);
    if (inicioPaquete) {
      paqueteActual = inicioPaquete[1];
      if (!conteos.some((c) => c.paquete === paqueteActual)) {
        conteos.push({ paquete: paqueteActual, tests: 0, archivos: 0, tieneSuite: false });
      }
      continue;
    }
    // El total real de casos SIEMPRE es el número entre paréntesis al
    // final de la línea "Tests" — el orden de "N passed"/"N failed"/
    // "N skipped" antes de eso varía según qué combinación reporte Vitest
    // (todo verde imprime solo "passed", una corrida rota puede imprimir
    // "N failed | M passed (total)" o al revés), así que no hay que
    // depender de esa parte para el conteo total, solo para la señal de
    // fallo.
    const lineaTests = linea.match(/^\s*Tests\s+.*\((\d+)\)\s*$/);
    if (lineaTests && paqueteActual) {
      const entrada = conteos.find((c) => c.paquete === paqueteActual);
      entrada.tests += Number(lineaTests[1]);
      entrada.tieneSuite = true;
    }
    const lineaArchivos = linea.match(/^\s*Test Files\s+.*\((\d+)\)\s*$/);
    if (lineaArchivos && paqueteActual) {
      const entrada = conteos.find((c) => c.paquete === paqueteActual);
      entrada.archivos += Number(lineaArchivos[1]);
    }
    // Fallos: si Vitest reporta "X failed" en la misma línea "Tests", lo
    // reflejamos para que la tabla no mienta diciendo "todo verde" cuando
    // en realidad la corrida se rompió a medias.
    if (lineaTests) {
      const fallos = linea.match(/(\d+) failed/);
      if (fallos && paqueteActual) {
        const entrada = conteos.find((c) => c.paquete === paqueteActual);
        entrada.fallidos = (entrada.fallidos ?? 0) + Number(fallos[1]);
      }
    }
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

  const unit = await correr("npm", ["run", "test", "--workspaces", "--if-present"]);
  const conteosUnit = parsearConteosPorPaquete(unit.salida);
  const resumenUnit = imprimirTabla("Pruebas unitarias (npm run test)", conteosUnit);

  let resumenIntegracion = { total: 0, totalFallidos: 0 };
  if (incluirIntegracion) {
    const integracion = await correr("npm", ["run", "test:integration", "--workspaces", "--if-present"]);
    const conteosIntegracion = parsearConteosPorPaquete(integracion.salida);
    resumenIntegracion = imprimirTabla("Pruebas de integración (npm run test:integration)", conteosIntegracion);
  }

  const totalGeneral = resumenUnit.total + resumenIntegracion.total;
  console.log(`\nTOTAL GENERAL DEL MONOREPO: ${totalGeneral} pruebas`);

  const huboFallos = resumenUnit.totalFallidos > 0 || resumenIntegracion.totalFallidos > 0 || unit.codigo !== 0;
  if (huboFallos) {
    console.error("\nHay pruebas fallidas o un workspace rompió la corrida — revisa el log completo arriba.");
    process.exitCode = 1;
  }
}

main();

#!/usr/bin/env node
/**
 * docs/fase2/LOTES.md documenta comandos como
 * `npm run test:integration -- --filter=rls`, pero `--filter` es sintaxis
 * de pnpm/yarn workspaces, no de npm ni de vitest: ese comando SÍ corre
 * (exit 0), pero corre TODA la suite de integración del workspace, nunca
 * solo el subconjunto que el nombre promete — un falso verde silencioso
 * (hallazgo Lote 11B, corrección cruzada #6).
 *
 * Este script traduce cada `--filter=<nombre>` documentado en LOTES.md a la
 * invocación real de vitest que sí aísla ese subconjunto, en el workspace
 * correcto. Uso:
 *
 *   node scripts/filtrar-tests.mjs --filter=<nombre> [-- <args extra de vitest>]
 *
 * Nombres soportados: rls, limpieza, mensajeria, finanzas, backoffice,
 * agentes, recuperacion, sync (delega en scripts/adversarial.mjs, que ya
 * soporta --filter nativamente).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// nombre → { cwd relativo a la raíz del repo, script npm a invocar, rutas
// de test a pasarle a vitest para aislar solo ese subconjunto }.
const FILTROS = {
  rls: {
    cwd: "packages/db",
    script: "test:integration",
    rutas: ["test/integration/rls.test.ts"],
  },
  recuperacion: {
    cwd: "packages/db",
    script: "test:integration",
    rutas: ["test/integration/backup.test.ts", "test/backup/exportarRestaurar.test.ts"],
  },
  limpieza: {
    cwd: "apps/api",
    script: "test:integration",
    rutas: ["test/integration/limpieza.test.ts"],
  },
  mensajeria: {
    cwd: "apps/api",
    script: "test:integration",
    rutas: ["test/integration/mensajeria.test.ts"],
  },
  finanzas: {
    cwd: "apps/api",
    script: "test:integration",
    rutas: ["test/integration/finanzasPricingReportes.test.ts"],
  },
  backoffice: {
    cwd: "apps/api",
    script: "test:integration",
    rutas: ["test/integration/backoffice.test.ts"],
  },
  agentes: {
    cwd: "packages/domain",
    script: "test",
    rutas: ["test/agentes"],
  },
};

const args = process.argv.slice(2);
const filtroArg = args.find((a) => a.startsWith("--filter="));
const resto = args.filter((a) => a !== filtroArg && a !== "--");

if (!filtroArg) {
  console.error(
    `Uso: node scripts/filtrar-tests.mjs --filter=<${[...Object.keys(FILTROS), "sync"].join("|")}>`,
  );
  process.exit(1);
}
const filtro = filtroArg.slice("--filter=".length);

if (filtro === "sync") {
  // scripts/adversarial.mjs (Lote 2) ya traduce --filter=sync correctamente
  // por su cuenta — se delega en vez de duplicar la lógica.
  const proceso = spawn("node", [path.join(RAIZ, "scripts/adversarial.mjs"), filtroArg, ...resto], {
    stdio: "inherit",
  });
  proceso.on("exit", (codigo) => process.exit(codigo ?? 1));
} else {
  const entrada = FILTROS[filtro];
  if (!entrada) {
    console.error(
      `Filtro desconocido: "${filtro}". Soportados: ${[...Object.keys(FILTROS), "sync"].join(", ")}.`,
    );
    process.exit(1);
  }
  const cwdAbsoluto = path.join(RAIZ, entrada.cwd);
  if (!existsSync(cwdAbsoluto)) {
    console.error(`No existe el workspace "${entrada.cwd}" para el filtro "${filtro}".`);
    process.exit(1);
  }
  const configArg = entrada.script === "test:integration" ? ["--config", "vitest.integration.config.ts"] : [];
  const vitestArgs = ["vitest", "run", ...entrada.rutas, ...configArg, ...resto];
  console.log(`> (cwd=${entrada.cwd}) npx ${vitestArgs.join(" ")}`);
  const proceso = spawn("npx", vitestArgs, { cwd: cwdAbsoluto, stdio: "inherit" });
  proceso.on("exit", (codigo) => process.exit(codigo ?? 1));
}

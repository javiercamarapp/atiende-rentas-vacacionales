#!/usr/bin/env node
/**
 * `npm run test:adversarial -- --filter=sync` (LOTES.md, Lote 2). Traduce
 * `--filter=<nombre>` a la carpeta `tests/adversarial/<nombre>` y corre esa
 * porción de la suite adversarial contra `vitest`. Sin `--filter`, corre
 * toda la suite disponible bajo `tests/adversarial/` (catálogo completo,
 * responsabilidad final de Lote 11 — aquí solo existe el subconjunto de
 * sincronización de Lote 2).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const filtroArg = args.find((a) => a.startsWith("--filter="));
const filtro = filtroArg ? filtroArg.slice("--filter=".length) : null;
const resto = args.filter((a) => !a.startsWith("--filter="));

const objetivo = filtro ? `tests/adversarial/${filtro}` : "tests/adversarial";

if (filtro && !existsSync(objetivo)) {
  console.error(`No existe la carpeta de suite adversarial "${objetivo}" (filtro="${filtro}").`);
  process.exit(1);
}

const vitestArgs = ["vitest", "run", "--config", "tests/adversarial/vitest.config.ts", objetivo, ...resto];
console.log(`> npx ${vitestArgs.join(" ")}`);

const proceso = spawn("npx", vitestArgs, { stdio: "inherit" });
proceso.on("exit", (codigo) => process.exit(codigo ?? 1));

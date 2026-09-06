import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Lote 11B, corrección #6: `docs/fase2/LOTES.md` documenta comandos como
// `npm run test:integration -- --filter=rls` como si `--filter` fuera
// sintaxis real de npm workspaces — no lo es (es de pnpm/yarn). Ese comando
// corre igualmente (exit 0) pero ejecuta TODA la suite de integración del
// workspace, nunca solo el subconjunto que el nombre promete: un falso
// verde silencioso. `scripts/filtrar-tests.mjs` es el reemplazo real.
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "filtrar-tests.mjs");
const RAIZ = path.dirname(SCRIPT);

function correr(args) {
  return spawnSync("node", [SCRIPT, ...args], { cwd: path.join(RAIZ, ".."), encoding: "utf8" });
}

function quitarAnsi(texto) {
  return texto.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

describe("scripts/filtrar-tests.mjs", () => {
  it("sin --filter: muestra uso y sale con código distinto de 0", () => {
    const r = correr([]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Uso: node scripts\/filtrar-tests\.mjs --filter=/);
  });

  it("--filter desconocido: falla explícito, nunca corre 'toda la suite' en silencio", () => {
    const r = correr(["--filter=no-existe"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Filtro desconocido: "no-existe"/);
  });

  it("--filter=agentes: corre SOLO test/agentes (unitario, packages/domain) y reporta tests reales > 0", () => {
    const r = correr(["--filter=agentes"]);
    const salida = quitarAnsi(r.stdout);
    expect(r.status).toBe(0);
    // Aísla el subconjunto real: nunca corre archivos fuera de test/agentes/.
    expect(salida).toMatch(/test\/agentes\//);
    expect(salida).not.toMatch(/test\/(finanzas|pricing|mensajeria|limpieza)\//);
    const match = salida.match(/Tests\s+.*?\((\d+)\)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThan(0);
  });

  it("--filter=sync: delega en scripts/adversarial.mjs (ya soporta --filter nativamente)", () => {
    const r = correr(["--filter=sync"]);
    expect(quitarAnsi(r.stdout)).toMatch(/tests\/adversarial\/sync/);
  });
});

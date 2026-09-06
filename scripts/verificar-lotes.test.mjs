import { describe, it, expect } from "vitest";
import { parsearConteo, listarWorkspaces, quitarAnsi, conteoOFalloDeParseo } from "./verificar-lotes.mjs";

// Regresión (Lote 11B): `npm run verificar:lotes` reportaba "0 tests" al
// ejecutarse con `npm -s` (silencioso) porque el parser anterior dependía
// de la línea `> @scope/pkg@version test` que imprime NPM al iniciar cada
// script de workspace — y `npm -s`/`--silent` la suprime. La corrección
// (correr cada workspace por separado con `--workspace=<nombre>` y sumar
// SOLO las líneas "Tests"/"Test Files" que Vitest imprime siempre, con o
// sin `-s` y con o sin color) hace que ese banner ya ni siquiera haga
// falta: estas pruebas fijan ese comportamiento con salidas reales
// capturadas de `npm -s run test --workspace=@atiende-rv/domain` (silent,
// con color — Vitest sigue coloreando aunque npm esté en modo `-s`) y una
// variante sin ningún código ANSI (equivalente a un entorno sin TTY/color).

const SALIDA_SILENCIOSA_CON_COLOR = [
  "",
  "[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/repo/packages/domain[39m",
  "",
  " [32m✓[39m test/fechas.test.ts [2m([22m[2m20 tests[22m[2m)[22m",
  "",
  "[2m      Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m",
  "[2m      Tests [22m [1m[32m20 passed[39m[22m[90m (20)[39m",
  "",
].join("\n");

// Sin absolutamente ningún código ANSI (npm -s Y sin color, o CI sin TTY).
const SALIDA_SIN_COLOR_NI_BANNER_NPM = [
  "",
  " RUN v3.2.7 /repo/apps/api",
  "",
  " ✓ test/rutas.test.ts (12 tests)",
  "",
  "      Test Files  1 passed (1)",
  "      Tests  12 passed (12)",
  "",
].join("\n");

// Salida NO silenciosa (npm imprime su banner) — debe seguir funcionando
// igual que antes de la corrección, aunque ya no se use como delimitador.
const SALIDA_NO_SILENCIOSA = [
  "> @atiende-rv/web@0.0.0 test",
  "> vitest run --exclude '**/test/integration/**'",
  "",
  " RUN v3.2.7 /repo/apps/web",
  "",
  "      Test Files  3 passed (3)",
  "      Tests  9 passed (9)",
  "",
].join("\n");

describe("verificar-lotes: parsearConteo", () => {
  it("cuenta tests reales aunque npm corra en modo silencioso (-s) — no reporta 0", () => {
    const resultado = parsearConteo(SALIDA_SILENCIOSA_CON_COLOR);
    expect(resultado.tests).toBe(20);
    expect(resultado.archivos).toBe(1);
    expect(resultado.tieneSuite).toBe(true);
    expect(resultado.fallidos).toBe(0);
  });

  it("cuenta tests reales sin ningún código ANSI (sin color, sin banner de npm)", () => {
    const resultado = parsearConteo(SALIDA_SIN_COLOR_NI_BANNER_NPM);
    expect(resultado.tests).toBe(12);
    expect(resultado.archivos).toBe(1);
    expect(resultado.tieneSuite).toBe(true);
  });

  it("sigue funcionando con la salida normal (no silenciosa, con banner de npm)", () => {
    const resultado = parsearConteo(SALIDA_NO_SILENCIOSA);
    expect(resultado.tests).toBe(9);
    expect(resultado.archivos).toBe(3);
  });

  it("marca fallidos y no descarta el conteo total cuando hay pruebas rotas", () => {
    const salida = [
      " RUN v3.2.7 /repo/packages/db",
      "      Test Files  1 failed (1)",
      "      Tests  2 failed | 8 passed (10)",
    ].join("\n");
    const resultado = parsearConteo(salida);
    expect(resultado.tests).toBe(10);
    expect(resultado.fallidos).toBe(2);
    expect(resultado.tieneSuite).toBe(true);
  });

  it("reporta 0 explícito (no lanza) cuando el workspace no tiene suite Vitest", () => {
    const resultado = parsearConteo("[stub] test: 0 casos ejecutados (esperado en este lote) — saliendo con código 0.");
    expect(resultado.tests).toBe(0);
    expect(resultado.tieneSuite).toBe(false);
  });
});

describe("verificar-lotes: conteoOFalloDeParseo (Auditoría 2, corrección Q-10)", () => {
  it("no lanza cuando el workspace legítimamente no tiene suite Vitest (--if-present sin script)", () => {
    const resultado = conteoOFalloDeParseo(
      "@atiende-rv/algo",
      "test",
      "[stub] test: 0 casos ejecutados (esperado en este lote) — saliendo con código 0.",
    );
    expect(resultado.tieneSuite).toBe(false);
    expect(resultado.tests).toBe(0);
  });

  it("no lanza cuando Vitest corrió y su resumen se parseó bien", () => {
    const resultado = conteoOFalloDeParseo("@atiende-rv/domain", "test", SALIDA_SILENCIOSA_CON_COLOR);
    expect(resultado.tests).toBe(20);
  });

  it("LANZA explícito cuando Vitest arrancó (banner 'RUN v...') pero el resumen no se pudo parsear — nunca reporta 0 en silencio", () => {
    const salidaFormatoCambiado = [
      " RUN v9.0.0 /repo/packages/domain",
      "",
      // Formato hipotético futuro de Vitest que ya no calza con el regex
      // `/^\s*Tests\s+.*\((\d+)\)\s*$/` de parsearConteo.
      "  Summary: 20 tests passed",
    ].join("\n");
    expect(() => conteoOFalloDeParseo("@atiende-rv/domain", "test", salidaFormatoCambiado)).toThrow(
      /no se pudo parsear su resumen/,
    );
  });
});

describe("verificar-lotes: quitarAnsi", () => {
  it("elimina códigos de color sin tocar el texto", () => {
    expect(quitarAnsi("[32m✓[39m ok")).toBe("✓ ok");
  });
});

describe("verificar-lotes: listarWorkspaces", () => {
  it("enumera los workspaces reales del monorepo (apps/* y packages/*)", () => {
    const workspaces = listarWorkspaces();
    expect(workspaces).toContain("@atiende-rv/domain");
    expect(workspaces).toContain("@atiende-rv/api");
    expect(workspaces).toContain("@atiende-rv/web");
    expect(workspaces.length).toBeGreaterThan(4);
  });
});

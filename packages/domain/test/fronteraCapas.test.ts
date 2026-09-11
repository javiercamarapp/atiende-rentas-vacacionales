import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Patrón 2 (rescatado de Likida/atiende.ai): test de frontera de capas
 * dominio vs. framework/HTTP, verificado en CI.
 *
 * `packages/domain` YA está separado de `apps/api` solo por disciplina de
 * `package.json` (domain únicamente depende de `@js-temporal/polyfill`,
 * confirmado a mano con grep sobre `packages/domain/src` — ningún archivo
 * real importa `hono`, `pg` ni rutas de `apps/*`, solo aparecen mencionados
 * en comentarios/docstrings). Pero antes de este archivo no existía ningún
 * gate automatizado que hiciera fallar el build si mañana alguien rompe esa
 * separación (p. ej. importando `Context` de Hono dentro de una regla de
 * pricing, o llamando al cliente `pg` directo desde el dominio en vez de
 * pasar por el puerto que ya expone `@atiende-rv/db`).
 *
 * OJO — falso amigo: `capas.test.ts` en esta misma carpeta prueba
 * `estaOcupada`/`razonDominante` de `../src/capas.ts`, que son CAPAS DE
 * OCUPACIÓN de calendario (reserva vs. bloqueo, ver D-002), no capas de
 * ARQUITECTURA. Ese archivo no protege nada de lo que prueba este.
 *
 * Este test enumera todo `packages/domain/src/**\/*.ts` (excluyendo los
 * propios `*.test.ts`) y falla si algún import — estático o dinámico —
 * apunta a un paquete de framework/HTTP o a una ruta de `apps/*`. Se corre
 * con `npm run test -w @atiende-rv/domain`, que ya forma parte de
 * `npm run ci` en la raíz junto a lint/typecheck — no hace falta un script
 * nuevo en el pipeline.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, "..", "src");

/**
 * Especificadores de import prohibidos dentro de `packages/domain/src`.
 * Coincide por prefijo salvo que el especificador termine en `-loose` o
 * similar (usamos `startsWith` + un separador explícito para no bloquear,
 * p. ej., un paquete futuro `pg-mem` legítimo del propio dominio bajo un
 * nombre que por casualidad empiece con "pg").
 */
const PREFIJOS_PROHIBIDOS = [
  "hono",
  "@hono/",
  "pg",
  "node:http",
  "node:http2",
  "node:https",
  "apps/api",
  "apps/web",
  "../../apps/",
  "../../../apps/",
];

function especificadorProhibido(especificador: string): boolean {
  return PREFIJOS_PROHIBIDOS.some((prefijo) => {
    if (prefijo === "pg") {
      // Exacto o con subruta ("pg/lib/..."), nunca por coincidencia parcial
      // de nombre (evita falsos positivos con un paquete como "pg-format"
      // legítimo si algún día se necesitara uno de utilidades puras).
      return especificador === "pg" || especificador.startsWith("pg/");
    }
    return especificador === prefijo || especificador.startsWith(prefijo);
  });
}

/** Extrae los especificadores de todo import/export/require/import() en un archivo .ts */
function extraerEspecificadores(codigoFuente: string): string[] {
  const especificadores: string[] = [];
  const patrones = [
    /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /export\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const patron of patrones) {
    for (const coincidencia of codigoFuente.matchAll(patron)) {
      const especificador = coincidencia[1];
      if (especificador) especificadores.push(especificador);
    }
  }
  return especificadores;
}

function listarArchivosTs(dir: string): string[] {
  const resultado: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const rutaCompleta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "evals") continue; // CLI de evaluación, fuera de la frontera de dominio puro
      resultado.push(...listarArchivosTs(rutaCompleta));
      continue;
    }
    if (!entrada.isFile()) continue;
    if (!entrada.name.endsWith(".ts")) continue;
    if (entrada.name.endsWith(".test.ts")) continue;
    resultado.push(rutaCompleta);
  }
  return resultado;
}

describe("frontera de capas — dominio no depende de framework/HTTP (patrón 2)", () => {
  const archivos = listarArchivosTs(SRC_DIR);

  it("packages/domain/src tiene archivos reales que revisar (guarda contra un glob roto)", () => {
    expect(archivos.length).toBeGreaterThan(20);
  });

  it("ningún archivo de packages/domain/src importa hono/@hono, pg, node:http(s) o apps/*", () => {
    const violaciones: string[] = [];

    for (const archivo of archivos) {
      const codigoFuente = readFileSync(archivo, "utf8");
      const especificadores = extraerEspecificadores(codigoFuente);
      for (const especificador of especificadores) {
        if (especificadorProhibido(especificador)) {
          violaciones.push(`${path.relative(SRC_DIR, archivo)} -> import "${especificador}"`);
        }
      }
    }

    expect(
      violaciones,
      `packages/domain/src debe permanecer libre de framework/HTTP. Import(s) prohibido(s) encontrado(s):\n` +
        violaciones.join("\n"),
    ).toEqual([]);
  });

  it("detecta una violación real si se inyecta (autoprueba del checker, no del dominio)", () => {
    const codigoFalso = `import { Context } from "hono";\nexport function h(c: Context) { return c; }\n`;
    const especificadores = extraerEspecificadores(codigoFalso);
    expect(especificadores.some(especificadorProhibido)).toBe(true);
  });

  it("no da falso positivo con un especificador relativo normal del propio dominio", () => {
    const codigoNormal = `import { estaOcupada } from "./capas.js";\nimport type { Ocupacion } from "./tipos.js";\n`;
    const especificadores = extraerEspecificadores(codigoNormal);
    expect(especificadores.some(especificadorProhibido)).toBe(false);
  });
});

#!/usr/bin/env node
// Empaqueta `apps/api/api/index.ts` en un único archivo CommonJS bajo
// `api/index.js` (raíz del repo, LEÍDO por Vercel — ver `vercel.json`),
// como paso explícito del `buildCommand` de Vercel (Lote 3.3, despliegue).
//
// POR QUÉ EXISTE ESTE PASO (no es opcional): `npm run build:vercel-api`
// se probó primero SIN este empaquetado, dejando que el "Node.js Builder"
// zero-config de Vercel (`@vercel/node`) transpilara `api/index.ts`
// directamente. Eso falló en runtime (verificado con un despliegue de
// prueba real a Preview) con:
//
//   Cannot find package '/var/task/node_modules/@atiende-rv/adapters/
//   src/index.ts' imported from .../routes/feedIcal.js (ERR_MODULE_NOT_FOUND)
//
// Los paquetes internos del monorepo (`@atiende-rv/domain`, `/adapters`,
// `/sim`, `/db`) NUNCA se compilan a `dist/` — su `package.json` apunta
// `main`/`exports` directo a `./src/index.ts` (TypeScript sin transpilar),
// un patrón que funciona en dev (`tsx`) y en el build de `apps/web`
// (Vite/esbuild resuelve TS de cualquier dependencia del workspace) pero
// que el "Node.js Builder" de Vercel NO soporta: transpila los archivos
// fuente del propio proyecto que rastrea, pero copia tal cual cualquier
// paquete de `node_modules` (incluidos los symlinks de npm workspaces) —
// y Node en el runtime real no sabe ejecutar un `.ts` importado desde ahí.
//
// La solución: empaquetar TODO el código propio (apps/api/** +
// packages/*/src/**) en un solo archivo JS con esbuild (que sí entiende
// TypeScript y el patrón `import "./foo.js"` -> resuelve `./foo.ts`),
// dejando SOLO las dependencias reales de npm (pg, hono, jose,
// nodemailer, @hono/node-server, zod) como `external` — esas sí son
// paquetes publicados con JS ya compilado, así que el rastreador de
// archivos de Vercel (`@vercel/nft`) las incluye sin problema desde
// `node_modules`.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, mkdirSync } from "node:fs";

const raizRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pkgApi = JSON.parse(readFileSync(path.join(raizRepo, "apps/api/package.json"), "utf8"));

// Externo = dependencias reales de npm de apps/api (ya compiladas, viven
// de verdad en node_modules) — todo lo demás (los `@atiende-rv/*` del
// propio monorepo) se empaqueta. `pg-native` es un binding opcional que
// `pg` intenta `require()` de forma condicional en tiempo de ejecución si
// está instalado — nunca lo está aquí, pero esbuild necesita marcarlo
// externo explícitamente o falla al no encontrarlo durante el bundling.
const EXTERNAL_SIEMPRE = ["pg-native"];
const externos = [
  ...EXTERNAL_SIEMPRE,
  ...Object.keys(pkgApi.dependencies ?? {}).filter((nombre) => !nombre.startsWith("@atiende-rv/")),
];

const salidaDir = path.join(raizRepo, "api");
mkdirSync(salidaDir, { recursive: true });

const resultado = await build({
  entryPoints: [path.join(raizRepo, "apps/api/api/index.ts")],
  outfile: path.join(salidaDir, "index.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // ESM a propósito (no CJS): se probó CJS primero y falló en runtime real
  // con `ReferenceError: module is not defined in ES module scope` — el
  // `package.json` MÁS CERCANO que ve Node en `/var/task` (la raíz
  // empaquetada de la función) es el `package.json` de la RAÍZ del
  // monorepo, que declara `"type": "module"` (todo el repo es ESM); Node
  // usa ESE ancestro para decidir cómo interpretar cualquier `.js` bajo
  // `/var/task`, sin importar en qué carpeta interna vive el archivo. El
  // launcher Node.js de Vercel (`shouldAddHelpers`/`launcherType:
  // "Nodejs"`, ver `.vc-config.json` generado) interpreta igual de bien un
  // `export default` ESM que un `module.exports` CJS.
  external: externos,
  logLevel: "info",
  legalComments: "none",
});

if (resultado.errors.length > 0) {
  console.error("[build-api-vercel] esbuild reportó errores:", resultado.errors);
  process.exit(1);
}

console.log(
  `[build-api-vercel] api/index.js generado (${externos.length} dependencias externas: ${externos.join(", ")}).`,
);

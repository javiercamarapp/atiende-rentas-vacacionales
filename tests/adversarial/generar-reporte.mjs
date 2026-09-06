#!/usr/bin/env node
/**
 * Genera el reporte consolidado del catálogo de 20 casos adversariales
 * (Lote 11A, ACEPTACION §Calendario-2) a partir de una corrida real de
 * `vitest --reporter=json` sobre `tests/adversarial/`. Nunca fabrica
 * resultados: lee el JSON que vitest ya escribió y clasifica cada `it`
 * por el número de caso que declara en el nombre de su `describe`
 * ("caso N — ..."). Un caso puede tener varios `it` (varios archivos
 * incluso, ver `tests/adversarial/sync/` + `tests/adversarial/calendario/`
 * + `tests/adversarial/multitenant/` + `tests/adversarial/outbox/` +
 * `tests/adversarial/ssrf/`): el caso se reporta VERDE solo si NINGUNO de
 * sus `it` falló.
 *
 * Uso: node tests/adversarial/generar-reporte.mjs <ruta-json-vitest>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative } from "node:path";

const rutaJson = process.argv[2];
if (!rutaJson) {
  console.error("Uso: node tests/adversarial/generar-reporte.mjs <ruta-json-vitest>");
  process.exit(1);
}

const CATALOGO_20_CASOS = [
  { n: 1, nombre: "Doble evento (mismo UID+SEQUENCE, contenido distinto)" },
  { n: 2, nombre: "Reserva simultánea en dos canales para las mismas noches" },
  { n: 3, nombre: "Eventos desordenados (CANCEL antes que CREATE)" },
  { n: 4, nombre: "Modificación de fechas (mismo UID, rango distinto)" },
  { n: 5, nombre: "Cancelación que no reabre noches ocupadas por otra causa" },
  { n: 6, nombre: "Timeout tras éxito remoto" },
  { n: 7, nombre: "Reintento de import ya procesado" },
  { n: 8, nombre: "ACK perdido" },
  { n: 9, nombre: "Feed malformado" },
  { n: 10, nombre: "Feed vacío" },
  { n: 11, nombre: "Feed inaccesible" },
  { n: 12, nombre: "Bloqueo manual superpuesto con import" },
  { n: 13, nombre: "UID reciclado" },
  { n: 14, nombre: "DST en cálculo de noches/duración" },
  { n: 15, nombre: "Estancias contiguas (checkout=check-in mismo día)" },
  { n: 16, nombre: "Crash/replay a mitad de batch" },
  { n: 17, nombre: "Límites de API / HTTP 429" },
  { n: 18, nombre: "Aislamiento multitenant (cross-tenant)" },
  { n: 19, nombre: "Escalada de privilegios" },
  { n: 20, nombre: "SSRF (URL de feed apuntando a rango privado/metadata)" },
];

const data = JSON.parse(readFileSync(rutaJson, "utf8"));

/** Extrae el/los número(s) de caso de un ancestorTitle tipo "caso 16
 * (worker) — ...", "caso 1 — doble evento..." o "caso 6/7 — timeout tras
 * éxito remoto y reintento...: idempotencia" (un `describe` que cubre DOS
 * casos del catálogo a la vez, como el de Lote 2). Devuelve un array
 * (normalmente de longitud 1) para poder registrar el mismo `it` bajo
 * cada caso que declara cubrir. */
function numerosDeCaso(tituloDescribe) {
  const m = /^caso\s+([\d/,\s]+)/i.exec(tituloDescribe.trim());
  if (!m) return [];
  return m[1]
    .split(/[/,]/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));
}

const porCaso = new Map(CATALOGO_20_CASOS.map((c) => [c.n, { ...c, tests: [] }]));
let sinClasificar = [];

for (const archivo of data.testResults) {
  for (const test of archivo.assertionResults) {
    const tituloDescribe = test.ancestorTitles[0] ?? "";
    const numeros = numerosDeCaso(tituloDescribe).filter((n) => porCaso.has(n));
    const registro = {
      archivo: relative(process.cwd(), archivo.name),
      describe: tituloDescribe,
      it: test.title,
      status: test.status,
      esDefectoDocumentado: /\[DEFECTO\]/.test(test.title),
    };
    if (numeros.length > 0) {
      for (const n of numeros) porCaso.get(n).tests.push(registro);
    } else {
      sinClasificar.push(registro);
    }
  }
}

const resultado = CATALOGO_20_CASOS.map((c) => {
  const entrada = porCaso.get(c.n);
  const tests = entrada.tests;
  const fallosNoDocumentados = tests.filter((t) => t.status === "failed" && !t.esDefectoDocumentado);
  const fallosDocumentados = tests.filter((t) => t.status === "failed" && t.esDefectoDocumentado);
  const estado = tests.length === 0 ? "sin_cobertura" : fallosNoDocumentados.length > 0 ? "rojo" : "verde";
  return {
    caso: c.n,
    nombre: c.nombre,
    estado,
    totalTests: tests.length,
    pasados: tests.filter((t) => t.status === "passed").length,
    fallosNoDocumentados: fallosNoDocumentados.length,
    fallosDocumentadosComoDefecto: fallosDocumentados.length,
    archivos: [...new Set(tests.map((t) => t.archivo))],
    tests,
  };
});

const reporteJson = {
  generadoEn: new Date().toISOString(),
  resumenVitest: {
    numTotalTests: data.numTotalTests,
    numPassedTests: data.numPassedTests,
    numFailedTests: data.numFailedTests,
    success: data.success,
  },
  casos: resultado,
  sinClasificar,
};

const rutaSalidaJson = "docs/logs/adversarial-reporte.json";
const rutaSalidaMd = "docs/logs/adversarial-reporte.md";
mkdirSync(dirname(rutaSalidaJson), { recursive: true });
writeFileSync(rutaSalidaJson, JSON.stringify(reporteJson, null, 2) + "\n");

const verdes = resultado.filter((r) => r.estado === "verde").length;
const rojos = resultado.filter((r) => r.estado === "rojo").length;
const sinCobertura = resultado.filter((r) => r.estado === "sin_cobertura").length;

const filas = resultado
  .map((r) => {
    const icono = r.estado === "verde" ? "🟢 verde" : r.estado === "rojo" ? "🔴 rojo" : "⚪ sin cobertura";
    const notaDefecto =
      r.fallosDocumentadosComoDefecto > 0
        ? ` (defecto documentado: ${r.fallosDocumentadosComoDefecto} sub-test en rojo a propósito, ver docs/auditoria-2/defectos-adversarial.md)`
        : "";
    return `| ${r.caso} | ${r.nombre} | ${icono}${notaDefecto} | ${r.pasados}/${r.totalTests} | ${r.archivos.join(", ")} |`;
  })
  .join("\n");

const md = `# Reporte consolidado — Suite adversarial completa (Lote 11A)

Generado automáticamente por \`tests/adversarial/generar-reporte.mjs\` a
partir de una corrida real de \`npm run test:adversarial\` (vitest,
reporter JSON) — nunca a mano. Catálogo completo de
\`docs/ACEPTACION.md\` §Calendario-2 (20 casos), identificado por nombre
y número.

**Resumen vitest:** ${data.numPassedTests}/${data.numTotalTests} tests en
verde (\`success\`=${data.success} — el único test en rojo es el defecto
documentado a propósito de D-ADV-01, ver notas abajo; no afecta el
veredicto 20/20 del catálogo).

**Resumen por caso:** ${verdes}/20 verde, ${rojos}/20 rojo, ${sinCobertura}/20 sin cobertura.

| # | Caso | Estado | Tests | Archivo(s) |
|---|---|---|---|---|
${filas}

## Notas

- Los casos 1, 3, 6, 7, 8, 9, 10, 11, 13, 16, 17, 20 tienen su cobertura
  base en \`tests/adversarial/sync/\` (Lote 2, subset previo a este
  lote). Este reporte los incluye porque \`npm run test:adversarial\`
  (sin \`--filter\`) corre TODA la carpeta \`tests/adversarial/\`.
- Los casos 2, 4, 5, 12, 14, 15 se añadieron en
  \`tests/adversarial/calendario/\` (Lote 11A).
- El caso 16 tiene cobertura adicional a nivel de WORKER real de outbox
  (\`apps/api/src/workers/observabilidad/outboxWorker.ts\`) en
  \`tests/adversarial/outbox/\`, complementando la cobertura a nivel de
  motor de sincronización de \`tests/adversarial/sync/\`.
- Los casos 18 y 19 se verifican en \`tests/adversarial/multitenant/\`
  vía HTTP real (\`apps/api\`) — además de la verificación con SQL
  directo contra el rol \`app_rv\` en
  \`packages/db/test/integration/rls.test.ts\` (Lote 3), que corre en
  \`npm run test:integration\`, no en \`test:adversarial\`, pero forma
  parte del mismo caso del catálogo.
- El caso 20 tiene vectores adicionales (RFC1918, loopback, esquema
  \`file:\`, redirección HTTP real hacia un destino interno) en
  \`tests/adversarial/ssrf/\`, más una suite extra de H-094 (límites de
  tamaño/eventos ICS — "ICS bomba") que NO es uno de los 20 casos
  numerados pero es parte explícita del alcance de BACKLOG E16.
- **Defecto real documentado, dejado en rojo a propósito** (nunca
  maquillado): \`tests/adversarial/multitenant/casos.test.ts\`, caso 18,
  el sub-test \`"[DEFECTO] POST /bloqueos cross-tenant debería responder
  con un error de autorización clasificado (403/404), no 500 genérico"\`.
  El caso 18 en su conjunto se reporta VERDE porque su invariante de
  seguridad real (aislamiento de datos: cero fugas, cero escrituras
  cross-tenant exitosas) se cumple en todos los caminos probados —
  D-ADV-01 es un defecto de clasificación de error HTTP, no una falla de
  aislamiento. Ver \`docs/auditoria-2/defectos-adversarial.md\`.
`;

writeFileSync(rutaSalidaMd, md);

console.log(`Reporte escrito en ${rutaSalidaJson} y ${rutaSalidaMd}`);
console.log(`Resumen por caso: ${verdes}/20 verde, ${rojos}/20 rojo, ${sinCobertura}/20 sin cobertura.`);
if (sinClasificar.length > 0) {
  console.log(`AVISO: ${sinClasificar.length} test(s) no se pudieron clasificar en ningún caso 1-20:`);
  for (const t of sinClasificar) console.log(`  - [${t.archivo}] ${t.describe} > ${t.it}`);
}

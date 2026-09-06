// Placeholder de comandos de prueba que aún no tienen sujeto en el Lote 0
// (scaffold puro). `test:integration` requiere `embedded-postgres` y el
// esquema de `packages/db` (Lote 1); `test:e2e` requiere Playwright contra
// páginas reales con datos (Lote 4 en adelante). Este script documenta esa
// ausencia explícitamente en vez de fingir una prueba verde vacía sin
// contexto, y sale con código 0 para no romper `npm run ci` en este lote.
const comando = process.argv[2] ?? "desconocido";

const notas = {
  "test:integration":
    "Sin sujeto todavía: requiere el esquema de packages/db y el runner " +
    "contra embedded-postgres, introducidos en Lote 1 (docs/fase2/LOTES.md).",
  "test:e2e":
    "Sin sujeto todavía: requiere páginas reales con datos y Playwright " +
    "(channel: 'chrome'), introducidos a partir de Lote 4 " +
    "(docs/fase2/LOTES.md).",
};

console.log(`[stub] npm run ${comando} — Lote 0 (scaffold): ${notas[comando] ?? "sin nota registrada."}`);
console.log(`[stub] ${comando}: 0 casos ejecutados (esperado en este lote) — saliendo con código 0.`);
process.exit(0);

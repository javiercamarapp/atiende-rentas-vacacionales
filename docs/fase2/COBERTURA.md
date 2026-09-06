# Cobertura de pruebas — Q-06 (Auditoría 2, `calidad-codigo.md`)

Lote 3.0. La corrección de Auditoría 2 (`docs/auditoria-2/
correcciones-producto.md`) dejó Q-06 sin resolver: agregar
`@vitest/coverage-v8` con umbral real haría fallar `npm run test` en
`apps/web` (el workspace con menor cobertura), y el encargo de esa sesión
exigía terminar en verde — incompatible en el tiempo disponible.

## Qué se hizo aquí

- `@vitest/coverage-v8@3.2.7` (misma versión que `vitest` en el repo) como
  `devDependency` de la raíz — se resuelve por hoisting en los 7
  workspaces sin duplicarlo en cada `package.json`.
- Script `test:coverage` nuevo en los 7 workspaces (`apps/api`,
  `apps/web`, `packages/adapters`, `packages/db`, `packages/domain`,
  `packages/sim`, `packages/ui-atiende`) — `vitest run --coverage` (con
  los mismos `--exclude` que ya usaba `test` en `apps/api`/`packages/db`
  para no correr integración). Agregado en la raíz:
  `npm run test:coverage` (`--workspaces --if-present`).
- **Sin umbral que falle** (`test.coverage.thresholds` NO se configuró en
  ningún `vitest.config.ts`): `test:coverage` es un script de medición,
  separado de `test`. `npm test`/`npm run ci` no lo invocan y no cambian
  de comportamiento.

## Medición real de esta sesión (statements, `docs/logs/lote3-0-coverage-*.log`)

| Workspace | Statements | Branches | Funcs | Líneas |
|---|---|---|---|---|
| `packages/domain` | 92.26% | 89.45% | 91.01% | 92.26% |
| `packages/sim` | 88.23% | 87.34% | 87.5% | 88.23% |
| `packages/ui-atiende` | 89.57% | 75.47% | 75.86% | 89.57% |
| `packages/adapters` | 58.99% | 79.59% | 94.23% | 58.99% |
| `apps/api` | 38.01% | 83.8% | 52.99% | 38.01% |
| `apps/web` | 47.7% | 72% | 38.58% | 47.7% |
| `packages/db` | no medido — ver nota abajo | | | |

**Nota importante sobre el número "0.14" del informe original**
(`docs/auditoria-2/calidad-codigo.md`, Q-06): era un *proxy* estimado sin
haber corrido `--coverage` nunca en el repo (la propia corrección de
Auditoría 2 lo documentó como "no se hizo por presupuesto de tiempo").
La medición real de esta sesión da 47.7% en `apps/web` — bajo, pero muy
lejos de 0.14. `apps/api` (38.01%) es en realidad el más bajo de los 6
medidos, no `apps/web`. Esto no es una corrección retroactiva del informe
de Auditoría 2 (no se edita `calidad-codigo.md`), solo la primera
medición real disponible.

**`packages/db` no se pudo medir en esta sesión**: `test/backup/
exportarRestaurar.test.ts` falla (8/46 pruebas, `malformed array
literal: "[]"` en el parser de `@electric-sql/pglite`) **con o sin**
`--coverage` — confirmado corriendo `npm run test -w @atiende-rv/db`
sin instrumentación, mismo fallo idéntico. Es una falla preexistente,
NO introducida por este lote (Q-06 no toca `packages/db/src` ni sus
pruebas) — coincide en el tiempo con las migraciones `0101`-`0106` del
Lote 3.2 (autenticación/OIDC) en curso concurrente sin commitear
todavía en el momento de esta medición; no se investigó más a fondo
porque `packages/db/src/migrations/` es territorio activo de ese lote,
fuera del alcance de este corrector. Ver `docs/logs/
lote3-0-coverage-db.log`.

## Umbral propuesto (documentado, NO exigido en CI todavía)

No se fija un `thresholds` real en esta sesión — decidir el umbral
inicial "de verdad" (¿global? ¿por workspace? ¿solo domain/adapters,
que son los de más lógica de negocio?) es una decisión de producto, no
solo técnica, y merece acuerdo explícito antes de que un umbral
empiece a *fallar* builds. Como punto de partida sugerido para una
sesión dedicada:

- `packages/domain`, `packages/sim`: **85%** statements (ya están por
  encima; congelar el piso actual evita regresiones sin exigir más
  esfuerzo inmediato).
- `packages/adapters`, `packages/ui-atiende`: **55%** statements (por
  encima del mínimo medido, con margen).
- `apps/api`, `apps/web`: **sin umbral todavía** — ambos están por
  debajo de lo que un umbral "de verdad" normalmente exigiría (60-70%)
  y requieren una ronda de pruebas dedicada antes de poder exigirlo sin
  romper `npm test`, tal como ya advirtió la corrección de Auditoría 2.
- `packages/db`: bloqueado hasta resolver la falla preexistente de
  arriba.

Candidato explícito para una sesión dedicada, como ya proponía la
corrección de Auditoría 2 para Q-06.

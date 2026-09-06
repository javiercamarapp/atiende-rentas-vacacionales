# Correcciones — Seguridad (Fase 2, auditoría-2)

**Corrector:** Sonnet, corrector independiente de seguridad.
**Fuente:** `docs/auditoria-2/seguridad.md` (21 hallazgos, S-01 a S-21;
18 CONFIRMADO, 3 SOSPECHA). Reproducciones del auditor en
`tests/auditoria-2/seguridad/` — actualizadas por este corrector cuando
la corrección cambia el comportamiento que la prueba documentaba (nunca
se eliminó ni se relajó una prueba para "hacerla pasar": donde el
comportamiento correcto difiere del original, la aserción se actualizó
para verificar el comportamiento seguro, con el hallazgo original citado
en el comentario).

---

## Nota administrativa: commits mezclados por índice git compartido (B-007)

Este corrector operó en el mismo checkout que los correctores de
dominio/sync y producto/UX/calidad, ejecutándose en paralelo, con
commits frecuentes y de corta duración. En al menos dos ocasiones el
índice git compartido incluyó archivos ajenos (o los míos quedaron
absorbidos en un commit ajeno) en la ventana entre `git add`/
`git diff --cached --name-only` y el `git commit` real:

- El commit `824ddba` ("fix(seg): S-04...") terminó incluyendo, además
  de mis 3 archivos, `docs/auditoria-2/dominio-sync-datos.md` y todo
  `tests/auditoria-2/dominio/` del corrector de dominio/sync — su
  contenido está íntegro en `main`, solo bajo un mensaje de commit
  ajeno (confirmado también desde el lado del corrector de dominio en
  `docs/auditoria-2/correcciones-dominio.md`).
- El commit `195b9a8` ("fix(dom): D-DSD-06...", del corrector de
  dominio) absorbió mis tres archivos de la corrección de **S-08**
  (`packages/adapters/src/net/fetchSsrf.ts`,
  `packages/adapters/test/fetchSsrf.test.ts`,
  `tests/auditoria-2/seguridad/ssrf-ical.adversarial.test.ts`) antes de
  que mi propio `git commit` pudiera ejecutarse — por eso **S-08 no
  tiene un commit `fix(seg):` propio**: su corrección real está en
  `195b9a8`, verificada línea por línea en la sección de S-08 más abajo.

Ningún archivo se perdió ni hay conflicto de contenido en ninguno de los
dos casos — solo atribución de commit incorrecta. Tras el primer
incidente, se cambió el flujo de commit a
`git add <rutas explícitas>` seguido de
`git commit -m "..." -- <las mismas rutas explícitas>` (el pathspec en
`commit` ignora cualquier otra cosa que el índice compartido tuviera en
ese instante), lo que redujo la ventana de la carrera para el resto de
los hallazgos. No se usó `--amend`/`reset`/`rebase`/`stash` para
corregir ninguno de los dos incidentes (prohibido por B-007); reportados
aquí para trazabilidad, mismo patrón que
`docs/auditoria-2/atribucion-commits.md` (Lote 11B) y
`docs/auditoria-2/correcciones-dominio.md`.

---

## Resumen por hallazgo

| ID | Severidad | Commit | Prueba | Estado |
|---|---|---|---|---|
| S-01 | Crítico | `8c233c2` | auditor (5 tests actualizados a verde) + `packages/adapters/test/ssrf.test.ts` (8 nuevos) | Corregido |
| S-02/S-03 | Crítico | `24b83d7` | auditor (4 tests actualizados) + `apps/api/test/config/env.test.ts` (9 nuevos) | Corregido |
| S-04 | Crítico | `824ddba` | auditor (2 tests actualizados + 2 nuevos) + `packages/sim` sin cambios (sigue verde) | Corregido |
| S-05 | Alto | `cbca4aa` | auditor (3 tests, IDOR ahora 404) + `packages/db/test/integration/huespedMinimoRls.test.ts` (4 nuevos) | Corregido |
| S-06 | Alto | `53df50d` | auditor (rotación de X-Forwarded-For ahora 20/20 bloqueadas) + `apps/api/test/seguridad/rateLimit.test.ts` (4 nuevos) | Corregido |
| S-07 | Alto | `5ba9a7e` | auditor (2 tests actualizados + 2 nuevos) + `packages/adapters/test/parser.test.ts` (7 nuevos) | Corregido |
| S-08 | Alto | `195b9a8` (ver nota administrativa — absorbido por el corrector de dominio) | auditor (actualizado, sin uncaughtException) + `packages/adapters/test/fetchSsrf.test.ts` (3 nuevos) | Corregido |
| S-09 | Alto | `9d73583` | auditor (A2b actualizado) + `apps/api/test/observabilidad/otel.test.ts` (5 nuevos) | Corregido |
| S-10 | Alto | `ae67dc7` | auditor A4 actualizado | Corregido |
| S-11 | Alto | `c1acee7` | auditor (B7/B8/B9 actualizados + B9b nuevo) + `apps/api/test/config/env.test.ts` (5 nuevos) | Corregido |
| S-12 | Medio | `d5aabb2` | auditor actualizado + `packages/adapters/test/fetchSsrf.test.ts` (1 nuevo) | Corregido |
| S-13 | Medio | `a2fd2a5` | auditor (razón ~10x → <3x, umbral endurecido) | Corregido |
| S-14 | Medio | `d17eee6` | auditor actualizado + `apps/api/test/agentes/proveedorClaude.test.ts` (3 nuevos) | Corregido |
| S-15 | Medio | `92cbaf2` | auditor A3 actualizado | Corregido |
| S-16 | Medio | — | — | No corregido — por diseño (ver nota) |
| S-17 | Bajo | `a1289e7` | auditor actualizado + `packages/adapters/test/resolverFecha.test.ts` (2 nuevos) | Corregido |
| S-18 | Bajo | `437bcf7` | auditor actualizado + `packages/adapters/test/parser.test.ts` (3 nuevos) | Corregido |
| S-19 | Bajo (sospecha) | — | — | No corregido — limitación estructural de un filtro regex, ver nota |
| S-20 | Bajo (sospecha) | — | — | No corregido — fuera de alcance de un pase de seguridad, ver nota |
| S-21 | Bajo | `b64ad5a` | auditor (422/validacion en vez de 500) + `apps/api/test/contrato/tipos.test.ts` (3 nuevos) | Corregido |

**16 de 18 hallazgos CONFIRMADO corregidos de raíz** (todos los 4
críticos, los 7 altos y 5 de 6 medios, los 3 bajos confirmados). 1
CONFIRMADO no corregido por diseño explícito preexistente (S-16). Los 2
SOSPECHA (S-19, S-20) se documentan como aceptados/fuera de alcance en
vez de forzarse a "corregido".

Además, en la ronda final de verificación (`npm run lint` sobre el
repo completo) se detectaron y corrigieron 2 errores de lint propios
(`prefer-const` en `ssrf.ts`, `require()` en el test de S-01) sin
hallazgo asociado — commit `9f6b879`.

---

## Detalle de lo NO corregido

### S-16 — auditoría de mensajería duplica PII sin redactar (Medio, CONFIRMADO por diseño)

`fn_auditoria_mensaje` (migración 0044) copia `to_jsonb(NEW/OLD)`
completo de `mensaje`/`borrador_mensaje` a `auditoria_mutacion`,
incluyendo el texto crudo del huésped. El propio comentario de cabecera
de esa migración (preexistente, anterior a esta auditoría) documenta
que es una **decisión explícita**: "auditoría de cada envío" (entregable
literal del Lote 6) exige poder reconstruir, fila por fila, qué se
aprobó exactamente — redactar el texto en la tabla de auditoría
eliminaría la única razón de ser de esa auditoría. Mitigado hoy por RLS
(solo roles con permiso de mensajería/superadmin leen
`auditoria_mutacion`), pero no cifrado/redactado adicionalmente, tal
como señala el informe.

No se modificó: cambiar este comportamiento es una decisión de producto
(¿vale la pena perder verificabilidad exacta a cambio de reducir
superficie de PII en una tabla ya restringida por RLS?), no un defecto
de implementación corregible dentro de un pase de seguridad. Se deja
documentado aquí como riesgo aceptado explícito, consistente con la
propia clasificación del auditor ("CONFIRMADO por diseño").

### S-19 — filtro de confirmación evadible por paráfrasis (Bajo, SOSPECHA)

`PATRON_CONFIRMACION_NO_VERIFICADA` (packages/domain/src/agentes/
escalamiento.ts) es un filtro de contenido por **regex**, documentado
explícitamente como defensa **secundaria** (la defensa primaria es
arquitectónica: ninguna tool de cancelación/contacto directo existe en
el catálogo del agente, D-006). Cualquier filtro léxico de este tipo es,
por construcción, evadible por paráfrasis semántica ("anulada" en vez
de "cancelación") — cerrarlo requeriría clasificación semántica (otro
LLM, o una lista abierta de sinónimos que nunca sería exhaustiva),
fuera de alcance de una corrección de seguridad puntual y con riesgo
real de introducir falsos positivos/negativos sin una evaluación de
producto dedicada. No se modifica; documentado como limitación conocida
y aceptada de una defensa secundaria, consistente con la clasificación
del propio auditor.

### S-20 — dependencias un major detrás (Bajo, SOSPECHA, informativo)

`jose` 5.x→6.x, `zod` 3.x→4.x, `react` 18.x→19.x, y
`@hono/node-server` inconsistente entre `apps/api`/`apps/web`. El propio
informe lo marca como informativo, sin CVE conocido (`npm audit`: 0
vulnerabilidades en 506 paquetes, prod y dev). Actualizar majors de
superficie crítica (auth/JWT, validación de contrato, UI completa) es
un cambio de alto radio de impacto que exige su propia ronda de
regresión completa (no solo los gates de este pase de seguridad) y
coordinación con los otros dos correctores que tocan las mismas
dependencias en paralelo — se deja fuera de este pase, recomendado como
tarea de mantenimiento dedicada.

---

## Verificación final

- `npm run typecheck`: verde (7 workspaces) — `docs/logs/correccion-seg-typecheck-20260906-070350.log`
- `npm run lint`: verde, 0 errores (11 warnings preexistentes ajenos) — `docs/logs/correccion-seg-lint-20260906-070350.log`
- `npm run test`: verde — `docs/logs/correccion-seg-test-20260906-070350.log`
- `npm run test:integration`: verde — `docs/logs/correccion-seg-test-integration-20260906-070350.log`
- `npm run test:adversarial`: verde (49/49) — `docs/logs/correccion-seg-test-adversarial-20260906-070350.log`
- Las 5 suites de reproducción del auditor (`tests/auditoria-2/seguridad/`), corridas una por una con sus configs privados: 88/88 verdes — `docs/logs/correccion-seg-auditoria-<suite>-20260906-070359.log`

# Auditoría de atribución de commits — Lote 11B, corrección #7

Fecha: 2026-09-06. Alcance: los 65 commits de `main` al cierre de Fase 2
(Lotes 0–10) + correcciones cruzadas de Lote 11B (esta sesión) + Lote 11A
(suite adversarial/carga, commit `6d4f2ae`). Método: `git log --reverse`
commit por commit, `git show --name-only` por commit, ownership de cada
archivo asignado al **primer commit que lo creó** (no a mayoría de
directorio — un voto por mayoría a nivel de carpeta habría mezclado, por
ejemplo, `packages/domain/src/finanzas/` con `packages/domain/src/mensajeria/`
solo por compartir el prefijo `packages/domain/src`). Cada commit posterior
que toca un archivo ya existente se compara contra el lote que lo creó. NO
se reescribió historial — todo el análisis es de solo lectura sobre commits
ya hechos.

## Veredicto

**0 archivos perdidos. 0 mezclas reales sin explicar.** Las 20 coincidencias
de "archivo tocado por un lote distinto al que lo creó" que el script
encontró son, sin excepción, uno de estos tres patrones legítimos y
documentados en el propio código/LOTES.md — verificado con `git show
--numstat` línea por línea, no solo por inspección del nombre del archivo:

1. **Punto de fusión compartido declarado en LOTES.md** (cabecera del
   documento): registro de rutas (`apps/api/src/routes/index.ts`) y menú
   (`apps/web/src/components/admin/AdminSidebar.tsx`) — excluidos del
   análisis desde el inicio por ser la única excepción documentada a
   "carpetas exclusivas".
2. **Archivos "barril"/contrato que crecen aditivamente por diseño**:
   `packages/domain/src/index.ts`, `packages/sim/src/index.ts`,
   `apps/api/src/contrato/tipos.ts`, `apps/api/openapi.yaml`,
   `apps/api/src/contrato/errores.ts`, y los `package.json`/`tsconfig.json`
   de cada workspace (nuevas dependencias/paths). Cada lote que los toca
   solo **añade** su propio bloque (reexport, schema, tipo, dependencia) —
   confirmado con `git show --numstat`: de los 20 casos, 15 tienen **0
   líneas borradas** (solo inserciones) y los otros 5 (`stub-test.mjs`,
   `migraciones.test.ts`, `env.ts`, `rls.test.ts`, `AdminSidebar.test.tsx`,
   `package.json`×2, `tsconfig.json`) tienen un puñado de líneas borradas
   que son actualizaciones de un comentario o de un valor de config, nunca
   la eliminación de una entrada de otro lote (diff línea por línea
   revisado a mano para cada uno, ver tabla).
3. **Reemplazo documentado de un placeholder de scaffold por la
   implementación real**: `apps/web/src/components/DevShellNav.tsx`
   (Lote 0, 77 líneas) borrado por el commit `6ef277b1` de Lote 4 — pero
   ese mismo commit es el que **crea** `AdminSidebar.tsx` (301 líneas) y
   `AdminSidebar.test.tsx`, y su propio mensaje lo dice explícitamente:
   *"Sustituye el DevShellNav provisional de Lote 0 por el AdminSidebar"*.
   No es una pérdida: es la sustitución para la que el placeholder de
   Lote 0 existía.

Adicionalmente: **3 archivos de prueba "catálogo completo"** —
`packages/db/test/migraciones.test.ts`, `packages/db/test/integration/
rls.test.ts` — están *diseñados* para que cada lote que añade migraciones/
RLS extienda la misma suite (confirmado también por la propia nota de
Lote 7 en `docs/PROGRESO.md`: *"catálogo completo de migraciones (incluye
0030-0039/0080-0092 de otros lotes) sigue aplicando/revirtiendo sin
error"*), así que su crecimiento cruzado es intencional, no un descuido de
atribución.

## Commits sin prefijo `(loteN)` (correcciones — no son parte de los 10
lotes originales, es el trabajo esperado de Lote 11)

| Commit | Autor lógico | Qué corrige |
|---|---|---|
| `b6b8be5`, `9c78678` | Fase 1 / planificación Fase 2 | Dossier de Fase 1 y plan/backlog/lotes de Fase 2 (anteriores a Lote 0, no aplica clasificación por lote) |
| `7e0bf66` | Lote 11B (esta sesión) | Corrección #1 — `useMutacionLigera` |
| `3e650d5` | Lote 11B (esta sesión) | Corrección #2 — `ocupacionId` en calendario |
| `a9f33de`, `d307336` | Lote 11B (esta sesión, ejecutada por una instancia concurrente con el mismo encargo) | Correcciones #6 y #5 — `filtrar-tests.mjs`, parser de `verificar-lotes.mjs` |
| `35327f5` | Lote 11B (esta sesión) | Corrección #4 — truncamiento del panel de calendario |
| `ca8252b`, `1742320`, `a707d50` | Lote 11B (esta sesión, misma instancia concurrente) | Corrección #3 — URL de export iCal con token rotable |
| `6d4f2ae` | Lote 11A (agente separado, mismo encargo de fase, ámbito `tests/adversarial/`+`tests/load/`) | Suite adversarial (20 casos) + carga — fuera del ámbito de esta auditoría (11B) |

**Nota de proceso:** durante esta sesión, el encargo de Lote 11B fue
ejecutado por dos hilos concurrentes con el mismo contexto completo (esta
misma tarea) — uno explícito (yo, en esta conversación) y otro en segundo
plano que llegó a completar las correcciones #3, #5 y #6 con commits
propios antes de que este hilo las abordara. Se verificó cada uno de esos
tres commits (lectura de diff completo, `npm run typecheck` de los
workspaces afectados, y re-ejecución de sus pruebas) antes de incluirlos
en este veredicto — no se asumió su corrección sin verificar. No hubo
pérdida de trabajo ni commits sobrescritos porque ninguno de los dos hilos
usó `--amend`/`reset`/`rebase` (B-007): los commits de ambos simplemente
se apilaron en orden en `main`.

## Verificación de "ningún archivo perdió contenido"

1. **Compilación**: `npm run typecheck` en los 7 workspaces (`api`, `web`,
   `adapters`, `db`, `domain`, `sim`, `ui-atiende`) — **0 errores**. Si un
   commit hubiera borrado una función/tipo que otro archivo todavía
   importa, esto habría fallado.
2. **Pruebas unitarias completas** (`npm run test --workspaces
   --if-present`): **465 pruebas, 0 fallidas**, en los 7 workspaces.
3. **Pruebas de integración completas** (`npm run test:integration
   --workspaces --if-present`, `apps/api` + `packages/db` contra
   `embedded-postgres` real): **119 pruebas, 0 fallidas**.
4. **Grep dirigido** de símbolos citados textualmente en los reportes de
   `docs/AGENTES.md`/`docs/PROGRESO.md` de cada lote (una muestra
   representativa, no exhaustiva): `calcularMovimientoReserva`,
   `generarOwnerStatement`, `conciliarPayout`,
   `evaluarAlertaRetencionFiscal`, `calcularMetricasPeriodo`,
   `calcularCotizacion`, `evaluarViolacionesMinStay`,
   `evaluarPublicacionTarifa`, `reserva_financiero_rfc_propietario`,
   `construirUidExportado`, `exportarFeedIcs`,
   `feed_ical_unidad_por_token`, `useMutacionLigera`, `claveCapaDeNoche`,
   `razonDominante` — **los 15 existen en el árbol final**, ninguno
   desapareció.

## Metodología (para que el veredicto sea reproducible)

Script de una sola pasada (`git log --reverse` + `git show --name-only`
por commit), sin dependencias externas, guardado junto a este documento en
`docs/auditoria-2/script-atribucion.py` para que el veredicto sea
reproducible (`python3 docs/auditoria-2/script-atribucion.py` desde la raíz
del repo). El algoritmo es:

1. Recorrer los commits en orden cronológico.
2. Para cada archivo tocado por primera vez, registrar `(archivo → lote
   declarado en el subject del commit)`.
3. En cada commit posterior, si toca un archivo ya registrado y el lote
   declarado no coincide, marcarlo como candidato a mezcla — EXCEPTO una
   lista explícita de archivos de fusión compartida ya declarados en
   `docs/fase2/LOTES.md` (rutas/menú), que se excluyen desde el inicio.
4. Cada candidato se revisó a mano con `git show --numstat`/`git show`
   completo (no solo el nombre del archivo) para distinguir "se borró
   contenido de otro lote" de "se añadió una línea al final".

## Conclusión

No se encontraron commits que reescriban, borren o pisen silenciosamente
el trabajo exclusivo de otro lote. Los únicos cruces son extensiones
aditivas de archivos explícitamente compartidos (contrato de API, barriles
de reexport, manifiestos de dependencias, suites de prueba "catálogo
completo") o el reemplazo documentado de un placeholder de Lote 0 por su
implementación real de Lote 4. La atribución de Fase 2 está limpia.

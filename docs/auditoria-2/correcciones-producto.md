# Auditoría 2 — Correcciones de producto/UX y calidad de código

Corrector Sonnet de PRODUCTO/UX/CALIDAD (sesión 2026-09-06), en paralelo
a un corrector de SEGURIDAD (`packages/adapters/src/net`,
`apps/api/src/config`, `packages/sim`, `apps/api/src/routes/mensajeria`,
rate limit/auth, migración ≥0093) y un auditor de dominio
(`docs/auditoria-2/`, `tests/auditoria-2/`). Fuentes de hallazgos:
`docs/auditoria-2/producto-ux-operacion.md` (P-nn),
`docs/auditoria-2/calidad-codigo.md` (Q-nn), y — por reasignación del
corrector de dominio a mitad de sesión — `docs/auditoria-2/
dominio-sync-datos.md` (D-DSD-07, D-DSD-13, D-DSD-15).

Primer paso: se hizo el commit `docs(auditoria-2): informe de producto/UX
y calidad de código` (commit inicial, no listado abajo) con exactamente
`producto-ux-operacion.md`, `calidad-codigo.md` y `capturas/` que el
auditor había dejado en staging sin commitear.

## Tabla de hallazgos

| ID | Resumen | Commit | Prueba | Estado |
|---|---|---|---|---|
| P-02 | Página de Alertas en apps/web (lista, filtros, ack/resolver) + auth en `/alertas*` (antes sin middleware) | `a8674ed` | `AlertasPage.test.tsx` (5), 2 nuevos en `apps/api/test/integration/api.test.ts` | Corregido |
| P-01 | Página de Automatización agéntica (flag admin-only, catálogo de tools, cuota, trazas) + `apps/api/src/routes/agentes/flags.ts` nuevo | `3c4b559` | `AgentesPage.test.tsx` (7), 4 nuevos en `apps/api/test/integration/agentes.test.ts` | Corregido |
| Q-01 | Formateador de dinero único en `packages/domain/finanzas` (antes 4 copias, 2 criterios de redondeo) | `4ebf411` | Caso límite x.xx5 en `redondeo.test.ts` (domain), `redondeoCompartido.test.ts` (api, nuevo), `dineroConsolidado.test.ts` (web, nuevo) | Corregido |
| P-04 / Q-11 | `exigirRol` en `GET /finanzas/statements` (antes solo RLS) | `3a3edbf` | Prueba HTTP por rol en `finanzasPricingReportes.test.ts` (operador→403, resto→200) | Corregido |
| Q-02 | Helper compartido de fixtures (`apps/api/test/soporte/fixtures.ts`) reutilizado por los 7 archivos de integración | `4a08e19` | Mismo número de pruebas antes/después (74 en los 7 archivos), todas verdes | Corregido |
| Q-08 | `any` de `finanzas.ts` (2 sitios) tipados con `FilaOwnerStatement`/`FilaOwnerStatementLinea` | `4ebf411` (bundle con Q-01, mismas funciones tocadas) | Cubierto por la suite de integración de finanzas existente | Corregido |
| Q-08 (resto) | Último `any` del repo, `reportes.ts:156` (`respuestaCsv`), tipado con `Context` de Hono | `624e5fe`, follow-up de lint en `022eef0` | Typecheck + suite de reportes existente | Corregido — 0 `any` en el repo |
| Q-09 | Documenta la excepción arquitectónica de `packages/domain/test/soporte/fixtureEsquema.ts` (domain/test sí puede depender de `@atiende-rv/db`; domain/src nunca) | `5bd7807` | Solo documentación, sin cambio de comportamiento | Corregido |
| Q-10 | `scripts/verificar-lotes.mjs` falla explícito si Vitest arrancó pero no se pudo parsear su resumen (antes reportaba "0 tests" en silencio) | `8098186` | 3 pruebas nuevas en `verificar-lotes.test.mjs` | Corregido |
| Q-05 | Quita el último placeholder `SeccionVacia` muerto (`/reservas` → redirige a `/calendario`) | `f6c3f79` | `VistaTimeline.test.tsx` no afectado; corrige regresión en `AdminSidebar.test.tsx` (ver nota abajo) | Corregido |
| Q-03 | Extrae el mock de `localStorage`/`matchMedia` (antes copiado byte a byte entre `ui-atiende` y `web`) a `@atiende-rv/ui-atiende/test-mocks-jsdom` | `94a5337` | 12 pruebas de ui-atiende + 80 de web sin cambios | Corregido |
| P-05 | Zona horaria de la propiedad visible sin interacción (antes solo tras seleccionar una noche) en la vista Línea de tiempo | `94446f7` | `VistaTimeline.test.tsx` (nuevo) | Corregido (alcance: vista por defecto Timeline; VistaMes/VistaLista quedan fuera) |
| D-DSD-13 | Wiring de `tipoConexion` en `GET /canales` y `GET /backoffice/cuentas-canal` para que el fix de dominio (`evaluarEstadoConexion`) reporte `"ical"` de verdad | `dbad4ec` | Prueba HTTP nueva en `backoffice.test.ts` (crea cuenta iCal real, simula sync, confirma `estadoConexion:"ical"`) | Corregido |
| D-DSD-07 | `PATCH /backoffice/propiedades/:id` ahora rechaza (409) el cambio de `zona_horaria` con `ocupacion_unidad` activas | `c091a7e` | Repro del auditor (`zonaHorariaPropiedadCambioSinRecalculo.test.ts`) verde tras el fix + prueba nueva en `backoffice.test.ts` (permite sin ocupaciones, rechaza con una activa, permite editar otros campos) | Corregido |
| D-DSD-15 | `pg_advisory_xact_lock` en `POST /statements/generar` evita el 500 sin manejar en la carrera de dos generaciones concurrentes del mismo owner+periodo | `8424000` | Prueba HTTP nueva en `finanzasPricingReportes.test.ts` (2 POST concurrentes reales, ninguno falla, 1 sola fila) — ver nota sobre la repro del auditor de dominio | Corregido |

## Notas importantes

**Regresión propia detectada y corregida en la misma sesión**: al aplicar
P-01 (dar `ruta` real al ítem "Automatización agéntica"), la prueba
preexistente `apps/web/src/components/admin/AdminSidebar.test.tsx`
empezó a fallar — esa prueba fijaba como "correcto" el defecto de P-01
(afirmaba que el placeholder "Pronto" debía seguir ahí). Se detectó al
correr `npm run test` completo tras P-01/Q-05 y se corrigió en el mismo
commit que Q-05 (`f6c3f79`), reescribiendo la prueba para verificar el
comportamiento correcto en vez de retirarla.

**D-DSD-15, alcance de la prueba de reproducción**: la prueba del
auditor de dominio (`tests/auditoria-2/dominio/
statementConcurrenciaMismoOwnerPeriodo.test.ts`) replica la secuencia
SQL de la carrera directamente contra la base de datos con dos
`pg.Client` propios, **sin pasar por la ruta HTTP** — por diseño no
puede reflejar un fix aplicado en `apps/api/src/routes/finanzas.ts`, y
`tests/auditoria-2/` es territorio exclusivo del auditor de dominio (no
se modificó). Se verificó el fix real con una prueba complementaria que
sí dispara dos peticiones HTTP concurrentes contra la ruta ya corregida.

**Cambio de alcance en `evaluarEstadoConexion`**: el fix de dominio para
D-DSD-13 (`packages/domain/src/channelAdapter.ts`) fue hecho por el
auditor/corrector de dominio antes de que se me reasignara el hallazgo;
mi trabajo fue exclusivamente el wiring en `apps/api/src/routes/
canales.ts` y `apps/api/src/routes/backoffice/cuentasCanal.ts` (ninguno
de los dos pasaba `tipoConexion` al dominio). La prueba pura del
auditor de dominio (`estadoConexionIcalNuncaSeReporta.test.ts`) llama a
`evaluarEstadoConexion` directamente sin `tipoConexion` en la evidencia
— por diseño de la función (opcional, con default "api" para no romper
comportamiento existente) esa prueba puntual no puede pasar sin que el
auditor de dominio la actualice; no es un archivo de mi ámbito.

## Hallazgos NO resueltos en esta sesión (y por qué)

- **Q-04** (política de roles como literales repetidos, 30 sitios en
  `apps/api/src/routes/*.ts`): riesgo/alcance desproporcionado para el
  tiempo restante — tocar 30 sitios en múltiples archivos de rutas
  aumenta la probabilidad de choque con el corrector de seguridad
  (varios de esos archivos están activamente en edición concurrente).
  Se deja como candidato para una sesión dedicada.
- **Q-06** (agregar `@vitest/coverage-v8` + umbral de cobertura en los 7
  workspaces): un umbral de cobertura real haría fallar `npm run test`
  en `apps/web` (ratio de cobertura más bajo del repo, 0.14 según el
  proxy del propio informe) — el encargo exige que `npm run test`
  termine la sesión en verde, así que añadir cobertura CON umbral es
  incompatible con ese requisito no negociable en el tiempo disponible;
  añadir la dependencia SIN umbral (solo medir) tampoco se hizo por
  presupuesto de tiempo. Candidato para una sesión dedicada con acuerdo
  explícito sobre el umbral inicial.
- **P-08** (pantallas de "sin acceso" apiladas en vez de una sola al
  navegar por URL directa a una ruta sin permiso): el fix correcto vive
  en un componente compartido (`RutaProtegida`/`AdminLayout`) usado por
  *todas* las páginas — cambiarlo con seguridad exige revisar el efecto
  en cada página protegida, fuera del presupuesto de esta sesión.
  Funcionalmente no es un riesgo (nunca expone datos), solo ruido de UX.
- **P-06/P-07/P-09/P-10**: informativos, limitaciones declaradas por el
  propio auditor, o ya corregidos antes de esta sesión (P-09 cita un fix
  anterior por trazabilidad) — no requieren acción de este corrector.
- **Q-06b**: resuelto como efecto directo de P-01 (la página ya existe),
  sin commit propio.
- **Q-07**: resuelto como parte del commit de Q-01 (`construirUrl`
  exportada y reutilizada en `descargarCsv`), sin commit propio separado.

## Verificación final

- `npm run typecheck` — verde, 7/7 workspaces (`docs/logs/
  correccion-prod-typecheck.log`).
- `npm run lint` — 0 errores/warnings en cualquier archivo tocado por
  este corrector; 3 errores preexistentes en 2 archivos exclusivos del
  corrector de seguridad, en curso concurrente al cierre de esta sesión,
  no introducidos por ningún commit de este corrector (`docs/logs/
  correccion-prod-lint.log`).
- `npm run test` — verde, 91 archivos / 565 pruebas en los 7 workspaces
  (`docs/logs/correccion-prod-test.log`).
- `npm run test:integration` — verde, 15 archivos / 135 pruebas
  (`docs/logs/correccion-prod-test-integration.log`).

# Auditoría 2 — Calidad de código

Auditor adversarial independiente (Sonnet), sesión 2026-09-06. Alcance:
solo lectura sobre `main` (árbol limpio al empezar). Método: análisis
estático dirigido (grep de imports cruzados, `any`/`as any`/`@ts-ignore`,
TODO/FIXME, tamaño de archivo), ejecución real de `vitest run` en los 7
workspaces, intento real de `vitest run --coverage` para confirmar su
ausencia, `git log`/`git show` puntual para verificar autoría de los casos
de duplicación más graves, y observación en vivo (Playwright/Chrome real
contra la app levantada con embedded-postgres) de cómo se comportan los
errores tipados en pantalla — reportado en detalle en
`docs/auditoria-2/producto-ux-operacion.md`, aquí solo se referencia como
evidencia cruzada del punto 7.

No se modificó ningún archivo de producto. No se instalaron dependencias
nuevas en el repo (el intento de correr `--coverage` falló por falta de
`@vitest/coverage-v8`, no se instaló para no escribir en el repo).

---

## 0. Evaluación de `docs/auditoria-2/atribucion-commits.md` (Lote 11B, corrección #7)

Esa auditoría responde una pregunta distinta a la de este documento —
"¿qué commit tocó qué archivo y se pisó algo?" — y dentro de su propio eje
es creíble: se repitió su verificación central (las suites `vitest run` de
los 7 workspaces pasan en verde — 227+37+63+17+12+46+65 = 467 pruebas
unitarias verdes, cifra consistente con la suya; y se confirmó que
`DevShellNav` no existe en el árbol, coincidiendo con su hallazgo).

Pero es **estructuralmente ciega** a dos clases de problema que sí son
objeto de esta auditoría:

1. **Duplicación de lógica de negocio dentro de un solo commit de un solo
   lote** (nunca detectable comparando "quién tocó qué archivo entre
   lotes"). Ver Q-01 abajo: 4 copias de la misma función de formateo de
   dinero, ninguna cruza la frontera de lotes que esa auditoría vigila.
2. **Scaffolding no limpiado que vive en un archivo compartido legítimo**
   (un "punto de fusión declarado" como `App.tsx`, tocado por todos los
   lotes de forma esperada). Ver Q-05: la ruta `/reservas` sigue montando
   el placeholder de Lote 0 pese a que la feature real existe completa —
   ningún análisis de "qué commit borró qué archivo" lo detecta porque
   nadie borró `App.tsx`, solo nadie terminó de editarlo.

**Veredicto: confiable dentro de su alcance (integridad de historial git,
0 archivos perdidos), pero no equivale a "sin duplicación" ni a "sin deuda
de UI" — son ejes complementarios, no uno subconjunto del otro.**

---

## 1. Duplicación entre lotes/paquetes

**Q-01 [ALTO]** — Formateo de dinero (centavos → string decimal)
reimplementado 4 veces, con **dos criterios de redondeo distintos**
coexistiendo, en el camino exacto que genera el Owner Statement real que
ve el propietario:

| Copia | Archivo:línea | Redondeo |
|---|---|---|
| Canónica (documentada como "criterio único") | `packages/domain/src/finanzas/redondeo.ts:38-45` (`decimalDesdeCentavos`) | `Math.trunc` |
| Duplicado casi homónimo | `apps/api/src/routes/finanzas.ts:709-712` (`decimalDeCentavos`) — usado en `renderizarStatementHtml` (líneas 716-737) para el HTML real del statement | `Math.round` |
| Duplicado 3 | `apps/web/src/pages/finanzas/api.ts:143-146` | `Math.round` |
| Duplicado 4 (idéntico byte a byte al anterior) | `apps/web/src/pages/reportes/api.ts:54-57` | `Math.round` |

Impacto: un ajuste futuro a la regla de redondeo (p. ej. por un requisito
fiscal) exige tocar 4 sitios, dos de los cuales ya divergen del criterio
que `domain` declara canónico. Riesgo real de que el propietario vea un
neto distinto al que domain calculó.
Corrección: exportar una única función desde `packages/domain` (o un
paquete `@atiende-rv/dinero` sin dependencias de servidor) e importarla en
las 3 copias restantes.

**Q-02 [ALTO]** — Fixtures de integración de tenant/propiedad/unidad
reimplementadas con SQL crudo, sin helper compartido, en **7 archivos**
de `apps/api/test/integration/` (~29 bloques `INSERT INTO
tenant/propiedad/unidad` casi idénticos: `api.test.ts:96-111`,
`backoffice.test.ts:117-123`, `mensajeria.test.ts:104-118`,
`finanzasPricingReportes.test.ts:97-111`, más `agentes.test.ts`,
`exportIcal.test.ts`, `limpieza.test.ts`), a diferencia de
`packages/domain/test/soporte/fixtureEsquema.ts` y
`packages/db/test/integration/{concurrencia,capaAplicacion}.test.ts`, que
sí extrajeron `crearUnidad()`/`crearFixtureEsquema()`. Inconsistencia de
patrón entre paquetes del mismo monorepo: unos construyeron el helper,
`apps/api` no.
Corrección: extraer `apps/api/test/soporte/fixtures.ts`.

**Q-03 [MEDIO]** — Mock de `localStorage`/`matchMedia` para jsdom
duplicado byte-a-byte entre `packages/ui-atiende/src/test/setup.ts:8-32`
(`MemoriaLocalStorage`) y `apps/web/src/test/setup.ts:6-33`
(`MemoriaStorage`), con un comentario en el segundo archivo que **admite
explícitamente** ser una copia intencional del primero en vez de
extraerlo a un módulo compartido.

**Q-07 [BAJO]** — `construirUrl` (armado de URL + querystring) vive sin
exportar en `apps/web/src/lib/api/cliente.ts:52-59`;
`apps/web/src/pages/reportes/api.ts:43-50` (`descargarCsv`) no puede
reusarla y reimplementa la misma lógica a mano.

No se encontró duplicación en: hashing de contraseñas (única
implementación, `apps/api/src/seguridad/contrasenas.ts`), solapamiento de
reservas (única fuente de verdad: `EXCLUDE USING gist` en
`packages/db/src/migrations/0005_ocupacion_unidad.ts`), ni en `crearApp()`
para tests de integración (centralizado en `apps/api/src/app.ts`,
importado siempre, nunca redefinido — confirmado también en vivo: el
script de auditoría de UI de esta sesión reutilizó el mismo `crearApp`
sin tener que reimplementarlo).

---

## 2. Acoplamientos indebidos

Sin violaciones de la dirección de dependencia declarada:

- `packages/domain/src` no importa `@atiende-rv/db` ni
  `@atiende-rv/adapters` en código de producción.
- `apps/web/src` no importa `@atiende-rv/db`; sí importa
  `@atiende-rv/api/contrato` (subpath dedicado, exportado aparte del
  servidor Hono en `apps/api/package.json`), siempre con `import type`.
- Grafo `@atiende-rv/*` sin ciclos: `domain` (hoja) ← `db`, `adapters` ←
  `sim` ← `api`; `web` ← `ui-atiende`.

**Q-09 [BAJO]** — `packages/domain/test/soporte/fixtureEsquema.ts:1`
importa `@atiende-rv/db` para levantar un esquema real en tests de la
capa de aplicación de domain — deliberado y documentado, pero es una
excepción no declarada como tal a la regla arquitectónica de "domain
nunca depende de db" (solo vale para tests).

**Q-11 [MEDIO, hallazgo cruzado con producto]** — `apps/api/src/routes/finanzas.ts`
tiene al menos un endpoint (`GET /statements`, línea 414) sin ninguna
llamada a `exigirRol`, a diferencia de sus endpoints hermanos de
escritura (líneas 72, 107, 285, 488, todos con `exigirRol(auth,
"superadmin", "admin_gestora")`). El aislamiento por rol para ese GET
depende **enteramente** de la política RLS de Postgres
(`owner_statement_select`, `packages/db/src/migrations/0054_finanzas_pricing_rls.ts:152-159`)
en vez de una segunda capa en la ruta HTTP. Verificado en vivo en esta
sesión (ver `producto-ux-operacion.md`, hallazgo P-04): navegando como
`limpieza` y como `propietario` a `/finanzas`, la RLS efectivamente
devuelve 0 filas — el aislamiento SÍ funciona — pero es un solo punto de
falla (si algún día se corre esa consulta con una conexión que no aplique
`SET ROLE`/RLS correctamente, no hay `exigirRol` de respaldo). Recomendado
añadir `exigirRol` explícito como defensa en profundidad, coherente con el
resto de `finanzas.ts`.

---

## 3. Tipos `any` / supresiones de TypeScript

Higiene alta: **3** usos de `any` explícito en todo el repo (`.ts`/`.tsx`
fuera de `node_modules`/`dist`), **0** `as any`, **0** `@ts-ignore`, **0**
`@ts-expect-error`:

- `apps/api/src/routes/reportes.ts:156` — `respuestaCsv(c: any, ...)`
  (el `Context` de Hono, bajo riesgo, fácilmente tipable).
- `apps/api/src/routes/finanzas.ts:672` y `:716` — `serializarStatementFila`
  y `renderizarStatementHtml` reciben `statement: any, lineas: any[]`.

**Q-08 [MEDIO]** — Los 2 últimos son exactamente los objetos con
`monto_centavos`/`neto_centavos` usados para el HTML del Owner Statement
— el único código de negocio/dinero, de los 3, con `any`. Corrección:
tipar con las interfaces de fila que ya produce `generarOwnerStatement`
en domain.

---

## 4. TODO/FIXME/HACK/XXX

**0 reales.** Todos los matches de `TODO|FIXME|HACK|XXX` en `src/` son
falsos positivos de la palabra española "TODOS" (p. ej.
`apps/web/src/pages/mensajeria/components/BadgeCanalSimulado.test.tsx:7`,
`packages/domain/src/limpieza/checklist.ts:14`). No hay deuda técnica
etiquetada y olvidada en código de producción.

---

## 5. Código muerto

- `DevShellNav` no existe en el árbol (coincide con la auditoría de
  atribución de commits).
- **Q-05 [MEDIO]** — `apps/web/src/App.tsx:49-52`: la ruta `/reservas`
  sigue montando el placeholder `SeccionVacia` con etiqueta
  `lote="Lote 3"`, pese a que la funcionalidad de reservas está completa
  y probada (`packages/domain/src/aplicacion/reservas.ts`, 426 líneas;
  `apps/api/src/routes/reservas.ts`;
  `apps/web/src/pages/calendario/components/ModalCrearReserva.tsx`,
  enlazado desde `PanelSeleccion.tsx:110`). Un usuario que hace clic en
  "Reservas" (si ese ítem de menú existiera activo) vería "sección sin
  contenido" cuando la feature real vive dentro de Calendario. Corrección:
  quitar/redirigir la ruta fantasma o poblarla con un resumen real.
- Búsqueda de exports nunca importados en `packages/domain/src`,
  `packages/adapters/src`, `packages/sim/src` (excluyendo `index.ts` y
  tests): **0 candidatos**. No se repitió el análisis completo en
  `apps/api/src`/`apps/web/src` por volumen — limitación declarada, no
  verificada exhaustivamente ahí.
- **Q-06b [BAJO, hallazgo cruzado con producto]** — El ítem de menú
  "Automatización agéntica" en
  `apps/web/src/components/admin/AdminSidebar.tsx:96` no tiene `ruta`
  (queda permanentemente deshabilitado/"Pronto"), pese a que existe un
  backend real y probado en `apps/api/src/routes/agentes/index.ts` y
  `packages/domain` (Lote 9). No es código muerto en el sentido estricto
  (el backend se usa desde tests de integración), pero es un frontend sin
  construir para una feature de backend completa — ver hallazgo P-01 en
  `producto-ux-operacion.md` para el impacto de producto.

---

## 6. Cobertura de pruebas

**Q-06 [MEDIO]**: ningún workspace tiene proveedor de cobertura
instalado. Verificado ejecutando `npx vitest run --coverage` real en
`packages/domain`:

```
MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'
```

y `grep -rn "coverage" **/vitest*.config.ts` = 0 resultados en los 7
workspaces. No se instaló la dependencia (auditoría de solo lectura). Se
verificó que las suites **pasan** ejecutando `vitest run` real en cada
paquete:

| Paquete | Test files | Tests | Resultado |
|---|---|---|---|
| packages/domain | 32 | 227 | ✓ todos pasan |
| packages/db (unitario) | 5 | 37 | ✓ todos pasan |
| packages/adapters | 7 | 63 | ✓ todos pasan |
| packages/sim | 4 | 17 | ✓ todos pasan |
| packages/ui-atiende | 7 | 12 | ✓ todos pasan |
| apps/api (unitario) | 7 | 46 | ✓ todos pasan |
| apps/web | 18 | 65 | ✓ todos pasan |

No se corrieron las suites de integración (embedded-postgres, ~119
pruebas según auditorías previas) ni la suite E2E de Playwright en esta
sección — presupuesto de tiempo; sí se corrió la app E2E real
manualmente para la auditoría de producto (ver ese documento), lo que
corrobora indirectamente que el flujo de integración funciona de punta a
punta, pero no sustituye a la suite automatizada.

Proxy de cobertura (ratio líneas de test / líneas de src — no equivale a
cobertura real de líneas/branches, declarado como aproximación):

| Paquete | líneas src | líneas test | ratio |
|---|---|---|---|
| packages/domain | 5505 | 2845 | 0.52 |
| packages/db (incl. 52 migraciones) | 4344 | 2181 | 0.50 |
| packages/adapters | 1863 | 574 | 0.31 |
| packages/sim | 437 | 179 | 0.41 |
| packages/ui-atiende | 619 | 181 | 0.29 |
| apps/api | 8641 | 3271 | 0.38* |
| apps/web | 7711 | 1105 | 0.14 |

`apps/web` con 0.14 es el más bajo — coherente con que gran parte de su
UI (formularios de backoffice/pricing/mensajería) no tiene test de
componente dedicado y solo se ejerce vía Playwright e2e
(`apps/web/e2e/*.spec.ts`), no ejecutada en esta sección de la auditoría.
`apps/api` está subestimado por el proxy: buena parte de su lógica vive
en `domain` (probada allí) y sus rutas se ejercen vía integración HTTP
(no contabilizada aquí).

Corrección: agregar `@vitest/coverage-v8` + umbral mínimo en CI para
poder medir esto con cifras reales en vez de un proxy.

---

## 7. Consistencia de errores tipados

Señal positiva, sin hallazgo de severidad alta:
`apps/api/src/contrato/errores.ts` define `ErrorDominio`/`CODIGOS_ERROR`/
`cuerpoError`, y `apps/api/src/app.ts` tiene un `onError` central que
mapea `ErrorDominio` a una respuesta JSON tipada. `grep -rn "throw new
Error(" apps/api/src/routes` → **0 resultados**: ninguna ruta lanza un
`Error` genérico saltándose el contrato.

**Corroborado en vivo** (sesión de producto de esta misma auditoría,
Playwright/Chrome contra la app real): al navegar como rol `operador` a
`/administracion` y como rol `propietario` a `/cuentas-canal` — rutas sin
permiso — la UI muestra cajas de error legibles en español
("`403 — no autorizado · rol_forbidden` — Rol "operador" no autorizado
para esta acción"), nunca un 500 en pantalla ni un stack trace. Ver
capturas `v2-31-operador-intenta-administracion.png` y
`v2-52-propietario-intenta-cuentas-canal.png`.

**Q-04 [MEDIO]**: la política de autorización no está centralizada en una
tabla — está repetida como literales en cada endpoint:
`exigirRol(auth, "superadmin", "admin_gestora")` aparece **30 veces** en
`apps/api/src/routes/*.ts` (ejemplos: `auditoria.ts:19`,
`exportIcal.ts:95,116`, `finanzas.ts:72,107,285,488`,
`pricing.ts:53,71,90,110,129`). La función `exigirRol` sí está
centralizada (`apps/api/src/middleware/roles.ts:15-18`), pero los
*argumentos* (qué roles pueden qué) están dispersos. Corrección:
constantes nombradas (`ROLES_ADMIN`) o una tabla permiso→roles.

**P-04 [BAJO, ver también producto-ux-operacion.md]**: cuando una página
entera no tiene permiso (no un solo campo), el patrón actual monta el
shell completo de la página y apila 2-3 cajas de error en vez de una
sola pantalla de "sin acceso" o una redirección — funcionalmente seguro
(nunca expone datos) pero relativamente ruidoso para el usuario.

---

## 8. Tamaño de archivos (15 más grandes, excluyendo node_modules/dist/migrations)

| Líneas | Archivo |
|---|---|
| 940 | apps/api/src/contrato/tipos.ts |
| 743 | apps/api/src/routes/finanzas.ts |
| 547 | packages/domain/src/limpieza/aplicacion/tareas.ts |
| 494 | apps/web/src/pages/finanzas/FinanzasPage.tsx |
| 471 | apps/api/test/integration/limpieza.test.ts |
| 466 | packages/adapters/src/sync/motor.ts |
| 458 | apps/api/test/integration/mensajeria.test.ts |
| 426 | packages/domain/src/aplicacion/reservas.ts |
| 417 | apps/api/test/integration/api.test.ts |
| 408 | apps/web/src/pages/backoffice/SuperadminPage.tsx |
| 398 | packages/db/test/integration/rls.test.ts |
| 395 | apps/web/src/pages/pricing/PricingPage.tsx |
| 378 | packages/domain/test/aplicacion/reservas.test.ts |
| 370 | apps/api/test/integration/finanzasPricingReportes.test.ts |
| 369 | packages/domain/test/limpieza/aplicacion/tareas.test.ts |

`apps/api/src/contrato/tipos.ts` (940) es un barril de tipos/esquemas Zod
aditivo por diseño — tamaño esperado, no es candidato real a partir.
`apps/api/src/routes/finanzas.ts` (743) sí concentra demasiada
responsabilidad: rutas HTTP **y** serialización **y** generación de HTML
de reporte (`renderizarStatementHtml`, `escaparHtml`, líneas 608-744) —
candidato real a partir en `finanzas/rutas.ts` +
`finanzas/presentacionStatement.ts`. `packages/domain/src/limpieza/
aplicacion/tareas.ts` (547, 9 casos de uso) es más defendible pero
candidato secundario a dividir por sub-flujo (ciclo de vida de tarea vs.
incidencias vs. bloqueo de mantenimiento).

---

## 9. Riesgos de mantenimiento generales

- Sin dependencias circulares entre workspaces `@atiende-rv/*` (grafo
  verificado en el punto 2, DAG limpio).
- **Q-10 [BAJO]**: `scripts/verificar-lotes.mjs:84-96` cuenta pruebas
  parseando con regex la salida de texto de Vitest
  (`/^\s*Tests\s+.*\((\d+)\)\s*$/`). Si Vitest cambia el formato de su
  resumen, el script reportaría silenciosamente "0 tests" para un
  workspace que sí corrió pruebas, en vez de fallar explícito.
  `scripts/adversarial.mjs` sí valida la existencia del directorio
  objetivo antes de correr (`existsSync`) — más robusto.

---

## Tabla resumen

| Hallazgo | Severidad | Archivo:línea | Impacto | Corrección propuesta |
|---|---|---|---|---|
| Q-01 | Alto | domain/finanzas/redondeo.ts:38; api/routes/finanzas.ts:709; web/finanzas/api.ts:143; web/reportes/api.ts:54 | Formateo de dinero duplicado 4x (2 criterios de redondeo distintos) en el flujo de Owner Statement | Centralizar en una función/paquete único reexportado |
| Q-02 | Alto | apps/api/test/integration/*.test.ts (7 archivos, ~29 bloques) | Fixtures SQL de tenant/propiedad/unidad duplicadas sin helper | Extraer helper compartido de fixtures |
| Q-03 | Medio | ui-atiende/src/test/setup.ts:8; web/src/test/setup.ts:6 | Mock jsdom localStorage/matchMedia copiado y admitido como copia | Extraer a shim de test compartido |
| Q-04 | Medio | apps/api/src/routes/*.ts (30 sitios) | Política de roles como literales repetidos, no tabla central | Constantes/tabla de permisos nombrada |
| Q-05 | Medio | apps/web/src/App.tsx:49-52 | Ruta `/reservas` monta scaffold de Lote 0 pese a feature completa | Quitar/redirigir la ruta o construir la vista |
| Q-06 | Medio | ningún vitest.config.* de los 7 workspaces | Sin proveedor de cobertura; imposible medir cobertura real | Agregar @vitest/coverage-v8 + umbral en CI |
| Q-06b | Bajo | web/components/admin/AdminSidebar.tsx:96 | Ítem "Automatización agéntica" sin ruta pese a backend completo | Construir la página o quitar el ítem del menú |
| Q-07 | Bajo | web/lib/api/cliente.ts:52; web/reportes/api.ts:43 | `construirUrl` no exportada, reimplementada en descargarCsv | Exportar y reusar |
| Q-08 | Medio | apps/api/src/routes/finanzas.ts:672,716 | `any` en objetos con montos de dinero para HTML de statement | Tipar con interfaces existentes |
| Q-09 | Bajo | packages/domain/test/soporte/fixtureEsquema.ts:1 | Domain test depende de db (excepción arquitectónica no declarada) | Documentar como excepción explícita |
| Q-10 | Bajo | scripts/verificar-lotes.mjs:84-96 | Parseo por regex de salida de Vitest, sin alarma si el formato cambia | Fallar explícito si no se pudo parsear |
| Q-11 | Medio | apps/api/src/routes/finanzas.ts:414 | `GET /statements` sin `exigirRol`, aislamiento solo por RLS (funciona, pero sin defensa en profundidad) | Añadir `exigirRol` explícito |

**Conteo por severidad**: Crítico: 0 · Alto: 2 (Q-01, Q-02) · Medio: 6
(Q-03, Q-04, Q-05, Q-06, Q-08, Q-11) · Bajo: 4 (Q-06b, Q-07, Q-09, Q-10).

## Calificación de calidad de código: 7.5/10

Higiene de TypeScript sobresaliente (3 `any` en todo el repo, 0
supresiones, 0 TODOs reales, contrato de errores consistente y
corroborado en vivo, grafo de dependencias sin ciclos) y una arquitectura
de capas mayormente respetada (domain nunca depende de infraestructura).
Se penaliza por duplicación real de lógica monetaria con criterios de
redondeo divergentes exactamente en el código que genera documentos
financieros al propietario (Q-01), por la ausencia total de tooling de
cobertura en los 7 workspaces (Q-06), por deuda de limpieza visible en
producción (Q-05, Q-06b), y por un punto de aislamiento por rol que
depende de una sola capa (Q-11) en un módulo (`finanzas.ts`) que en todos
sus demás endpoints sí tiene doble defensa.

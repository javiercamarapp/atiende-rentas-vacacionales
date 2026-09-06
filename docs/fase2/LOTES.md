# Lotes de implementación — Fase 2 (Atiende Rentas Vacacionales)

Orden de lotes con carpetas exclusivas por lote (sin conflicto de archivos
entre lotes que corren en paralelo), dependencias explícitas, entregable
verificable, comando de prueba y criterio de aceptación. Referencias:
`docs/fase2/PLAN-CONSTRUCCION.md` (arquitectura), `docs/fase2/BACKLOG.md`
(historias H-nnn por lote).

**Punto de fusión compartido (única excepción a "carpetas exclusivas"):**
el router de `apps/web` (registro de rutas/menú del `AdminSidebar`) y el
registro de rutas de `apps/api` son archivos que varios lotes tocan para
añadir su propia entrada. Cada lote añade **una línea/bloque nuevo**, nunca
reescribe el archivo completo, y ese cambio va en un commit separado y
pequeño — no bloquea el resto del trabajo del lote, que vive en archivos
exclusivos.

---

## Mapa de dependencias

```
Lote 0 (scaffold)
   └── Lote 1 (dominio + BD + invariantes)
          ├── Lote 2 (iCal + simuladores + anti-eco/cuarentena)
          ├── Lote 3 (API + auth/RLS/auditoría)
          │
          │   (una vez Lote 3 tiene contrato de API estable —
          │    puede empezar antes contra mocks, ver Lote 4)
          │
          ├── Lote 4  (frontend calendario maestro + matriz + monitor)
          ├── Lote 5  (operación: limpieza/mantenimiento)
          ├── Lote 6  (mensajes con aprobación humana)
          ├── Lote 7  (finanzas/owners/statements + pricing + reporting)
          ├── Lote 8  (back office / superadmin)
          ├── Lote 9  (automatización agéntica)
          └── Lote 10 (observabilidad/recuperación: backups, DR, flags)
                 └── Lote 11 (pruebas adversariales completas + carga)
```

**Paralelizables desde el inicio (t=0):** ninguno — Lote 0 es la única
raíz y todo depende de él por ser el scaffold del monorepo y el tooling.

**Paralelizables tan pronto termina Lote 0:** solo Lote 1 (todo lo demás
depende del modelo de dominio y del esquema de BD).

**Paralelizables tan pronto termina Lote 1 (el bloque grande de
paralelización real del proyecto):** Lote 2 y Lote 3 corren en paralelo sin
conflicto de archivos (`packages/adapters`+`packages/sim` vs. `apps/api`+
`packages/db` — RLS y migraciones nuevas de auth no chocan con las
migraciones de esquema de canal que añade Lote 2).

**Paralelizables tan pronto termina Lote 3 (segundo bloque grande, el más
ancho):** Lote 4, Lote 5, Lote 6, Lote 7, Lote 8, Lote 9 y Lote 10 pueden
correr **los siete en paralelo**, cada uno en su propio subárbol de
`apps/web/pages/*`, `apps/api/routes/*` y `packages/domain/*` — ninguno
edita los archivos de otro. Lote 4 puede además **adelantarse contra un
contrato de API mockeado** (OpenAPI/tipos compartidos publicados al cerrar
Lote 3 en su primer commit, antes de que todos los endpoints estén
implementados), reduciendo la dependencia estricta a solo el contrato, no a
la implementación completa.

**Lote 11 es el único que no puede paralelizarse contra el resto:** el
catálogo adversarial completo (20 casos) y las pruebas de carga son
cross-cutting por diseño — ejercitan dominio + adaptadores + API + auth
simultáneamente. Arranca en cuanto Lote 1+2+3 estén mergeados (con
cobertura parcial de los casos que no dependen de 5-10) y se completa/re-
ejecuta a medida que aterrizan 4-10, permaneciendo activo en CI de forma
continua después.

---

## Lote 0 — Scaffold del monorepo + tooling + CI local + `ui-atiende`

**Carpetas exclusivas:** raíz del repo (`package.json`, `tsconfig.json`,
`.eslintrc`/`eslint.config.js`, `.github/workflows/` o script de CI local),
`apps/web/` (esqueleto Vite+React+TS vacío), `apps/api/` (esqueleto
Hono+TS vacío), `packages/ui-atiende/`.

**Dependencias:** ninguna.

**Qué se construye:**
- Workspaces npm (`apps/*`, `packages/*`), `tsconfig` base compartido,
  ESLint flat config y Prettier heredando el patrón de `atiende-restaurantes`
  (`strict: false` deliberado en `tsconfig.app.json`, igual que el hermano —
  documentado, no accidental).
- `packages/ui-atiende`: **solo activos visuales portados**, sin secretos ni
  lógica de negocio — `src/index.css` (tokens de color/tipografía/sombras/
  gradientes/animaciones), `AtiendeLogo.tsx` (`AtiendeMark`/`AtiendeWordmark`,
  SVG inline), `ThemeSelector.tsx`, los 43 primitivos `ui/*.tsx` de
  shadcn (**excepto** `ui/sidebar.tsx`, confirmado sin uso real en el
  hermano), `StatCard`/`TrendStatCard`, `ModalFormularioLateral.tsx`, hook
  `use-mobile.tsx`, helper `cn` (`lib/utils.ts`). `public/favicon.svg`
  copiado tal cual (mismo mark). Nada de `AdminSidebar.tsx` todavía (eso es
  Lote 4, porque necesita `menuSections` reales del dominio).
- CI local: pipeline de gates en orden (`npm ci` con lockfile exacto →
  auditoría de dependencias bloqueante solo para runtime → `lint` →
  `typecheck` → `test` unitario vacío de humo → `build`), inspirado en el
  patrón verificado de Likida (RV20 §8).

**Entregable verificable:** `npm run dev` levanta `apps/web` (pantalla en
blanco con el logo `AtiendeMark` centrado) y `apps/api` (endpoint `GET
/health` responde `200`) simultáneamente, sin Docker.

**Comando de prueba:** `npm run lint && npm run typecheck && npm run build`

**Criterio de aceptación:** build verde en las tres apps/paquetes; el logo y
los tokens de color renderizan idénticos a los de `atiende-restaurantes`
(comparación visual manual contra el inventario de
`atiende-hoteles-staging/docs/referencia/05-frontend-restaurantes.md`); cero
archivos con secretos/`.env`/credenciales copiados desde el repo de
referencia.

---

## Lote 1 — Dominio de calendario + BD + migraciones + pruebas de invariantes

**Carpetas exclusivas:** `packages/domain/`, `packages/db/`,
`tests/fixtures/` (solo fixtures de esquema/seed, no de canal — eso es
Lote 2).

**Dependencias:** Lote 0 (necesita el monorepo y el tooling de tests).

**Qué se construye (BACKLOG E01):**
- Esquema SQL versionado: `ocupacion_unidad` con `EXCLUDE USING gist` +
  `btree_gist`, `conflicto_calendario`, `propiedad`/`unidad`/`tenant`/
  `empresa_gestora`/`owner` (esqueleto mínimo, sin UI de gestión todavía —
  eso es Lote 8/E02), `huesped_minimo`.
- Runner de migraciones propio contra `embedded-postgres` y PGlite.
- Lógica pura en `packages/domain`: precedencia de capas, cálculo de
  noches/DST, motor `UID→SEQUENCE→DTSTAMP`+hash (sin parser ICS todavía —
  solo la función de resolución, consumida después por Lote 2), interfaz
  `ChannelAdapter`/`ChannelCapabilities` (contrato, sin implementación real
  — eso es Lote 2), estados de `ocupacion_unidad`.
- Flujo de creación/cancelación/modificación de reserva (H-017 a H-022) como
  funciones de dominio puras + capa de aplicación transaccional mínima
  (sin HTTP todavía — eso es Lote 3).

**Entregable verificable:** dos inserciones concurrentes de rangos
solapados sobre la misma `unidad_id` contra `embedded-postgres` — la
segunda es rechazada con `exclusion_violation` (`SQLSTATE 23P01`); dos
rangos adyacentes se insertan ambos sin error.

**Comando de prueba:** `npm run test` (PGlite, lógica/RLS) y `npm run
test:integration` (concurrencia real contra `embedded-postgres`).

**Criterio de aceptación:** ACEPTACION §Calendario-1 completo (los 4 puntos:
exclusion constraint, rango semiabierto forzado, fuente de verdad única,
outbox transaccional — outbox real llega en Lote 2/3, aquí se valida el
esqueleto de la tabla); §Calendario-2 casos 4, 5, 14, 15 (los que no
requieren un canal real).

---

## Lote 2 — iCal import/export + simuladores + anti-eco/cuarentena

**Carpetas exclusivas:** `packages/adapters/` (subpaquetes `airbnb/`,
`vrbo/`, `booking/`), `packages/sim/` (subpaquetes `airbnb-ical/`,
`vrbo-ical/`, `booking-ical/`, `booking-api/`), `tests/fixtures/` (feeds
`.ics` y payloads de canal — subcarpeta propia, sin tocar los fixtures de
esquema de Lote 1).

**Dependencias:** Lote 1 (necesita `ChannelAdapter`, el motor de resolución
UID/SEQUENCE/hash, y el esquema de `ocupacion_unidad`). Corre en paralelo
con Lote 3.

**Qué se construye (BACKLOG E04, E05):**
- Parser ICS RFC 5545/5546 con límites propios y controles SSRF.
- Implementación real de `ChannelAdapter` para Airbnb/Vrbo vía iCal
  (import/export); para Booking.com, el adaptador real declara
  `availabilityPush: false` para la vía directa (excluida por diseño del
  canal, D-011) y solo expone el hueco para delegar a un channel manager
  certificado de terceros (no implementado en Fase 2, solo el punto de
  extensión).
- Simuladores etiquetados (`AirbnbChannelSimulator`, etc.) con fixtures
  grabados, URL base `simulador.local`, y rechazo de arranque con
  credenciales sospechosas de producción (D-019).
- Anti-eco de 3 capas, idempotencia por `(canal, unidad, UID)`, cuarentena
  de feed inaccesible/malformado, reconciliación incremental/completa.

**Entregable verificable:** exportar un bloqueo hacia un simulador y hacer
que ese mismo simulador lo "reexporte" en su siguiente respuesta de import
— el sistema lo reconoce como eco y no crea un segundo bloqueo
`RESERVA_CANAL` (conteo de bloqueos activos antes/después = igual).

**Comando de prueba:** `npm run test:adversarial -- --filter=sync` (subset
de casos 1, 3, 6, 7, 8, 9, 10, 11, 13, 16, 17, 20 — los que no requieren
API/auth de Lote 3).

**Criterio de aceptación:** ACEPTACION §Calendario-3, §Calendario-4
completos; §Conectividad-1 (para los canales con adaptador real);
§Operación-4 (arranque de simulador rechazado con credenciales sospechosas).

---

## Lote 3 — API + auth/RLS/auditoría

**Carpetas exclusivas:** `apps/api/routes/`, `apps/api/middleware/`
(autenticación, resolución de tenant), `packages/db/migrations/` (nuevas
migraciones de RLS/roles/auditoría — archivos nuevos, no editan los de
Lote 1).

**Dependencias:** Lote 1 (esquema base, dominio de reserva/bloqueo). Corre
en paralelo con Lote 2.

**Qué se construye (BACKLOG E07, parte de E03 vía HTTP):**
- JWT propio (`jose`) con claims compatibles con RLS real de Restaurantes.
- Políticas RLS (`is_tenant_member` parametrizada + `FORCE ROW LEVEL
  SECURITY`), modelo de roles internos y 3 niveles de colaborador.
- `audit_log` con triggers en tablas sensibles; cifrado de credenciales de
  canal en reposo; logs sin PII.
- Endpoints HTTP sobre el dominio de Lote 1: `POST /reservas`, `POST
  /bloqueos`, `GET /unidades/:id/calendario`, `POST /canales/:id/sync`
  (dispara reconciliación manual), con errores de dominio explícitos (`409
  unidad_no_disponible`, no `500` genérico).
- **Publica el contrato de API (tipos TS compartidos u OpenAPI) en su
  primer commit**, para que Lote 4 pueda empezar contra ese contrato antes
  de que todos los endpoints tengan implementación completa.

**Entregable verificable:** un usuario autenticado de tenant A no puede
leer/modificar el calendario de tenant B (rechazado con error de
autorización, verificado con una suite de pruebas de privilegios).

**Comando de prueba:** `npm run test:integration -- --filter=rls`

**Criterio de aceptación:** ACEPTACION §RV19/21-4 (caso adversarial 18),
§RV19/21-13 (cifrado), §RV19/21-7 (logs sin PII), §Auditoría-1, §Roles-1.

---

## Lote 4 — Frontend calendario maestro + matriz de conectividad + monitor de sync

**Carpetas exclusivas:** `apps/web/pages/calendario/`,
`apps/web/pages/conectividad/`, `apps/web/pages/monitor-sync/`,
`apps/web/components/admin/AdminSidebar.tsx` (creación inicial — punto de
fusión compartido con lotes 5-9 para añadir sus propias entradas de menú,
ver nota de cabecera).

**Dependencias:** Lote 0 (`ui-atiende`) + contrato de API de Lote 3 (puede
empezar contra el contrato/mocks antes de que Lote 3 termine su
implementación completa).

**Qué se construye (BACKLOG E01-UX, E02, E06 en su parte de UI):**
- `AdminSidebar` adaptado con las `menuSections` de
  `docs/fase2/PLAN-CONSTRUCCION.md` §1.7.
- Calendario maestro: vista de línea de tiempo multi-propiedad + vista
  mensual de una unidad, modo "ocupación" vs. "tareas operativas",
  distinción visual de las 4 categorías de bloqueo con razón exacta al
  seleccionar fecha, selección múltiple de fechas (rango/semana) en
  escritorio y gestos táctiles en móvil.
- Matriz de conectividad por cuenta con latencia declarada, estados
  `no_conectado|bloqueado_por_partner|sandbox|producción`, y las etiquetas
  honestas de §6 de `PLAN-CONSTRUCCION.md` (Booking.com "pausado por el
  canal", iCal Booking "SIN EVIDENCIA").
- Monitor de sync: edad de última sync, drift, conflictos activos, con
  latencia interna vs. por canal siempre descompuesta.

**Entregable verificable:** con una unidad de prueba con al menos 4 razones
de bloqueo distintas activas, la UI muestra la razón exacta al seleccionar
cada fecha, y ninguna fecha con razón `RESERVA_CANAL`/`sincronización
externa` tiene un botón de "desbloquear" habilitado.

**Comando de prueba:** `npm run test:e2e -- --grep "calendario maestro"`

**Criterio de aceptación:** ACEPTACION §UX-1, §UX-2, §UX-3, §Conectividad-2,
§Conectividad-3, §Operación-2.

---

## Lote 5 — Operación: limpieza y mantenimiento

**Carpetas exclusivas:** `packages/domain/limpieza/`,
`apps/api/routes/limpieza/`, `apps/web/pages/limpieza/`.

**Dependencias:** Lote 1 (evento de checkout) + Lote 3 (auth/roles, incluido
el rol "Limpieza" y el portal de proveedor externo).

**Qué se construye:** BACKLOG E08 completo (H-049 a H-055).

**Entregable verificable:** confirmar un checkout de prueba crea una tarea
de limpieza vinculada; modificar la fecha de esa reserva reprograma la
tarea automáticamente preservando el responsable asignado.

**Comando de prueba:** `npm run test:integration -- --filter=limpieza`

**Criterio de aceptación:** ACEPTACION §Limpieza-1, §Limpieza-2.

---

## Lote 6 — Mensajes con aprobación humana

**Carpetas exclusivas:** `packages/domain/mensajeria/`,
`apps/api/routes/mensajeria/`, `apps/web/pages/mensajeria/`.

**Dependencias:** Lote 1 + Lote 3 (auth/roles). Puede construirse contra el
simulador de mensajería de Lote 2 si ya aterrizó; si no, usa fixtures
propias de mensaje entrante/saliente sin bloquear su avance.

**Qué se construye:** BACKLOG E09 completo (H-056 a H-061). Nota crítica:
esta es la única superficie de Fase 2 que puede tocar el catálogo de tools
de IA (borrador de respuesta) — el catálogo mismo (`properties: {}`, sin
identificadores) es responsabilidad de Lote 9, este lote solo consume esas
tools ya definidas para construir la cola de aprobación humana en UI.

**Entregable verificable:** un mensaje de 4001 caracteres hacia el
adaptador de Airbnb es rechazado/truncado con error explícito antes del
envío; un borrador generado no se envía sin que un humano pulse "aprobar".

**Comando de prueba:** `npm run test:integration -- --filter=mensajeria`

**Criterio de aceptación:** ACEPTACION §Mensajería-1, §Mensajería-2,
§Privacidad-2.

---

## Lote 7 — Finanzas/owners/statements + pricing + reporting

**Carpetas exclusivas:** `packages/domain/finanzas/`,
`packages/domain/pricing/`, `apps/api/routes/{finanzas,pricing,reporting}/`,
`apps/web/pages/{finanzas,pricing,reporting}/`.

**Dependencias:** Lote 1 + Lote 3.

**Qué se construye:** BACKLOG E10, E11, E12 completos (H-062 a H-073).
Combinados en un solo lote porque comparten la misma fuente de verdad
(`reserva`/`statement`) y el mismo perfil de riesgo (bloqueado por laguna
legal para las piezas fiscales, REQ-129/D-023).

**Entregable verificable:** con una reserva de Airbnb configurada como
"monto ya neto de comisión", el owner statement generado no resta de nuevo
la comisión sobre el bruto original.

**Comando de prueba:** `npm run test:integration -- --filter=finanzas`

**Criterio de aceptación:** ACEPTACION §Finanzas-1, §Finanzas-2, §Pricing-1,
§Pricing-2, §Legal-1 (para las piezas tras el feature flag).

---

## Lote 8 — Back office / superadmin

**Carpetas exclusivas:** `apps/web/pages/backoffice/`,
`apps/api/routes/backoffice/`.

**Dependencias:** Lote 1 + Lote 3 (necesita el modelo de roles y el
`audit_log` ya existentes).

**Qué se construye:** BACKLOG E13 completo (H-074 a H-076), más la UI de
gestión de `propiedad`/`unidad`/`cuenta_canal` (E02, H-011/H-012 en su
parte de formulario CRUD — el modelo de datos ya existe desde Lote 1/3,
este lote es la superficie de administración).

**Entregable verificable:** un acceso de Superadmin "romper cristal" a
datos de un tenant genera una entrada en `audit_log` con motivo explícito.

**Comando de prueba:** `npm run test:integration -- --filter=backoffice`

**Criterio de aceptación:** ACEPTACION §Roles-4, §Auditoría-1.

---

## Lote 9 — Automatización agéntica

**Carpetas exclusivas:** `packages/domain/agentes/` (catálogo de tools,
`ToolContext`, matriz rol×tool), `apps/api/routes/agentes/`.

**Dependencias:** Lote 1 (dominio de reserva/calendario, para saber qué NO
exponer como tool) + Lote 3 (sesión autenticada de la que se deriva
`ToolContext`).

**Qué se construye:** BACKLOG E14 completo (H-077 a H-085). Este lote es el
que Lote 6 consume para la cola de aprobación humana.

**Entregable verificable:** un test que enumera el registro completo de
tools falla si aparece alguna cuyo `input_schema.properties` incluya un
campo `*_id`/`tenant*`/`propiedad*`/`huesped*`/`reserva*`, o si aparece una
tool de cancelación/envío directo.

**Comando de prueba:** `npm run test -- --filter=agentes` (unitario, sin
necesidad de `embedded-postgres`).

**Criterio de aceptación:** ACEPTACION §RV19/21-14, §Automatización-1,
§Automatización-2, §Automatización-3.

---

## Lote 10 — Observabilidad y recuperación

**Carpetas exclusivas:** `apps/api/workers/observabilidad/`,
`packages/db/backup/`, `packages/db/migrations-tooling/` (runner
expand/contract), configuración de feature flags (`packages/domain/flags/`).

**Dependencias:** Lote 1 + Lote 2 + Lote 3 (necesita outbox, adaptadores y
API ya existentes para instrumentar el ciclo completo).

**Qué se construye:** BACKLOG E15 completo (H-086 a H-091), más la parte de
métricas/trazas OTel de E06 que no es exclusiva de Lote 4 (instrumentación
en `apps/api`, no en la UI).

**Entregable verificable:** una restauración de backup en un entorno
aislado pasa las verificaciones mínimas de integridad y dispara
automáticamente la reconciliación de drift antes de permitir push
automático.

**Comando de prueba:** `npm run test:integration -- --filter=recuperacion`

**Criterio de aceptación:** ACEPTACION §Operación-1, §Operación-2,
§Operación-3, §Operación-4.

---

## Lote 11 — Pruebas adversariales completas (20 casos) + carga

**Carpetas exclusivas:** `tests/adversarial/` (suite completa, no el subset
de Lote 2), `tests/load/`.

**Dependencias:** Lote 1 + Lote 2 + Lote 3 como mínimo para arrancar con
cobertura parcial; cobertura completa de los 20 casos requiere que 4-10
también hayan aterrizado (p. ej. el caso 18/19 de aislamiento multitenant
necesita los roles de Lote 3/8; el caso de "bloqueo manual superpuesto"
necesita Lote 5). Este lote se re-ejecuta y amplía continuamente conforme
aterrizan los demás, y queda como gate permanente de CI (REQ-170: ningún
release que toque sync/importador se libera sin él en verde).

**Qué se construye:** BACKLOG E16 completo (H-092 a H-095).

**Entregable verificable:** los 20 casos del catálogo de
`docs/ACEPTACION.md` §Calendario-2 identificados por nombre y en verde en
un solo reporte de CI.

**Comando de prueba:** `npm run test:adversarial && npm run test:load`

**Criterio de aceptación:** ACEPTACION §Calendario-2 completo (20/20
casos), §Plan-1 (ningún SLO publicado antes de piloto con datos reales).

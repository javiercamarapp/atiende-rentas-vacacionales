# Plan de construcción — Fase 2 (Atiende Rentas Vacacionales)

Este documento traduce el blueprint auditado de Fase 1 (`docs/BLUEPRINT.md`,
`docs/DECISIONES.md` D-001–D-023, `docs/REQUISITOS.md` REQ-000–REQ-179,
`docs/ACEPTACION.md`) en una arquitectura concreta a construir. No reabre
ninguna decisión ya adoptada; donde el blueprint marca algo `PENDIENTE`,
`SUPUESTO` o `PENDIENTE-EXTERNO`, este plan lo hereda con el mismo estado —
nunca lo cierra por inferencia de planificación.

---

## 0. Principios no negociables (heredados, no reinterpretados)

1. El sistema **nunca cancela una reserva confirmada** de forma automática
   (D-006, REQ-000).
2. El sistema **nunca contacta a un huésped** por iniciativa propia sin
   autorización humana explícita (D-006, REQ-001).
3. Las tools `cancelar_reserva` y `contactar_huesped_directo` **no existen**
   en el catálogo de ningún agente LLM, bajo ninguna condición (D-006,
   REQ-002).
4. La lógica de disponibilidad/solapamiento **nunca depende de un LLM**
   (D-007, REQ-003): siempre `EXCLUDE` de PostgreSQL + código determinista en
   transacción SQL.
5. Ninguna tool de agente declara `tenant_id`/`propiedad_id`/`huesped_id`/
   `reserva_id` en su `input_schema` (D-008, REQ-004): el servidor los
   resuelve desde el `ToolContext` de la sesión autenticada.
6. El estado de conexión de un canal **nunca** se reporta como `producción`
   sin evidencia verificable reciente de sync real exitosa (D-017, REQ-008).
7. Todo simulador de canal lleva nombre inequívoco de "simulador" y nunca se
   presenta como conexión productiva (D-019, REQ-164).

Cada lote de `docs/fase2/LOTES.md` y cada historia de `docs/fase2/BACKLOG.md`
se evalúa contra estos siete puntos antes que contra cualquier otro criterio.

---

## 1. Arquitectura concreta a construir

### 1.1 Stack (D-009, D-022)

- **Backend**: Node/TS propio. Framework HTTP: **Hono** (elegido sobre
  Fastify por menor huella y mejor ajuste a un runtime edge-portable si el
  camino de convergencia a Supabase Edge Functions se activa — D-009 deja
  ambos como candidatos; Hono se fija aquí como decisión de construcción,
  revisable solo con un ADR nuevo).
- **Auth**: JWT propio con `jose`, emitiendo los mismos nombres de claim
  (`sub` = `auth.uid()`-equivalente) que ya consumen las políticas RLS reales
  de `atiende-restaurantes`, para portabilidad 1:1 del patrón de RLS (D-020).
- **Persistencia dual (D-009, D-022, verificado en esta máquina el
  2026-09-05):**
  - `embedded-postgres` **18.4.0-beta.17** (versión exacta verificada con
    `npm view embedded-postgres version` en esta sesión) — Postgres real,
    usado para pruebas de integración/concurrencia real del `EXCLUDE`
    (D-012) y de idempotencia bajo carrera. Corre bajo Rosetta 2 en esta Mac
    (arm64 con slice x86_64 reportado) — vigilar tiempo de CI (RV17 §11,
    riesgo #1 de `docs/BLUEPRINT.md` §12).
  - `@electric-sql/pglite` **0.5.8** (versión exacta verificada con
    `npm view @electric-sql/pglite version`) — usado exclusivamente para
    pruebas unitarias rápidas de lógica de negocio y RLS. **Nunca** para
    validar el `EXCLUDE` bajo concurrencia real: PGlite serializa toda
    concurrencia (1344 ms vs. 302 ms medidos en la sesión de referencia de
    Hoteles, D-022) — usarlo ahí produciría un falso positivo de seguridad.
  - `docker`, `supabase` (CLI) y `psql` de sistema: **no instalados** en
    esta máquina (`which docker supabase psql` → sin resultado, verificado
    en esta sesión). `node` v25.6.1 y `npm` sí disponibles
    (`/opt/homebrew/bin/{node,npm}`). Ningún lote de Fase 2 puede asumir
    Docker disponible en dev; Staging/CI remoto sí puede tenerlo (ver §5).
- **Migraciones**: archivos `.sql` versionados a mano, aplicados con un
  runner propio (`node-pg-migrate` o script equivalente) contra ambos
  motores; `supabase migration new` se usa únicamente como generador de
  nombre/plantilla si está disponible (no requiere Docker para esa función
  puntual, RV17 §10.2), nunca para `db diff`/`db start`.
- **Pruebas**: Vitest + PGlite (unitarias/RLS), Vitest + `embedded-postgres`
  + cliente `pg` concurrente (integración/concurrencia), Playwright con
  `channel: 'chrome'` contra el Chrome del sistema (E2E, sin descargar
  binarios propios).
- **Frontend**: Vite 8 + React 18 + TypeScript + shadcn/ui (Radix) +
  Tailwind 3, mismo stack exacto que `atiende-restaurantes` (D-015).

### 1.2 Modelo de dominio (RV17, D-002, D-012)

Tabla única `ocupacion_unidad` con discriminador `capa` (`reserva`|
`bloqueo`), invariante `EXCLUDE USING gist (unidad_id WITH =, during WITH &&)
WHERE (capa='reserva' AND estado<>'cancelado' AND bloqueante)` sobre
`btree_gist`, `during daterange` `[check_in, check_out)`. Precedencia de
razón: `RESERVA_CANAL > BLOQUEO_PROPIETARIO > MANTENIMIENTO >
BUFFER_LIMPIEZA` (D-002). Conflictos entre capas y overbooking real
capturados en `conflicto_calendario` (nunca resueltos por cancelación
automática — BLUEPRINT §3.2). Ver `docs/BLUEPRINT.md` §3 para el SQL
completo y `docs/DECISIONES.md` D-002/D-012 para el razonamiento; este plan
no repite ni reinterpreta ese SQL, lo construye tal cual.

Entidades adicionales del modelo (RV17 §1.1): `tenant`, `empresa_gestora`,
`owner`, `propiedad` (con `zona_horaria` IANA obligatoria, D-013), `unidad`,
`canal`, `cuenta_canal`, `listing_canal` (unicidad parcial `(unidad_id,
cuenta_canal_id) WHERE activo`), `huesped_minimo` (D-014, minimización de
datos), `reservation_events` (append-only, event log de negocio),
`sync_outbox` (D-010), `tarea_limpieza`, `statement`, `audit_log` (D-020
§8.2), `tool_call_log` (RV18 §4).

### 1.3 Adaptadores por canal con estado honesto (D-017, RV17 §6)

Interfaz `ChannelAdapter` con `capabilities: ChannelCapabilities`
(`availabilityPush`, `ratesPush`, `reservationsPull`, `icalImportExport`,
`messaging`) y `getConnectionState(): Promise<EstadoConexion>` con enum
cerrado `no_conectado | bloqueado_por_partner | sandbox | produccion`.
`produccion` **nunca** se devuelve sin un registro de sync real exitoso
reciente en BD (verificado en CI con test que fuerza "credenciales
presentes, sin sync reciente" y confirma que el resultado no es
`produccion`, ACEPTACION §Conectividad-1).

Cada canal tiene dos implementaciones del mismo `ChannelAdapter`:
- **Real** (`AirbnbChannelAdapter`, `VrboChannelAdapter`,
  `BookingChannelAdapter`): implementa solo lo que la vía de integración
  disponible permite. Para Fase 2 inicial, la única vía sin aprobación
  externa es **iCal import/export** (Airbnb, Vrbo) — ver §4 sobre lo
  bloqueado.
- **Simulador** (`AirbnbChannelSimulator`, `BookingChannelSimulator`,
  `VrboChannelSimulator`, `BookingApiChannelSimulator`): implementa la misma
  interfaz sirviendo fixtures grabados/generados fielmente al formato
  documentado, **etiquetada explícitamente** en código, configuración y UI
  como `SIMULADOR — desarrollo/pruebas` (D-019, REQ-164). Reglas duras:
  - Nombre de clase/módulo inequívoco (nunca `AirbnbChannel` con un flag
    oculto).
  - URL base obviamente falsa (`https://simulador.local/...`).
  - Comprobación de arranque que **rechaza iniciar** si las credenciales
    configuradas matchean el patrón de credenciales de producción real
    (ACEPTACION §Operación-4).
  - En producción, el simulador **no existe** en el bundle desplegado (no
    solo deshabilitado por flag).

### 1.4 RLS multitenant (D-020, RV17 §8.1)

Función `security definer` parametrizada `is_tenant_member(_user uuid,
_tenant uuid)`, replicando literalmente el patrón verificado en código real
de `atiende-restaurantes` (`20260904050000_enterprise_tenant_isolation.sql`)
— nunca el patrón `current_tenant_ids()` sin parámetros. Toda tabla con RLS
lleva también `FORCE ROW LEVEL SECURITY` si el rol de conexión del backend
es dueño de las tablas. Suite de pruebas de privilegios cross-tenant
obligatoria en CI (caso adversarial 18, REQ-140).

### 1.5 Outbox/inbox y workers (D-010, RV17 §5, §7)

`sync_outbox` poblada en la **misma transacción** que el cambio de negocio;
worker de "message relay" con `SELECT ... FOR UPDATE SKIP LOCKED`, marca
`procesado_en` solo tras confirmación real, backoff exponencial acotado con
dead-letter tras N intentos. Idempotencia de import por `(canal, unidad,
UID)` con `INSERT ... ON CONFLICT`. Deduplicación de webhooks entrantes en
tabla separada `webhook_recibido`. Concurrencia acotada por
`pg_advisory_xact_lock` sobre `unidad_id` en workers (RV17 §7.4).

### 1.6 Import/export iCal, anti-eco, cuarentena (D-003, D-004, D-005, RV06/RV07)

Parser ICS propio (RFC 5545/5546), con: `DTEND` exclusivo o
`DTSTART+DURATION` normalizados, `UID` como identidad + `SEQUENCE`/
`LAST-MODIFIED`/hash de contenido como señal oportunista de versión (nunca
garantía — corrección BC del cierre de Fase 1), límites propios de tamaño/
recurrencia/timeout (RFC 5545 no los define), y controles SSRF antes de
cualquier `GET` (allowlist de esquema `https`, deny-list de rangos privados
+ metadata cloud, sin redirects automáticos). Anti-eco en 3 capas: namespace
propio en `UID` exportado, hash de contenido `(unidad, DTSTART, DTEND,
razón)`, metadato `exportado_a` por bloqueo. Cuarentena: fallo de
fetch/parseo nunca libera disponibilidad; último estado válido se congela
con timestamp, alerta tras 3x el ciclo esperado del canal.

### 1.7 Frontend con el sistema visual de Restaurantes (D-015)

Se porta el sistema visual completo de `atiende-restaurantes` (inventario
verificado en `atiende-hoteles-staging/docs/referencia/05-frontend-restaurantes.md`,
solo lectura, sin secretos/`.env`/`.git`): mismo logo (`AtiendeMark`/
`AtiendeWordmark`, reconstrucción SVG inline), mismos tokens de color
(`--primary 224 76% 48%`, `--secondary/accent 199 89% 55%`/`0EA5E9`,
sistema "white/blue/sky-blue"), misma tipografía (Inter/Inter Tight/IBM
Plex Mono), mismo `AdminSidebar` con acordeón (adaptado con `menuSections`
propias del dominio de rentas vacacionales), `StatCard`/`TrendStatCard`,
`ModalFormularioLateral`, y los 43 primitivos shadcn/ui **excepto**
`ui/sidebar.tsx` (confirmado sin uso real en el hermano — no se porta salvo
decisión explícita de adoptarlo). Deuda heredada y explícita: el panel admin
de Restaurantes no tiene experiencia mobile real (solo un stub de header) y
no tiene pruebas E2E de accesibilidad — Rentas Vacacionales debe decidir
explícitamente si housekeeping/mantenimiento en sitio exige tablet/celular
(caso más probable que en restaurantes) antes de heredar esa deuda sin más
(D-015, consecuencias).

`menuSections` propuestas para `AdminSidebar` de Rentas Vacacionales
(análogas por función a las de Restaurantes, dominio distinto):
- **ANÁLISIS** (siempre abierto): Estadísticas, Monitor de sincronización.
- **CALENDARIO**: Calendario maestro, Matriz de conectividad, Conflictos.
- **OPERACIÓN**: Limpieza/mantenimiento, Mensajería.
- **NEGOCIO**: Finanzas/owners, Pricing, Reportes.
- **PLATAFORMA** (solo admin/superadmin): Propiedades y unidades, Cuentas
  de canal, Automatización agéntica, Back office.

---

## 2. Estructura de carpetas del monorepo

```
apps/
  web/              # Frontend Vite+React+TS (panel admin, calendario, etc.)
  api/               # Backend Hono/TS (rutas HTTP, workers, auth)
packages/
  domain/            # Lógica pura: invariantes de calendario, precedencia de
                      # capas, resolución UID/SEQUENCE/DTSTAMP+hash, cálculo
                      # de noches/DST. Sin I/O. Consumido por api y por tests
                      # unitarios con PGlite.
  db/                # Esquema SQL versionado, migraciones, cliente de BD,
                      # helpers de conexión a embedded-postgres/PGlite/
                      # Postgres real, semillas de datos de prueba.
  adapters/          # Un subpaquete por canal con implementación REAL:
                      #   adapters/airbnb/ (iCal import/export)
                      #   adapters/vrbo/   (iCal import/export)
                      #   adapters/booking/ (extranet manual + hueco para
                      #                      channel manager certificado
                      #                      de terceros como intermediario)
                      # Cada uno implementa ChannelAdapter (packages/domain).
  sim/                # Simuladores etiquetados, un subpaquete por canal:
                      #   sim/airbnb-ical/, sim/vrbo-ical/, sim/booking-ical/,
                      #   sim/booking-api/ (Connectivity API simulada)
                      # Fixtures grabados/generados, nunca alcanzables desde
                      # producción (excluidos del build de prod).
  ui-atiende/         # Paquete de sistema visual portado de Restaurantes:
                      # tokens (index.css), primitivos shadcn/ui, AtiendeLogo,
                      # ThemeSelector, StatCard/TrendStatCard, shells de modal.
                      # Sin lógica de dominio de rentas vacacionales.
tests/
  adversarial/        # Catálogo de 20 casos (ACEPTACION §Calendario-2),
                      # ejecutable como suite dedicada en CI.
  load/               # Pruebas de carga del importador (RV21 §2.3),
                      # objetivos fijados empíricamente en piloto.
  fixtures/           # Feeds .ics de referencia, payloads de webhook
                      # anonimizados, datos de reserva sintéticos.
docs/                 # Ya existente (Fase 1 + fase2/).
```

Regla de dependencia: `domain` no importa de `adapters`/`sim`/`api`/`web`;
`adapters` y `sim` implementan las interfaces declaradas en `domain`; `api`
orquesta `domain`+`db`+`adapters`/`sim` según entorno; `web` solo consume la
API HTTP de `api`, nunca `domain`/`db` directamente. Esta regla es lo que
permite que los lotes de `docs/fase2/LOTES.md` corran en paralelo sin
conflicto de archivos.

---

## 3. Comandos

Definidos en el `package.json` raíz de cada paquete/app relevante, orquestados
desde la raíz del monorepo (workspaces npm):

| Comando | Qué hace | Motor/entorno |
|---|---|---|
| `npm run dev` | Levanta `apps/api` (watch) + `apps/web` (Vite dev server) contra `embedded-postgres` local | Node local, sin Docker |
| `npm run test` | Unitarias de `packages/domain` + RLS/lógica contra PGlite | PGlite, arranque instantáneo |
| `npm run test:integration` | Invariante `EXCLUDE` bajo concurrencia real, idempotencia de outbox bajo carrera, migraciones | `embedded-postgres` (Postgres 18.4 real) |
| `npm run test:adversarial` | Catálogo completo de 20 casos (`tests/adversarial/`) | `embedded-postgres` + simuladores etiquetados |
| `npm run test:e2e` | Flujo completo en navegador: calendario maestro, matriz de conectividad, monitor de sync | Playwright, `channel: 'chrome'` |
| `npm run test:load` | Throughput/latencia del importador bajo volumen de feeds | `embedded-postgres` + simuladores, objetivos calibrados en piloto |
| `npm run lint` | ESLint (flat config, heredado del patrón de Restaurantes) | — |
| `npm run typecheck` | `tsc --noEmit` en cada paquete/app | — |
| `npm run quality` | `lint && typecheck && test && test:integration && test:adversarial && build` | Gate de CI local, orden inspirado en el patrón verificado de Likida (RV20 §8) |

Ningún comando de CI omite `test:adversarial` en un release que toque el
motor de sincronización o el importador de feeds (REQ-170).

---

## 4. Estrategia de datos de prueba y fixtures

- **Fixtures de feeds `.ics`**: construidos a mano siguiendo exactamente el
  formato documentado por cada canal (RV06), nunca capturados de una cuenta
  real de producción sin anonimizar. Cubren: evento simple, evento con
  `SEQUENCE` incrementado, `STATUS:CANCELLED`, `DTSTART+DURATION` sin
  `DTEND`, feed vacío válido, feed malformado (BEGIN/END desbalanceado),
  feed con recurrencia (`RRULE`) si aplica, feed sobre el límite de
  tamaño/eventos configurado.
- **Fixtures de payloads de canal API** (Booking.com Connectivity API
  simulada): siguiendo el formato XML/B.XML documentado (RV04), nunca datos
  reales de partner (no hay acceso de partner aprobado — ver §5).
- **Datos sintéticos de reserva/propiedad**: generados por seed determinista
  (semilla fija por suite de test, para reproducibilidad), nunca datos de
  huéspedes reales; `huesped_minimo` de prueba usa nombres y contactos
  claramente ficticios (`Huésped de Prueba <no-reply@simulador.local>`).
- **Carga**: hasta que exista al menos un ciclo de piloto con datos reales
  (REQ-171, RV21 §6.4), ningún objetivo de throughput/latencia se fija como
  compromiso — se usan órdenes de magnitud conservadores del caso ancla
  (10-20 unidades, 3 canales, RV20) solo para dimensionar la infraestructura
  de pruebas, nunca como SLO publicado.
- **Datos de prueba de multitenancy**: al menos 2 tenants, cada uno con
  propiedades/unidades propias y un caso de propietario compartido entre 2
  empresas gestoras (REQ-023), para ejercitar la suite de aislamiento
  cross-tenant (caso adversarial 18) desde el primer lote de BD.

---

## 5. Cómo se mide latencia interna vs. por canal (D-003, REQ-039, RV20 §3)

Separación estructural, nunca una sola cifra agregada:

- **Latencia interna** (controlable): instrumentada como traza única OTel
  con spans PRODUCER (encolado en `sync_outbox`)/CONSUMER (worker) y spans
  INTERNAL de escritura/confirmación (RV20 §1.2). SLO interno propuesto
  **p95 < 5s / p99 < 15s** para el ciclo completo webhook→escritura→
  confirmación — **propuesta sujeta a piloto** (REQ-171), nunca publicada
  como SLA antes de al menos 2 semanas de datos reales (ACEPTACION §Plan-1).
- **Latencia por canal** (no controlable): la documentada por el canal
  mismo — Airbnb ~3h (confianza baja/media para generalizar a cualquier
  conexión iCal producto-Airbnb, RV03 supuesto S1), Vrbo ~30min+20min
  propagación, Booking.com **SIN EVIDENCIA** (no se inventa cifra). Expuesta
  en el monitor de sync y en la matriz de conectividad como campo separado,
  nunca sumada a la latencia interna en un solo número (REQ-039,
  ACEPTACION §Operación-2).
- Dashboard/export de observabilidad muestra ambas series etiquetadas por
  separado (ACEPTACION §RV19/21-8), consumiendo el Gauge de "edad de última
  sync exitosa" (por cuenta de canal) y el Histogram de duración interna
  por etapa (RV20 §1.1).

---

## 6. Qué queda BLOQUEADO por externo y cómo lo muestra la UI

| Elemento bloqueado | Estado real | Cómo lo muestra la UI |
|---|---|---|
| Partner directo Booking.com (Connectivity API) | **Pausado activamente por el canal** ("pausing integrations with new connectivity providers until further notice", `docs/fuentes/b002-archivo.md` F01) — no es "pendiente de aprobación", es puerta cerrada hoy | Matriz de conectividad: fila Booking.com → partner directo muestra literalmente `pausado por el canal` (no `pendiente`), con la cita de origen y fecha de verificación, nunca una fecha estimada de reapertura |
| Conexión directa individual a Booking.com (con o sin pausa) | Excluida por diseño del canal ("We don't accept direct connections from individual properties right now", F02) | Matriz muestra `no disponible — solo vía channel manager certificado o extranet manual`; sin botón de "conectar directo" para Booking.com en ningún flujo de onboarding |
| iCal de Booking.com (elegibilidad/frecuencia) | **SIN EVIDENCIA** — cero fuente primaria, ni viva ni archivada (F07) | Matriz muestra `SIN EVIDENCIA — no verificado` en vez de cualquier cifra de latencia; el adaptador de Booking.com vía iCal, si se implementa, se lanza marcado como no verificado hasta piloto |
| API partner de Airbnb (Homes/Activities API certificada) | Requiere NDA + revisión de seguridad + 6 meses post-aprobación para features obligatorias; webhooks no confirmados por fuente oficial | `getConnectionState()` nunca devuelve `producción` para esta vía sin evidencia; UI muestra `bloqueado_por_partner` con enlace al estado de la solicitud (fecha de solicitud, sin fecha estimada de aprobación) |
| Vrbo Connectivity Partner Program (Elite/Preferred/Integrated) | 3 niveles confirmados (confianza media, captura de 6 meses de antigüedad); requisitos/costos exactos no confirmados | UI no ofrece selector de nivel con costos; solo enlace a "solicitar información directa con Expedia Partner Central" |
| Credenciales/certificación de cualquier canal | No existen en este proyecto (ninguna cuenta de partner aprobada) | Todos los adaptadores reales de Fase 2 arrancan en `no_conectado` por defecto; solo iCal (Airbnb, Vrbo) puede alcanzar `produccion` real sin aprobación externa |
| Vigencia fiscal México (ISR/IVA retenciones), Registro Único de Arrendamientos España, regulación CDMX | Lagunas legales abiertas (B-003, B-004, B-005) | Toda función fiscal/legal dependiente vive detrás de feature flag `false` por defecto (D-023, REQ-163), sin afirmar fundamento legal en la UI hasta revisión humana documentada |

Regla transversal de UI (D-017, REQ-017): ninguna pantalla afirma que un
permiso o una integración de Atiende tiene "el mismo efecto" en Booking.com
o Vrbo que en Airbnb sin una nota explícita de que ese modelo no está
verificado (REQ-018, ACEPTACION §Roles-3/§Conectividad-3).

---

## 7. Riesgos de construcción (adicionales a los ya listados en BLUEPRINT §12)

- El `EXCLUDE` de §3.2 del blueprint es una composición razonada de dos
  fuentes primarias, no una cita de un ejemplo idéntico — el Lote 1 debe
  validarlo empíricamente contra `embedded-postgres` **antes** de que
  ningún otro lote dependa de él como verificado end-to-end.
- `embedded-postgres` bajo Rosetta 2 puede volverse cuello de botella si
  `test:integration` corre en cada commit; medir tiempo real en el primer
  lote y decidir si se corre solo en CI (no en pre-commit local).
- El sistema visual de Restaurantes no tiene experiencia mobile real ni
  pruebas de accesibilidad — si el caso de uso de limpieza/mantenimiento in
  situ exige tablet/celular (más probable aquí que en el hermano de
  restaurantes), el Lote 0/4 debe presupuestar ese trabajo explícitamente,
  no asumir que "portar el sistema visual" ya lo resuelve.
- Ningún canal real (Airbnb, Vrbo) tiene webhook confirmado por fuente
  oficial propia (RV07 §0) — todo el diseño de Fase 2 debe tratar polling
  como el modelo por defecto, incluso si en el futuro se obtiene acceso de
  partner API.

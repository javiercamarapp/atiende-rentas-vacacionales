# Auditoría 2 — Producto, UX, Operación, Agentes

Auditor adversarial independiente (Sonnet), sesión 2026-09-06. Repo:
`atiende-rentas-vacacionales-staging`, rama `main`, árbol limpio al
iniciar.

## Metodología

Se levantó la app real (no mocks de UI): `embedded-postgres` +
`aplicarMigraciones(migraciones)` reales de `@atiende-rv/db` +
`crearApp({ pool })` real de `apps/api` + `vite` real de `apps/web`,
mismo patrón que usa el propio repo en `apps/web/e2e/servidor-api-e2e.ts`
y `apps/web/e2e/lote8-captura.ts`. Se sembró un tenant nuevo ("Auditoría 2
— Casa Cancún SA de CV") con:

- 1 propiedad (`America/Cancun`, `MXN`), 2 unidades.
- **6 usuarios, uno por cada rol real** del sistema (`superadmin`,
  `admin_gestora`, `operador` con nivel `acceso_total`, `limpieza`,
  `propietario` vinculado a un `owner`, `contador`) — el
  `usuario.rol CHECK` de `packages/db/src/migrations/0010_usuario_roles_
  credenciales.ts:17-19` confirma que estos son los 6 únicos roles
  posibles, así que la muestra cubre el 100% del espacio de roles.
- Cuentas de canal: Airbnb (simulador, última sync hace 3h12), Booking.com
  (`partner_pendiente` con motivo explícito) — igual que el fixture E2E
  oficial del Lote 4.
- Una reserva creada vía `POST /reservas` real (nunca insertada por SQL
  directo — se comprobó empíricamente que insertar la ocupación por SQL
  **no** dispara el evento de checkout, porque `outbox_evento` se escribe
  en la capa de aplicación de `packages/domain`, no por trigger de base de
  datos; usar la API real es la única vía fiel a producción).

Se navegó con **Chrome del sistema vía Playwright** (`channel: "chrome"`,
mismo patrón que `playwright.config.ts` del repo) como cada uno de los 6
roles, en 1440×900 y en 375×812 (móvil), en modo claro y oscuro. Se
ejecutó el flujo operativo completo end-to-end **por UI real** (clics
reales, sin fabricar estado en el DOM): checkout → tarea de limpieza
generada → checklist completado ítem por ítem → incidencia grave
reportada con propuesta de bloqueo → confirmación humana explícita →
reflejo del bloqueo de mantenimiento en el calendario maestro. Se
capturaron 34 capturas reales en `docs/auditoria-2/capturas/` (prefijo
`v2-*`), citadas por nombre en cada hallazgo. Se consultó `/health/
detallado` y `/metrics` directamente por HTTP.

En paralelo, un segundo agente de esta misma auditoría verificó, por
lectura de código (rutas de API, dominio, esquema de base de datos, sin
navegar la UI), una muestra de 83 requisitos MUST de `docs/REQUISITOS.md`,
~35-40 criterios de `docs/ACEPTACION.md`, 45-65 de las 95 historias de
`docs/fase2/BACKLOG.md`, y una segunda pasada de la regla de oro a nivel
de código — resultados integrados en las secciones 12-15.

**Limitación declarada**: no se corrió un auditor de accesibilidad
automatizado (axe-core) por no estar integrado en el repo ni en el tiempo
disponible de esta sesión — el punto de accesibilidad de este informe es
inspección manual de las capturas (foco de teclado, contraste visual,
estructura semántica visible), no un reporte de axe. No se generó una
conversación de mensajería de punta a punta (mensaje entrante → borrador
→ aprobación) por UI en esta sesión — se verificó el estado vacío honesto
y los textos de política; el flujo de aprobación de mensajería ya tiene
cobertura de test de integración citada en `apps/api/test/integration/
mensajeria.test.ts` (458 líneas, ver `calidad-codigo.md`). Tampoco se
corrió la suite completa de tests (ver limitaciones en `calidad-codigo.md`
y al final de las secciones 12-15).

---

## 1. Honestidad (regla de oro, capa 2: UI/configuración)

**Verificado cumplido, sin excepciones encontradas.** Evidencia:

- Banner global **"Entorno de desarrollo — sin conexiones productivas"**
  presente sin scroll en absolutamente todas las páginas navegadas, los 6
  roles, ambos temas (capturas `v2-01` a `v2-91`).
- Matriz de conectividad (`v2-03-conectividad-admin.png`,
  `v2-91-conectividad-dark.png`): cada canal muestra estado honesto con
  fuente citada — Airbnb "SIMULADOR — desarrollo/pruebas" +
  "SIMULADOR — no es tráfico real"; latencia "~3 horas (confianza baja)"
  con cita "[DATO, confianza baja/media... RV03 S1, corrección BC5]" y la
  aclaración explícita "Latencia externa no controlada por Atiende —
  nunca se suma a la latencia interna"; Booking.com como **"Pausado por
  el canal"** (nunca "pendiente de aprobación") con la cita textual de
  Booking ("pausing integrations with new connectivity providers") y
  fuente archivada (`docs/fuentes/b002-archivo.md F01`); Vrbo "No
  conectado" con "SIN EVIDENCIA (confianza sin evidencia)" cuando no hay
  fuente primaria. Ninguna cifra de latencia se presenta sin su etiqueta
  de confianza.
- Cuentas de canal (`v2-04-cuentas-canal-admin.png`): tipo de conexión
  honesto explícito por fila ("simulador" / "partner_pendiente" con
  motivo obligatorio, verificado por constraint SQL
  `cuenta_canal_partner_pendiente_motivo`,
  `packages/db/src/migrations/0064_cuenta_canal_conexion_honesta.ts:20-22`),
  credenciales nunca mostradas en claro (columna "Credenciales" solo
  indica "configurada").
- Mensajería (`v2-06`, `v2-70-bandeja-estado-real.png`): texto explícito
  "Todo borrador de respuesta requiere aprobación humana explícita antes
  de enviarse — nunca se envía nada automáticamente", más el aviso legal
  de que Airbnb puede escanear mensajes (RV10 (f)), visible sin scroll.
- Pricing (`v2-09-pricing-admin.png`): "Las tarifas nunca se sincronizan
  por iCal — solo hacia un canal con integración API activa."
- Feature flags de superadmin (`v2-20-superadmin-panel.png`): el flag
  `sync.canal_pausado_por_alerta` documenta en su propia descripción
  "Nunca cancela reservas ni contacta al huésped — solo detiene el envío
  hacia el canal afectado."

No se encontró ningún texto que presente un simulador como conexión
productiva, ni ninguna promesa de "tiempo real" o "cero overbooking" en
las ~15 páginas navegadas.

---

## 2. Regla de oro (capa 1: código/API) — verificado en vivo

- `POST /reservas` (`apps/api/src/routes/reservas.ts:43-66`) **siempre**
  crea una reserva con `canalOrigenId` = canal `'manual'` — nunca una
  "reserva de canal". Confirmado en vivo: la reserva creada vía API para
  disparar el checkout apareció en el calendario con el color "Reserva
  directa" (verde), no "Reserva de canal" (azul) — coherente con el
  código.
- `exigirReservaDirecta` (`reservas.ts:16-32`) bloquea cancelar/modificar
  cualquier reserva cuyo `canal_codigo` no sea `null`/`'manual'`, con
  mensaje explícito: *"Esta reserva proviene de un canal externo — la API
  nunca cancela ni modifica reservas de canal"*.
- Confirmación de bloqueo de mantenimiento por incidencia grave: **exige
  un clic humano explícito** (`IncidenciasUnidad.tsx`, botón "Confirmar
  bloqueo de mantenimiento") — reportar la incidencia por sí solo NUNCA
  crea el bloqueo confirmado, solo lo propone (`estado:
  bloqueo_propuesto`). Verificado en vivo, capturas `v2-15` → `v2-16`: el
  bloqueo pasa de "BLOQUEO_PROPUESTO" a "BLOQUEO_CONFIRMADO" solo tras el
  clic, con el texto "Bloqueo de mantenimiento confirmado — nunca cancela
  reservas existentes."
- No se encontró en la navegación ni en el código ningún botón o ruta que
  permita cancelar una reserva de canal, contactar a un huésped sin pasar
  por aprobación, o actuar sobre una cuenta de canal sin control (crear/
  editar cuentas exige rol admin, romper cristal exige motivo + expira).

**Veredicto: regla de oro cumplida en las tres capas que se pudieron
verificar en esta sesión (código, UI, y el propio flujo operativo en
vivo).** Ver también §15 para la segunda pasada, de solo código, hecha
por un agente independiente en paralelo.

---

## 3. UX del calendario maestro

Capturas: `v2-01`, `v2-02` (375px), `v2-80` (foco de teclado), `v2-90`
(oscuro), `v2-18` (tras confirmar bloqueo).

**Positivo:**
- Leyenda de 6 capas siempre visible sin scroll (Reserva directa /
  Reserva de canal / Bloqueo del propietario / Mantenimiento / Buffer de
  limpieza / Conflicto pendiente), con colores suficientemente
  distinguibles entre sí en ambos temas (verificado visualmente: verde,
  azul, naranja, granate/rojo oscuro, verde azulado, magenta).
- El bloqueo de mantenimiento generado por la incidencia confirmada
  aparece en el calendario maestro en tiempo real tras refrescar
  (`v2-18`), confirmando "una sola fuente de verdad" declarada en el
  subtítulo de la página.
- Selector de vista (Línea de tiempo / Mes / Lista), navegación de rango
  con flechas, fechas ISO explícitas en la cabecera (`2026-09-06 →
  2026-09-27`).
- Zona horaria de la propiedad (`America/Cancun`) se muestra en el panel
  de detalle al seleccionar una noche (`PanelSeleccion.tsx:67`, "zona
  horaria: `America/Cancun`" en fuente monoespaciada) — confirmado en el
  código; no se pudo re-confirmar con una captura propia sin interacción
  de arrastre en esta sesión (limitación de tiempo del guión de captura).
- Responsive 375px real: la tabla del calendario se vuelve
  horizontalmente desplazable dentro de su propio contenedor (nunca
  desborda la página), el sidebar colapsa a un ícono de menú hamburguesa,
  la leyenda se reordena en 2 columnas — sin overflow horizontal de toda
  la página (`v2-02`).
- Navegación por teclado: 3 `Tab` consecutivos mueven el foco visible por
  los controles de la página (verificado que no se pierde el foco fuera
  de la ventana); no se hizo un barrido exhaustivo de todos los
  controles interactivos por teclado (limitación de tiempo).

**Hallazgos:**

**P-05 [BAJO]** — La zona horaria de la propiedad solo es visible tras
seleccionar una noche/rango; no aparece en la cabecera de la página ni
junto al nombre de la unidad en la vista por defecto. Cumple la letra del
requisito ("TZ visible") pero no "a simple vista" sin interacción.
Sugerencia: mostrarla también junto al nombre de la propiedad/unidad en
la cabecera de cada fila.

**P-06 [BAJO/INFO]** — No se verificó contraste con una herramienta
automatizada (axe/Lighthouse) — ver limitación declarada arriba. A
inspección visual el contraste en modo oscuro (texto gris claro sobre
fondo azul-marino `#0f172a`-ish) y en modo claro parece suficiente, pero
esto no sustituye una medición real de ratio WCAG. Recomendado incorporar
`@axe-core/playwright` a la suite E2E existente.

No se encontraron textos "Lorem ipsum" ni placeholders visibles en
ninguna de las páginas navegadas, en ningún rol.

---

## 4. Operación: checkout → limpieza → checklist → incidencia → bloqueo

**Flujo completo verificado por UI real, sin atajos de estado fabricado**
(capturas `v2-11` a `v2-18`):

1. `POST /reservas` crea la reserva (equivalente a lo que haría un
   huésped/canal real activando el ciclo de vida).
2. El botón real **"Procesar checkouts pendientes"**, visible en la
   página `/operacion` para roles con `puedeGestionarOperacion`
   (`v2-11`), es la misma acción que se disparó vía API en este guión —
   confirmado que es un botón real de producto, no solo un endpoint
   interno.
3. Tarea de limpieza "Depto Checkout-Hoy" aparece en el tablero del día
   correcto, con checklist de 7 ítems pre-poblado por plantilla
   (`plantillaChecklistPorTipo`, `packages/domain/src/limpieza/
   checklist.ts`) — Ropa de cama, Baños, Cocina, Pisos, Basura,
   Amenidades, Revisión de daños, Fotos finales.
4. Cada ítem se completa con un clic ("Completar"), con campo opcional de
   ruta de foto `dev-local/...` — honesto sobre que es almacenamiento
   local de desarrollo, no producción (`v2-12` → `v2-13`, timestamps
   reales por ítem, ej. "Completado 6/9/2026, 5:18:19 a.m.").
5. Se reporta una incidencia "Grave" con rango de bloqueo propuesto
   (`v2-14` formulario lleno → `v2-15` estado `BLOQUEO_PROPUESTO`).
6. Clic humano explícito en "Confirmar bloqueo de mantenimiento" →
   `BLOQUEO_CONFIRMADO`, con el texto "nunca cancela reservas existentes"
   (`v2-16`).
7. "Completar tarea" cierra la tarea de limpieza (`v2-17`).
8. El calendario maestro refleja el nuevo bloqueo de mantenimiento en las
   fechas correctas, en el color correcto de la leyenda (`v2-18`).

**Este es el hallazgo más sólido de la auditoría de producto: el flujo
crítico de operación está construido de punta a punta, con separación
correcta entre "proponer" (severidad grave) y "confirmar" (clic humano),
exactamente como exige DEFINICION-DE-HECHO y ACEPTACION §Limpieza-1/2.**

No se encontraron defectos en este flujo.

---

## 5. Mensajería

Capturas `v2-06`, `v2-70`. Estado vacío honesto ("Sin conversaciones
todavía"), textos de política visibles sin scroll (aprobación humana
obligatoria, aviso de escaneo de Airbnb por motivos de fraude/seguridad
citando la fuente RV10 (f) y la Privacy Policy de Airbnb). No se generó
una conversación de punta a punta en esta sesión (limitación de tiempo);
el código (`HiloPage.tsx:6,12-16,142-145`) confirma que "Aprobar y
enviar" es literalmente el único botón que transiciona un borrador a
`enviado` — no existe una acción "enviar" separada de "aprobar", lo cual
es coherente con la regla de oro.

**P-07 [INFO, no verificado en vivo]**: no se pudo confirmar visualmente
el indicador de simulador *dentro* de un hilo de conversación
(`BadgeCanalSimulado.tsx` existe en el código, con test dedicado) porque
no se generó ninguna conversación en esta sesión. Recomendado que una
futura sesión de auditoría complete este flujo con datos reales.

---

## 6. Finanzas y back office

Capturas `v2-07` (admin), `v2-42` (limpieza intenta), `v2-50` (propietario),
`v2-60` (contador), `v2-52` (propietario intenta cuentas-canal).

- Vista de admin: generación de owner statement (idempotente/versionado),
  reglas de comisión de canal "nunca hardcodeadas" con campo de fuente
  obligatorio, registro de movimiento financiero por reserva "sin doble
  descuento", conciliación de payouts pegando el export CSV/XLS del
  canal. Todo con lenguaje honesto sobre el origen de cada dato.
- Vista de propietario (`v2-50`): título cambia a "Finanzas — mis
  liquidaciones", texto "Solo ves las tuyas", sin controles
  administrativos (`esAdmin`/`esRolFinanzas` gatean la UI en
  `FinanzasPage.tsx:56-58,78-86,100`).
- Vista de contador (`v2-60`): ve el filtro por propietario (rol de
  finanzas) pero no la generación de statements (solo `esAdmin`).
- **Aislamiento de datos real, no solo de UI**: verificado que la
  política RLS `owner_statement_select`
  (`packages/db/src/migrations/0054_finanzas_pricing_rls.ts:152-159`)
  restringe a nivel de base de datos a
  `superadmin/admin_gestora/contador` o al propio `owner_id` del
  propietario — el rol `limpieza`/`operador` recibe 0 filas aunque
  llegue a la página por URL directa.

**P-04 [BAJO]** — El endpoint `GET /finanzas/statements`
(`apps/api/src/routes/finanzas.ts:414`) no tiene ninguna llamada a
`exigirRol`, a diferencia de todos sus endpoints hermanos de escritura.
El aislamiento correcto observado en vivo (`limpieza` y `propietario` ven
la tabla vacía sin fuga de datos) depende **enteramente** de la política
RLS de Postgres, sin una segunda capa de defensa en la ruta HTTP como
tiene el resto de `finanzas.ts`. No es una fuga de datos confirmada — es
un único punto de falla en vez de defensa en profundidad. Ver también
`calidad-codigo.md` Q-11.

**P-08 [BAJO/UX]** — Cuando un rol sin permiso navega por URL directa a
una página de back office (`/administracion` como `operador`,
`v2-31-operador-intenta-administracion.png`; `/cuentas-canal` como
`propietario`, `v2-52`), la página monta su shell completo y apila 2-3
cajas de error "`403 — no autorizado · rol_forbidden`" en vez de una
sola pantalla de "sin acceso" o una redirección automática. Funcionalmente
seguro (nunca se muestran datos ni se permite la acción), pero
ruidoso/confuso si un colaborador llega ahí por error de navegación (el
propio ítem de menú ya está oculto para esos roles — solo ocurre con URL
directa).

**Back office — "romper cristal"** (`v2-20`, `v2-21`): banner de acceso
activo con motivo, tenant, expiración countdown y botón "Revocar" visible
mientras está activo; exige motivo obligatorio antes de habilitar el
botón "Romper cristal". Cuentas de canal nunca muestran credenciales en
claro (confirmado también a nivel de esquema: `credenciales_cifradas`
como `bytea`, cifrado con versión de clave — `cuenta_canal.credenciales_
clave_version`).

---

## 7. Agentes

**P-01 [MEDIO]** — El ítem de menú "Automatización agéntica"
(`apps/web/src/components/admin/AdminSidebar.tsx:96`) **no tiene
`ruta`** — queda deshabilitado/"Pronto" para siempre, para los 6 roles
probados, incluido `superadmin`. Existe un backend real y probado
(`apps/api/src/routes/agentes/index.ts`, migraciones `0070-0072_agentes_*`),
pero **no hay ninguna pantalla de producto** donde un usuario pueda ver:
el flag default-off del agente, las tools disponibles, las trazas de
tool-calls, o las cuotas/presupuesto consumido — exactamente los 4
elementos que este mismo encargo de auditoría pide verificar
visualmente. Se verificó por completo la ausencia de ruta navegando como
`superadmin` (el rol con más privilegios) sin encontrar ninguna pantalla
alternativa. Impacto: la transparencia de agentes exigida por RV18/
ACEPTACION §Automatización-1/2/3 solo es verificable hoy por quien tiene
acceso directo a la base de datos o a la API — no es un producto
utilizable por un operador o admin_gestora real. Ver §15 para lo que sí
confirma el backend a nivel de código (muy sólido).

Corrección propuesta: o se construye la página (aun mínima: flag +
lista de tool-calls recientes con actor/costo/resultado), o se retira el
ítem del menú hasta que exista, para no anunciar una capacidad de
producto que no se puede usar.

---

## 8. Observabilidad

- `/health/detallado` (HTTP directo, sin sesión): responde 200 con
  `db.conectada`, tamaño de cola de outbox, edad del evento pendiente
  más viejo, y un resumen de métricas (`httpRespuestas`,
  `latenciaHttpMs` con p50/p95/p99). Real, no simulado — refleja el
  tráfico generado por esta misma sesión de auditoría.
- `/metrics`: formato Prometheus real con `# HELP`/`# TYPE` para 9
  familias de métricas (incluyendo `atiende_rv_sync_latencia_externa_
  declarada_segundos`, que documenta explícitamente en su propio `HELP`
  que es una latencia "DECLARADA por el canal (no medida)" — honestidad
  hasta en el nombre de la métrica).
- Backend de alertas real: `GET /alertas`, `POST /alertas/:id/ack`,
  `POST /alertas/:id/resolver`
  (`apps/api/src/workers/observabilidad/rutas.ts:72-93`).

**P-02 [MEDIO-ALTO]** — **No existe ninguna página en `apps/web/src/
pages` que consuma `GET /alertas` ni los endpoints de ack/resolver**
(confirmado por búsqueda exhaustiva en el árbol de páginas). El panel de
superadmin solo muestra un contador agregado por tenant ("Alertas
abiertas: 0", columna de la tabla de directorio de tenants, `v2-20`), sin
lista, sin detalle, y sin botón de reconocer/resolver. Un operador no
tiene, desde el producto, ninguna forma de ver una alerta activa,
reconocerla o resolverla — tiene que usar la API directamente. Esto
contradice el punto (9) del encargo de esta auditoría ("alertas con
ack") y el criterio general de RV20 de observabilidad operable desde el
producto, no solo desde curl. Es el hallazgo de producto más importante
de esta sesión junto con P-01.

Corrección propuesta: construir al menos una tabla de alertas abiertas
con botones "Reconocer"/"Resolver" en el Monitor de sincronización o en
el panel de superadmin — ambas superficies existentes.

**No se encontraron runbooks enlazados desde la UI** (existen en
`docs/runbooks/` como documentación, pero no hay un enlace ni referencia
visible desde el producto en las páginas navegadas).

---

## 9. Fidelidad visual con Atiende (referencia: atiende-restaurantes)

El propio código documenta la procedencia: `AdminSidebar.tsx` está
"portado tal cual del patrón verificado de atiende-restaurantes (solo
lectura)", igual que `ThemeSelector.tsx`. A inspección visual de las
capturas: logo/wordmark "atiende" consistente en todas las páginas,
esquema de color primario azul, tipografía y espaciados de tarjeta
consistentes con un sistema de diseño (`@atiende-rv/ui-atiende`,
componentes `Card`/`Badge`/`Button`/`Table` reutilizados en todas las
páginas sin variación de estilo perceptible), selector de tema claro/
sistema/oscuro con los mismos 3 iconos (sol/monitor/luna) y comportamiento
(oscuro coherente en `v2-90`/`v2-91`, sin colores que se rompan o texto
ilegible). No se hizo un diff pixel-a-pixel contra `atiende-restaurantes`
(fuera de alcance de tiempo razonable para esta sesión) — la evaluación
es de fidelidad de patrón/componentes, no de píxeles exactos.

---

## 10. Errores tipados y manejo de fallos

Verificado en vivo: ningún 500 en pantalla ni stack trace expuesto en
ningún momento de la sesión (incluyendo los intentos deliberados de
acceso no autorizado). Todos los errores de permisos se muestran como
cajas rojas con código y mensaje en español
("`403 — no autorizado · rol_forbidden` — Rol "operador" no autorizado
para esta acción"). Ver `calidad-codigo.md` §7 para el análisis de código
correspondiente (contrato `ErrorDominio` central, 0 `throw new Error()`
genéricos en rutas).

---

## 11. i18n / zona horaria / moneda por propiedad

- Moneda configurada por propiedad (`MXN` en el fixture) se refleja en
  Owner statements y reglas de comisión ("Moneda" columna,
  `v2-07-finanzas-admin.png`).
- Zona horaria por propiedad (`America/Cancun`) se resuelve por unidad y
  se muestra en el panel de selección del calendario (ver §3, P-05).
- Todos los textos de producto observados están en español consistente
  — no se encontraron mezclas de idioma ni textos en inglés sin traducir
  en los 6 roles navegados, salvo términos técnicos esperados (nombres de
  canal "Airbnb"/"Booking.com"/"Vrbo", códigos de estado en `SNAKE_CASE`
  como `BLOQUEO_PROPUESTO`, que son identificadores de dominio, no prosa).

---

## 12. Muestreo de REQUISITOS.md (83 REQ MUST, ≥60 exigido)

Verificación de código (rutas de API, dominio, esquema de base de datos),
complementaria a la verificación en vivo de este documento. Muestra
representativa de las 83 filas verificadas (se listan aquí las más
relevantes por área; conteo completo abajo):

| REQ-id | Resumen | Estado | Evidencia |
|---|---|---|---|
| REQ-000/044 | Nunca cancela reserva de canal automáticamente | Implementado | `apps/api/src/routes/reservas.ts:10-33` (`exigirReservaDirecta`) |
| REQ-001/104 | Nunca contacta huésped sin aprobación humana | Implementado | `packages/domain/src/mensajeria/colaAprobacion.ts:110-121` — endpoint de prueba dedicado `/intento-automatico` que siempre falla por diseño |
| REQ-002/004 | Tools de IA prohíben cancelar/contactar/cambiar-tenant/ejecutar-sql | Implementado | `packages/domain/src/agentes/catalogo.ts:19-31` (`NOMBRES_TOOLS_PROHIBIDAS`) |
| REQ-007/126 | Nada fiscal (CFDI) sin verificación humana | Bloqueado (laguna legal, correcto) | `apps/api/src/routes/finanzas.ts:731` ("no es un comprobante fiscal") |
| REQ-008/049/052 | Estado de conexión honesto, ≥3 niveles, nunca "tiempo real" sin evidencia | Implementado | `packages/domain/src/channelAdapter.ts`; confirmado también en vivo (§1) |
| REQ-013 | Método de pago solo editable por propietario | **Ausente** | La función "método de pago" no existe aún — 0 resultados de grep; riesgo latente si se construye sin revisar de nuevo este requisito |
| REQ-020 | "Romper cristal" siempre auditado con motivo y ventana | Implementado | `apps/api/src/routes/backoffice/romperCristal.ts:59-83`; confirmado en vivo (`v2-21`) |
| REQ-023 | Propietario en 2+ empresas gestoras sin fuga | **Ausente** | BACKLOG H-048 declarado "por hacer"; relación 1:1 en el esquema |
| REQ-039 | Distingue latencia interna vs. reflejada en canal | Parcial | Falta histograma/reporte de percentiles (H-073 "por hacer") |
| REQ-069/082 | Sync Booking.com/Vrbo por vía directa API | Bloqueado por externo | Cita textual del ToS en `packages/adapters/src/booking/adapter.ts:1-26` |
| REQ-092 | Timestamp exacto de confirmación de reserva | Parcial | Solo `creado_en`/`actualizado_en` genéricos, sin columna dedicada |
| REQ-119 | Bloqueo de mantenimiento propagado a canales | Parcial (declarado) | Confirmado en vivo que el bloqueo se refleja en el calendario maestro (§4); propagación a canales reales es otro alcance |
| REQ-123 | Payout con ventana 45 días sin marcar "atrasado" | **Ausente** | Sin coincidencias en `finanzas.ts` ni migraciones 0050-0052 |
| REQ-141 | Cifrado credenciales AES-256-GCM con rotación | Implementado/parcial | Cifrado confirmado (`cifrado.test.ts:14-42`); rotación *periódica automatizada* pendiente |
| REQ-150/151 | Aviso de privacidad LFPDPPP/RGPD, bandeja ARCO | **Ausente** | 0 resultados — declarado como pendiente por REQUISITOS.md, no oculto |
| REQ-156/157 | Métricas/trazas tipo OpenTelemetry | Implementado (con matiz) | Reimplementación propia "OTel-like" (`otel.ts:4`), no usa `@opentelemetry/*` real. Confirmado en vivo: `/metrics` (§8) es Prometheus-*compatible* en formato de texto, pero generado a mano |
| REQ-166 | Modo degradado solo-lectura si BD primaria cae | **Ausente** | H-091 "por hacer", reconocido honestamente |
| REQ-170 | Catálogo de 20 casos adversariales en CI | Parcial | 20/20 verdes localmente (`docs/logs/adversarial-reporte.md`); no se confirmó ejecución en runner remoto de GitHub Actions en esta sesión |
| REQ-174/175 | Facturación por unidad + add-on IA en ciclos independientes | **Ausente** | Ningún módulo de facturación construido — MUST sin implementación alguna |

**Conteo de la muestra completa de 83 REQ**: 62 implementados · 12
parciales · 7 ausentes · 6 bloqueados por externo/laguna legal (correcto,
no ocultado) · 1 no aplica. Cobertura por área: seguridad/RLS/agentes muy
sólida (routing de tools por rol, cuotas, escalamiento, evals — todos con
test); las brechas reales concentradas en: facturación (inexistente),
avisos legales de privacidad (inexistentes, ya reconocidos por
REQUISITOS.md), multi-empresa-gestora, y modo degradado de BD.

## 13. Criterios de ACEPTACION.md — evidencia real vs. declarada

De ~35-40 secciones de `docs/ACEPTACION.md` revisadas contra
`docs/logs/`, `docs/capturas/` y el código de test: **≈27-31 con
evidencia real verificable** (test con nombre citando el REQ/criterio, o
log de ejecución real), **≈8-10 solo declaradas sin evidencia
comprobable**, **≈5 no aplican** (COULD no construido por decisión
correcta). Los 20 casos adversariales de calendario (§Calendario-2) son
el grupo mejor respaldado: 20/20 con evidencia real de test, incluyendo
el propio D-ADV-01 dejado documentado en rojo en su momento, no
ocultado (ver §15). El hueco más serio: **RV19/21-9 (avisos ARCO/RGPD) no
tiene ni evidencia ni declaración en código** — 0 resultados de grep,
coherente con el REQ-150/151 ausente de arriba. Hallazgo transversal de
menor severidad: la evidencia de "CI en verde" citada en ACEPTACION.md
proviene de ejecuciones locales; no se confirmó un runner remoto de
GitHub Actions en esta sesión.

## 14. BACKLOG.md (95 historias) — discrepancias vs. código real

Muestreo sistemático de 45-65 de las 95 historias (16 épicas cubiertas).
**Veredicto: el backlog es confiable y notablemente autocrítico** —
declara explícitamente sus propias brechas ("parcial", "no expuesto
aún", "esqueleto") en vez de inflar "hecho", y esas auto-calificaciones
resistieron la verificación contra código en prácticamente todos los
casos.

| H-id | Historia | Estado declarado | Discrepancia encontrada |
|---|---|---|---|
| **H-012** | `cuenta_canal`/`listing_canal` con "unicidad parcial `(unidad_id, cuenta_canal_id) WHERE activo`" | Hecho (Lote 8) | **Discrepancia real**: la tabla real (`unidad_canal_feed`) usa `UNIQUE (unidad_id, canal_id)` completo, no parcial, sobre `canal_id` no `cuenta_canal_id`, sin columna `activo`. El objetivo (evitar feeds duplicados) se cumple por otro mecanismo, pero la historia describe un esquema distinto al implementado — de nomenclatura, sin impacto de seguridad ni funcional |
| H-092 | Catálogo 20 casos adversariales | Hecho (Lote 11A) | Matiz: evidencia solo de ejecución local, no de runner remoto |
| H-048, H-071, H-073, H-091 | Multi-empresa-gestora / paridad de precios por jurisdicción / percentiles p50-p95-p99 / modo degradado | "Por hacer" | Confirmado correctamente ausente — el backlog acierta |
| H-054, H-064, H-072, H-086, H-088 | Notificación multicanal / conciliación Vrbo oficial / reportes cruzados / backup WAL-retención / migraciones con ventana | Hecho (parcial, declarado así por el propio backlog) | Confirmado — el backlog ya admite el alcance parcial, sin discrepancia oculta |

Historias verificadas sin discrepancia: prácticamente el resto de la
muestra (H-001 a H-047 excepto H-012, H-049 a H-090, H-093 a H-095).
**Conteo: 1 discrepancia real (H-012, cosmética/de esquema) + 1 matiz no
aclarado (H-092) sobre 45-65 historias muestreadas.**

## 15. Regla de oro — verificación de código (segunda pasada, complementaria a §2)

Controles positivos adicionales confirmados por lectura de código, más
allá de los ya verificados en vivo en §2: catálogo de tools de IA que
**no declara** `cancelar_reserva`/`contactar_huesped_directo`/
`cambiar_tenant`/`ejecutar_sql` (no es un "if" que las bloquea, es que no
existen en el catálogo — `packages/domain/src/agentes/catalogo.ts:19-31`,
con test dedicado); simuladores que rechazan arrancar si detectan
patrones de credencial de producción (`live_`, `prod_`, `sk_live_`,
`AIRBNB_PROD_`, `NODE_ENV=production` —
`packages/sim/src/comun/etiquetado.ts:1-46`); grep exhaustivo de "tiempo
real"/"en vivo"/"cero overbooking"/"Booking.com conectado" en todo el
código (frontend, backend, simuladores, OpenAPI): **0 coincidencias de
marketing engañoso**.

**P-09 [BAJA, ya corregido — citado por trazabilidad]**: `POST /bloqueos`
cross-tenant devolvía un `500` genérico en vez de un error de
autorización clasificado (403/404) — 0 filas escritas, 0 fuga de datos
confirmada por SQL directo; defecto de clasificación de error HTTP, no de
control de acceso. Documentado por el propio equipo en
`docs/auditoria-2/defectos-adversarial.md` (D-ADV-01) y corregido en el
commit `e976d99` antes de esta sesión. Se cita aquí solo por
trazabilidad, no como hallazgo abierto.

**P-10 [BAJA]** — `POST /mensajeria/plantillas/programar`
(`apps/api/src/routes/mensajeria/plantillas.ts:100-140`) permite
programar un mensaje sobre una plantilla pre-aprobada, pero no se
encontró ningún worker que efectivamente procese `mensaje_programado` y
lo envíe (0 resultados de `mensaje_programado` en
`apps/api/src/workers`). Hoy no hay riesgo porque nada se envía
automáticamente (no existe despachador), pero si se construye ese worker
en un lote futuro sin una segunda puerta de aprobación explícita por
mensaje individual, podría erosionar la regla de oro para plantillas
consideradas "de bajo riesgo". Recomendado dejarlo como nota de vigilancia
para el próximo lote que toque mensajería.

**Limitaciones declaradas de las secciones 12-15**: no se ejecutó
`npm test` en esta pasada de código (se leyó el código de los tests, no
se corrieron); los logs de `docs/logs/` son de ejecuciones previas reales
pero no se confirmó que reflejen el estado exacto actual del código; no
se verificó el valor numérico exacto de varios límites (tamaño del
importador ICS, umbral de evals); no se auditó exhaustivamente
`package-lock.json` en busca de dependencias de scraping.

---

## Tabla de hallazgos (severidad)

| ID | Severidad | Área | Resumen | Evidencia |
|---|---|---|---|---|
| P-01 | Medio | Agentes | Sin UI para automatización agéntica pese a backend completo | AdminSidebar.tsx:96; v2-20 |
| P-02 | Medio-Alto | Observabilidad | Sin UI de alertas con ack/resolver pese a API completa | rutas.ts:72-93; v2-20/v2-21 |
| P-04 | Bajo | Finanzas/back office | `GET /statements` sin `exigirRol`, aislamiento solo por RLS | finanzas.ts:414 |
| P-05 | Bajo | Calendario UX | TZ de propiedad no visible sin interacción | PanelSeleccion.tsx:67 |
| P-06 | Bajo/Info | Accesibilidad | Sin medición automatizada de contraste (axe) esta sesión | limitación declarada |
| P-07 | Info | Mensajería | Badge de simulador en hilo no verificado en vivo | limitación de tiempo |
| P-08 | Bajo | UX/back office | 403 apilados en vez de pantalla única de "sin acceso" en rutas restringidas por URL directa | v2-31, v2-52 |
| P-09 | Bajo (ya corregido) | Seguridad/API | `POST /bloqueos` cross-tenant devolvía 500 genérico en vez de 403/404; sin fuga de datos; corregido antes de esta sesión (commit `e976d99`) | `docs/auditoria-2/defectos-adversarial.md` |
| P-10 | Bajo | Mensajería/agentes | `mensaje_programado` no tiene worker despachador — sin riesgo hoy, vigilar en próximo lote de mensajería | plantillas.ts:100-140 |

**Conteo por severidad**: Crítico: 0 · Alto: 0 · Medio/Medio-Alto: 2
(P-01, P-02) · Bajo: 5 (P-04, P-05, P-08, P-09, P-10) · Info/limitación
declarada: 2 (P-06, P-07).

**Los 5 hallazgos más relevantes de la sesión, en orden de impacto**:
1. P-02 — sin UI de alertas/ack (observabilidad no operable desde
   producto).
2. P-01 — sin UI de agentes (transparencia de automatización no operable
   desde producto), pese a que el backend de agentes (catálogo de tools,
   cuotas, escalamiento, evals) resultó ser el módulo con la
   implementación de "regla de oro" más rigurosa de todo el repo (§15).
3. P-04 / Q-11 (calidad de código) — `GET /statements` sin `exigirRol`,
   un solo punto de defensa en vez de dos.
4. P-08 — pantallas de "sin acceso" ruidosas en vez de una sola,
   consistente.
5. P-05 — TZ de propiedad no visible sin interactuar con el calendario.

Ningún hallazgo de esta sesión es crítico o alto: el flujo operativo
crítico (§4), la honestidad (§1) y la regla de oro (§2, §15) están, en
esta muestra —incluida una segunda pasada independiente de solo código
sobre 83 REQ, ~40 criterios de ACEPTACION y 45-65 historias de
BACKLOG— sólidamente implementadas y verificadas tanto en vivo como en
código. Única discrepancia real de backlog encontrada: H-012 (nomenclatura
de esquema, sin impacto de seguridad ni funcional). Único hueco de
cumplimiento serio detectado: avisos de privacidad ARCO/LFPDPPP/RGPD
(REQ-150/151) sin ninguna evidencia ni siquiera declarada en código —
consistente con que `docs/REQUISITOS.md` ya los marca como pendientes de
aprobación legal externa.

---

## Calificación por rubro (0–10)

| Rubro | Nota | Justificación |
|---|---|---|
| Honestidad / regla de oro | 9 | Cumplida en las 3 capas verificadas (UI, código, flujo en vivo) y en la segunda pasada de código independiente; matriz de conectividad ejemplar |
| UX del calendario | 8 | Legible, responsive real a 375px, dark mode coherente; penalizado por TZ poco visible y falta de medición de contraste |
| Operación (limpieza/mantenimiento) | 9 | Flujo completo verificado de punta a punta por UI real sin defectos |
| Mensajería | 7 | Textos honestos y control de aprobación correctos por código; no se pudo ejercitar un hilo completo en vivo |
| Finanzas / back office | 7.5 | Aislamiento por rol correcto (RLS), pero con un endpoint sin defensa en profundidad y pantallas de error ruidosas |
| Agentes | 4.5 | Backend con la implementación de regla de oro más rigurosa del repo (catálogo sin tools peligrosas, cuotas, escalamiento, evals — todo con test, §15), pero sin ninguna superficie de producto: no auditable como experiencia de usuario, por lo que no es utilizable hoy por un operador real |
| Observabilidad | 5.5 | `/health`/`/metrics` reales y honestos; sin UI de alertas/ack, gap significativo de producto |
| Fidelidad visual con Atiende | 8 | Patrón de componentes y branding consistentes; sin diff pixel-a-pixel |
| Producto general (REQ/ACEPTACION/BACKLOG) | 8 | 62/83 REQ muestreados implementados, backlog autocrítico y confiable (1 discrepancia cosmética en 45-65 historias); brecha real en privacidad (ARCO/RGPD) y facturación |
| Calidad de código | Ver `calidad-codigo.md` (7.5/10) | — |

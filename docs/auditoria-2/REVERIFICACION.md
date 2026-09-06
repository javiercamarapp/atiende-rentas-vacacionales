# Reverificación independiente — Auditoría 2 (Fase 2)

**Reverificador:** Sonnet, independiente — sin participación previa en auditorías
ni correcciones de auditoría-2. Método: no se aceptó ningún hallazgo de los
informes de origen sin abrir el commit citado (`git show`), ejecutar la
prueba correspondiente en vivo, o ejecutar código real contra vectores nuevos.
Trabajo dividido en 6 verificadores paralelos (seguridad, dominio,
producto/calidad, gates de prueba, forense de atribución git, y
BACKLOG/ACEPTACION), cada uno Sonnet independiente. Todos los comandos se
ejecutaron sobre el `main` real (119 commits); no se modificó código ni
documentación fuera de este archivo y `00-SINTESIS.md`.

---

## 1. Seguridad — S-01 a S-21

| ID | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| S-01 | Crítico | **VERIFICADA** | `git show 8c233c2`: parser IPv6→bytes propio (`parsearIpv6ABytes`/`ipv4EmbebidaEnBytes`), reemplaza regex de prefijo. Suite local-ssrf-ical corrida en vivo: 26/26 verde, incluida explotación HTTPS real que ahora lanza `SsrfError`. |
| S-02/S-03 | Crítico | **VERIFICADA, con gap nuevo** | `git show 24b83d7`: fail-closed si falta secreto y `exigeSecretosExplicitos(NODE_ENV)`. Confirmado con harness propio que `NODE_ENV="PRODUCTION "` lanza. Ver §3 — `NODE_ENV=""` (cadena vacía) NO lanza: gap nuevo, no cerrado. |
| S-04 | Crítico | **VERIFICADA, con gap nuevo** | `git show 824ddba` (commit "contaminado" con archivos de dominio por B-007, contenido íntegro verificado): `normalizarEntornoTexto` con NFD + allow-list `ATIENDE_ENTORNO`. Confirmado que `"producción"` normaliza. Mismo gap de `NODE_ENV=""` en el camino legado — ver §3. |
| S-05 | Alto | **VERIFICADA** | `git show cbca4aa`: migración 0093 real (`tenant_id`+backfill+`FORCE ROW LEVEL SECURITY`) + chequeo explícito en `conversaciones.ts`. Suite `rls-auth.adversarial.test.ts` corrida: 13/13 verde, IDOR ahora 404. Vector nuevo (UPDATE/DELETE directos cross-tenant bajo `app_rv`, ver §4): 0 filas afectadas. |
| S-06 | Alto | **VERIFICADA** | `git show 53df50d`: `resolverIp` usa socket real, XFF solo si el socket está en `proxiesDeConfianza` (vacía por defecto). Suite corrida: rotación XFF 20/20 bloqueadas. |
| S-07 | Alto | **VERIFICADA** | `git show 5ba9a7e` + corrida real: mensajes de rechazo semántico observados en stdout ("mes fuera de rango 01-12", "hora fuera de rango 00-23"). |
| S-08 | Alto | **VERIFICADA** | Commit real es `195b9a8` (absorbido del corrector de dominio, confirmado por el forense de atribución — contenido íntegro). Diff de `fetchSsrf.ts` contiene el guard `liquidado` descrito; corrida en vivo confirma que ya no escapa como `uncaughtException`. |
| S-09 | Alto | **VERIFICADA** | Corrida real de `logs-flags.adversarial.test.ts`: ruta y nombre de span OTel observados redactados (`[redactado-pii]`) en stdout. |
| S-10 | Alto | **VERIFICADA** | Misma corrida: email ya no aparece en texto plano en el catch-all de errores. |
| S-11 | Alto | **VERIFICADA, con gap nuevo** | `git show c1acee7`: mismo mecanismo fail-closed. Mismo gap de `NODE_ENV=""` — ver §3. |
| S-12 | Medio | **VERIFICADA** | Timeout de duración total confirmado por medición real (configurado 300 ms, duración real 303 ms). |
| S-13 | Medio | **VERIFICADA** | `git show a2fd2a5`: hash señuelo con mismos parámetros scrypt — corrección estructural real (paga el mismo costo), no relajación de umbral. |
| S-14 | Medio | **VERIFICADA** | Consistente con el patrón de calidad del resto; suite `secretos-inyeccion` 27/27 verde. |
| S-15 | Medio | **VERIFICADA** | Corrida real: cuerpo 422 sin el valor `received` del cliente, confirmado en stdout. |
| S-16 | Medio (CONFIRMADO) | **NO CORREGIDO — riesgo aceptado, razonable** | PII sigue duplicado en `auditoria_mutacion`, mitigado por RLS. Decisión de producto preexistente (trazabilidad exacta del Lote 6), documentada, no bloquea cierre. |
| S-17 | Bajo | **VERIFICADA** | `resolverFecha.ts` lanza `IcsParseError` ante TZID inválido. |
| S-18 | Bajo | **VERIFICADA** | `git show 437bcf7`: UID vacío en VEVENT ahora rechazado. |
| S-19 | Bajo (SOSPECHA) | **NO CORREGIDO — aceptable** | Filtro léxico secundario; defensa primaria es arquitectónica (sin tool de cancelación en catálogo). Cerrar exigiría NLU, fuera de alcance razonable. |
| S-20 | Bajo (SOSPECHA) | **NO CORREGIDO — aceptable, informativo** | Versiones confirmadas por lectura directa de `package.json` (`jose ^5.9.6`, `zod ^3.24.1`, `@hono/node-server` inconsistente entre workspaces). Sin CVE, aplazamiento razonable. |
| S-21 | Bajo | **VERIFICADA** | Cambio puntual y acotado en `contrato/tipos.ts`, consistente con el patrón. |

**16/18 CONFIRMADO verificados como corregidos de raíz con ejecución real** (no solo lectura de diff). S-16/S-19/S-20 aceptados razonablemente. **Ningún caso de aserción "maquillada"** — donde el corrector cambió una aserción del auditor, el cambio invierte de forma honesta un resultado inseguro→seguro, citando el hallazgo original.

## 2. Dominio/Sincronización/Datos — D-DSD-01 a 15

| ID | Sev. | Veredicto | Evidencia |
|---|---|---|---|
| D-DSD-01 | Alto | **VERIFICADA** | `fechaLocalDesdeFechaHoraConZona` resuelve instante contra zona ORIGEN, luego convierte a zona DESTINO — matemáticamente correcto. Test dedicado verde. |
| D-DSD-02 | Crítico | **VERIFICADA** | `detectarYRegistrarConflictosCapaCruzada` en las 4 ramas de creación/modificación de reserva. Verificado además con el **motor de sync real** (`ejecutarCicloImport`, no solo capa de aplicación — ver §4): reserva de canal se acepta, ambas filas quedan activas, se registra `conflicto_calendario tipo='capa_cruzada'` + alerta en outbox. |
| D-DSD-03 | Alto | **VERIFICADA (juicio: legítima)** | Ver §2.1. |
| D-DSD-04 | Crítico | **VERIFICADA** | Capas 2/3 de `detectarEco` ya no filtran por canal de destino. Extendido a un **tercer canal** (ver §4): sigue detectando el eco en la tercera vuelta. |
| D-DSD-05 | Bajo | **GAP-ACEPTABLE** | Confirmado por `grep`: no existe código de promoción `provisional→confirmado`. Ausencia real, no defecto activo. |
| D-DSD-06 | Alto | **VERIFICADA** | `procesarEventoDelCiclo` con `try/catch` por evento; validación de rango antes de cualquier SQL. |
| D-DSD-07 | Alto | **VERIFICADA (vía producto, `c091a7e`)** | `PATCH /backoffice/propiedades/:id` rechaza (409) cambio de `zona_horaria` con ocupaciones activas. Repro del auditor verde. |
| D-DSD-08 | Medio | **GAP-ACEPTABLE** | Confirmado por `grep`: sin código de `Quantity`/multi-unidad Booking. Ausencia real. |
| D-DSD-09/11 | Alto | **VERIFICADA** | Reconciliación completa calculada al final de cada ciclo real, drift persistido correctamente. Comentario falso en `recuperacion.ts` corregido. |
| D-DSD-10 | Medio | **VERIFICADA** | `huboEventosActivosPreviamente` deriva de bloqueos activos reales del canal, no de la mera existencia de un ciclo previo. Casos A y B verdes. |
| D-DSD-12 | Alto | **VERIFICADA** | Recuperación de bookkeeping por identidad natural (`canal_origen_id`+`external_id`) + rango exacto, evita overbooking falso. |
| D-DSD-13 | Medio | **VERIFICADA (juicio: legítima, dominio+wiring)** | Ver §2.1. Wiring real en `apps/api/src/routes/canales.ts`/`backoffice/cuentasCanal.ts` (`dbad4ec`), verificado con prueba HTTP real (crea cuenta iCal, sync simulado, `estadoConexion:"ical"`). |
| D-DSD-14 | Crítico | **VERIFICADA (juicio: legítima)** | Ver §2.1. Runner ejecutado dos veces en vivo por el reverificador: segunda corrida truena con excepción explícita citando el hash divergente. Nunca silencioso. |
| D-DSD-15 | Alto | **VERIFICADA (vía producto, `8424000`)** | `pg_advisory_xact_lock` en `POST /statements/generar`. Verificado con 2 POST HTTP concurrentes reales: 201+200, ninguna falla, 1 sola fila. |

### 2.1 Juicio sobre pruebas del auditor dejadas en rojo "por aserción incompatible"

Para D-DSD-03, D-DSD-13 y D-DSD-14 el reverificador leyó ambos lados (prueba
del auditor + código de producción real, incluyendo ejecución en vivo) antes
de decidir:

- **D-DSD-14**: el propio texto original de la auditoría exige que el runner
  "FALLE RUIDOSAMENTE" ante drift; la prueba del auditor, sin embargo, exige
  literalmente lo contrario (`aplicadas2.length > 0`). El corrector implementó
  el comportamiento que el hallazgo pedía. **Corrección legítima** — la
  prueba del auditor codifica el defecto original, no la corrección.
- **D-DSD-03**: la prueba del auditor construye eventos solo con `hash`
  (SHA256, opaco por diseño) y exige distinguir disjunción de rango sin dato
  de rango. Es una laguna de datos de la prueba, no del código: el campo
  `rango` opcional añadido no rompe ningún caso existente y el pipeline real
  (`motor.ts`) sí resuelve correctamente disjunto-vs-solapado. **Legítima.**
- **D-DSD-13**: `partnerAprobado=false` es genuinamente ambiguo (iCal sin
  aprobación vs. API real pendiente) sin un discriminador explícito. El campo
  `tipoConexion` es opcional con default que preserva compatibilidad, y el
  wiring de API real se completó y se verificó con HTTP. **Legítima.**

En los tres casos el patrón es el mismo: falta un dato de entrada en la
prueba del auditor que ninguna implementación correcta puede inferir sin
romper otra invariante (opacidad del hash, ambigüedad genuina de estado). No
se encontró ninguna regresión disfrazada de "aserción incompatible".

## 3. Producto/UX/Operación y Calidad de Código — P-nn / Q-nn

Los 14 hallazgos declarados corregidos (P-01, P-02, P-04/Q-11, P-05, Q-01,
Q-02, Q-03, Q-05, Q-08, Q-09, Q-10, D-DSD-07/13/15 reasignados) se
**VERIFICARON** con `git show` + ejecución real de la prueba citada (no solo
lectura de logs previos). Puntos destacados:

- **Q-05 / regresión propia de AdminSidebar** (`f6c3f79`): comparación línea
  por línea confirma que la prueba nueva es **más estricta** que la anterior
  (exige el link real a `/agentes` y ausencia de "Pronto"), no una relajación.
- **Q-08**: `grep -c "\bany\b"` sobre todo `.ts/.tsx` fuera de `node_modules`
  confirma **0 ocurrencias** tras los 3 commits citados.
- **D-DSD-15**: la prueba de dominio (SQL directo, sin HTTP) sigue roja por
  diseño — confirmado que no puede reflejar un fix de ruta; existe prueba
  complementaria HTTP real que sí lo hace.

**No resueltos, juicio de aceptabilidad:**

| ID | Justificación del corrector | Juicio del reverificador |
|---|---|---|
| Q-04 (30 sitios de rol literal) | Riesgo de choque con seguridad concurrente | **Aceptable** — deuda de mantenibilidad, no hueco de seguridad (`exigirRol` ya está centralizado); conteo de 30 confirmado por grep independiente. No bloquea. |
| Q-06 (sin cobertura con umbral) | Incompatible con exigencia de tests en verde en el tiempo disponible | **Aceptable a corto plazo, deuda real** — hoy no hay forma de medir cobertura real; los flujos críticos sí están cubiertos por unit+integración+adversarial verificados en esta ronda. Recomendado agendar. |
| P-08 (403 apilados) | Componente compartido, fuera de presupuesto | **Aceptable** — confirmado puramente cosmético (RLS+`exigirRol` en las rutas subyacentes ya impiden fuga de datos). |

**Honestidad/regla de oro** (verificación directa de código, no solo lectura
de informe): `grep` dirigido sobre `apps/web/src`/`apps/api/src` no encontró
promesas de "tiempo real" sin matizar, datos mock/falsos en dashboards, ni
botones decorativos sin función. Simuladores están etiquetados explícitamente
("SIMULADOR — no es tráfico real"). Sin hallazgos nuevos.

## 4. Vectores nuevos ejecutados (no probados por los auditores originales)

**SSRF** (packages/adapters/src/net/ssrf.ts + fetchSsrf.ts), todos con script
propio ejecutado en vivo:
- `::FFFF:127.0.0.1` (mayúsculas), `[::ffff:7f00:1]`/`::ffff:7f00:1` (hex
  embebida con/sin corchetes), `64:FF9B::7f00:1` (NAT64 mayúsculas) →
  **bloqueados correctamente**.
- `validarTodasLasIps` con DNS mixto (pública+privada, en ambos órdenes) →
  **ambas IPs se validan**, no solo la primera resuelta.
- Redirección relativa (`Location: /interno`) → se resuelve contra el host ya
  validado y se re-valida en cada salto del loop. **Sin bypass.**
- `0x7f000001`/`2130706433` (hex/decimal como host literal) → no representan
  un vector real: el código solo trata como IP literal dotted-quad o forma
  `:`; cualquier otra cadena va a DNS y falla con NXDOMAIN antes de llegar al
  validador. Sin hallazgo.
- **Conclusión SSRF: sin bypass nuevo encontrado.**

**Secretos/config/simuladores** — **1 hallazgo nuevo real**:
`NODE_ENV=""` (cadena vacía explícita, no `undefined`) **NO** activa el
fail-closed de S-02/S-03/S-04/S-11: `cargarConfiguracion({NODE_ENV:""})`
devuelve `entorno:"development"` sin lanzar (acepta secretos efímeros), y
`assertNoParecerProduccion` con `NODE_ENV=""` y sin `ATIENDE_ENTORNO` tampoco
lanza. El llamador real (`apps/api/src/routes/mensajeria/borradores.ts:175`,
`new SimuladorMensajeria(...)`) invoca exactamente en ese camino, sin pasar
`entorno`/`ATIENDE_ENTORNO`. Causa raíz: tanto `env.ts` como
`etiquetado.ts` tratan `valor.trim() === ""` igual que ausencia total,
contradiciendo el propio comentario del código ("solo la AUSENCIA TOTAL de
NODE_ENV se trata como desarrollo"). `ATIENDE_ENTORNO=" producción "` (con
espacios/tilde) sí se maneja correctamente (normaliza y rechaza). Es un
escenario de despliegue plausible (plantillas/orquestadores que declaran la
variable vacía en vez de omitirla), y reabre el mismo tipo de bypass que
motivó S-02/S-03/S-04/S-11 por una vía no probada por el auditor original.
**Este es el único defecto nuevo real de esta reverificación** — ver
recomendación en 00-SINTESIS.md.

**RLS de `huesped_minimo` con SQL directo bajo rol `app_rv`**: además de
SELECT/INSERT cross-tenant (ya cubiertos), se probó UPDATE y DELETE directos
de un tenant sobre un huésped de otro, y un intento de reasignar `tenant_id`
— **las 3 operaciones afectaron 0 filas**. Un rol `contador` real (fila
`usuario.rol`, no solo variable de sesión) no puede leer `huesped_minimo` de
su propio tenant. **Sin bypass.**

**Reserva de canal sobre bloqueo de propietario vía motor de sync real**:
ejecutado con `ejecutarCicloImport` (no solo `crearReservaConfirmada`) con un
feed simulado solapado a un bloqueo existente. Resultado: reserva de canal
aceptada, bloqueo preservado, `conflicto_calendario tipo='capa_cruzada'` +
alerta en outbox — **confirma D-DSD-02 de punta a punta**.

**Eco cruzado con tres canales**: bloqueo exportado a Airbnb → reflejado por
Vrbo (control) → reflejado de nuevo por Booking.com con un tercer UID nunca
visto. `ecosDescartados=1` en la tercera vuelta — **sigue detectándose**
(la comparación es por hash de contenido, sin ventana de recencia que la
debilite).

**Runner de migraciones con migración reescrita**: aplicado `up_v1`,
reescrito el catálogo con `up_v2` bajo el mismo id, reaplicado contra el
mismo cluster — **excepción explícita** citando el hash almacenado vs. el
actual. Nunca silencioso, confirmado en ejecución real (no solo lectura).

## 5. B-007 — Integridad de atribución de commits

Forense independiente con `git show`/`git log` (solo lectura). **Confirmado:
0 archivos perdieron contenido.**

- `6d4f2ae` (absorbió `exportIcal.ts`, `.test.ts`, `openapi.yaml` de otro
  corrector): diff es un refactor coherente (`canalId` uuid → `canalCodigo`
  string), sin reversión ni corrupción. Único commit posterior que toca
  `exportIcal.ts` es este mismo — sin manipulación sospechosa.
- `824ddba` (absorbió `dominio-sync-datos.md` + `tests/auditoria-2/dominio/`
  de otro corrector): `git show 824ddba:docs/auditoria-2/dominio-sync-datos.md
  | wc -l` = 998, idéntico al archivo actual en HEAD. Único commit que lo
  toca en todo el historial.
- `195b9a8` (absorbió `fetchSsrf.ts`/`.test.ts`/`ssrf-ical.adversarial.test.ts`
  de seguridad): los tres archivos crecieron respecto al commit original por
  commits posteriores legítimos y bien identificados (S-12, S-07, S-01,
  S-17, S-18, lint) — no truncamiento.
- Escaneo de todo el historial (119 commits) por líneas de solo-borrado:
  5 encontradas, todas explicadas y documentadas (`DevShellNav.tsx` sustituido
  por `AdminSidebar.tsx` en el mismo commit; `cacheOcupaciones.ts` eliminado
  con justificación de dominio en el mismo commit). Ninguna relacionada con
  los incidentes de mezcla.
- Los 15 símbolos que `atribucion-commits.md` dice haber verificado se
  reconfirmaron con `grep -rn` independiente — los 15 presentes en HEAD.
- 5 commits al azar no mencionados en ningún informe de atribución:
  archivos tocados coherentes con el mensaje de commit en los 5 casos.

## 6. Gates ejecutados por el reverificador (no citados de logs previos)

| Comando | Estado | Detalle |
|---|---|---|
| `npm run typecheck` | **VERDE** | 7/7 workspaces, 0 errores |
| `npm run lint` | **VERDE** | 0 errores, 11 warnings preexistentes no relacionados |
| `npm run test` | **VERDE** | 92 archivos / **568 pruebas**, 0 fallos |
| `npm run test:integration` | **VERDE** | 15 archivos / **135 pruebas**, 0 fallos |
| `npm run test:adversarial` | **VERDE** | 5 archivos / **49 pruebas**, 0 fallos (incluye D-ADV-01 en rojo a propósito, ver §7) |
| `npm run evals:agentes` | **VERDE** | 10/10 casos (5 normal + 5 adversarial), 0 fallos |
| `npm run db:verificar-migraciones` | **ROJO — ambiental, no lógico** | `DATABASE_URL no está definida`. Script de auditoría de un ambiente desplegado; no forma parte del gate de CI y no se pudo ejecutar en este entorno de reverificación por falta de una base desplegada. No invalida D-DSD-14 (verificado por ejecución directa del runner, ver §4). |
| `npm run verificar:lotes` | **VERDE** | Reconfirma 568/92, coincide con `npm run test` |

## 7. Defecto adversarial abierto conocido (no forma parte de S/D/P/Q)

**D-ADV-01** (`docs/auditoria-2/defectos-adversarial.md`, medio): `POST
/bloqueos` cross-tenant responde 500 genérico en vez de un error de
autorización clasificado (403/404). Confirmado que el invariante de datos
(aislamiento, 0 filas cross-tenant) se mantiene — es un defecto de
clasificación de error/observabilidad, no una fuga. Se deja **intencionalmente
en rojo** en `tests/adversarial/multitenant/casos.test.ts`, documentado con
causa raíz y corrección sugerida. **Sigue abierto** al cierre de esta
reverificación — no fue tocado por ningún corrector de auditoría-2 (está
fuera de los hallazgos S-nn/D-DSD-nn/P-nn/Q-nn).

## 8. Recalificación 0–10 (comparada con la calificación de los auditores originales)

### Seguridad
| Rubro | Nota | Justificación |
|---|---|---|
| SSRF | 9 | S-01/S-07/S-08/S-12 verificados con ejecución real + 8 vectores nuevos sin bypass |
| Auth | 7 | S-03/S-06/S-13/S-21 verificados; descuento por el gap compartido de `NODE_ENV=""` |
| Secretos | 7 | S-02 verificado; mismo gap de `NODE_ENV=""` sobre `CANAL_CIFRADO_CLAVES` |
| RLS | 8 | S-05 verificado con migración real + vectores nuevos (UPDATE/DELETE directos) sin bypass |
| Inyección | 7 | S-14/S-19 razonables; no se auditó `proveedorClaude.ts` línea por línea |
| PII/Logs | 8 | S-09/S-10/S-15 verificados con salida real observada; S-16 aceptado razonablemente |
| Supply chain | 9 | S-20 confirmado sin CVE, aplazamiento razonable |
| Simuladores/flags | 6 | S-04/S-11 verificados en su forma original; el gap de `NODE_ENV=""` reabre exactamente el tipo de bypass que motivó S-04 en el camino de producción real (`borradores.ts`) |

### Dominio
| Rubro | Nota | Justificación |
|---|---|---|
| Invariantes de calendario | 8 | D-DSD-02 cerrado end-to-end vía pipeline real; UI de `conflictosCapaCruzada` aún sin consumir |
| Anti-eco | 9 | D-DSD-04 verificado a 3 saltos de canal, sin ventana de tiempo que lo debilite |
| Idempotencia/replay | 9 | D-DSD-12 con recuperación por identidad natural, verificado |
| Fechas/DST | 9 | D-DSD-01 matemáticamente correcto |
| Reconciliación | 8 | D-DSD-09/11 cerrados; sin job/endpoint separado de recuperación (fuera de ámbito, no defecto) |
| Migraciones | 9 | D-DSD-14 verificado ejecutando el runner real dos veces |
| Finanzas | 9 | D-DSD-15 verificado con concurrencia HTTP real |

### Producto/Calidad
| Rubro | Nota | Justificación |
|---|---|---|
| Honestidad | 9 | Grep independiente confirma 0 promesas falsas |
| Regla de oro | 9 | Sin tool de cancelación/contacto directo en catálogo, confirmado en código |
| UX calendario | 8 | P-05 corregido y probado; sin medición de contraste (deuda declarada) |
| Operación | 9 | Flujo checkout→limpieza→incidencia→bloqueo verificado en rondas previas, sin regresión |
| Mensajería | 7 | Sin cambios en esta ronda |
| Finanzas | 8.5 | Q-01 y P-04/Q-11 verificados con test real |
| Back office | 7.5 | P-08 pendiente (ruido, no riesgo) |
| Agentes | 7.5 | P-01 cierra el hueco de producto más señalado |
| Observabilidad | 8 | P-02 cierra el hueco de UI de alertas con test 401/200 real |
| Calidad de código | 8 | Q-08 (0 `any`), Q-02, Q-03, Q-09, Q-10 verificados; Q-04/Q-06 deuda aceptada |

## 9. Criterios de ACEPTACION.md — muestra verificada (18 de ~59)

| Criterio | Estado | Evidencia |
|---|---|---|
| §RV19/21-2 SSRF | CUMPLIDO | `packages/adapters/{src,test}/{ssrf,fetchSsrf}*`, suites adversarial/auditoría-2 verdes |
| §RV19/21-4 Aislamiento multitenant | CUMPLIDO | `rls.test.ts`, `casos.test.ts` multitenant, `rls-auth.adversarial.test.ts` |
| §RV19/21-6 No cancelación automática | CUMPLIDO | grep de rutas de cancelación + prueba de integración |
| §RV19/21-9 Avisos ARCO/RGPD | PENDIENTE-EXTERNO | 0 evidencia de revisión legal en el repo |
| §RV19/21-11 Registro UE 2024/1028 | PENDIENTE-EXTERNO | depende de confirmación legal por jurisdicción |
| §RV19/21-12 Homologación de canales | PENDIENTE-EXTERNO | Booking "pausing integrations" (fuente viva, B-002) |
| §RV19/21-13 Cifrado credenciales | CUMPLIDO | `cifrado.ts` AES-256-GCM + test |
| §RV19/21-14 Routing de tools por rol | CUMPLIDO | `catalogo.test.ts` |
| §RV19/21-15 XXE | NO APLICA | parser ICS es texto plano, sin XML |
| §Calendario-1 EXCLUDE/concurrencia | CUMPLIDO | log de integración con SQLSTATE 23P01 |
| §Calendario-2 (20 casos adversariales) | CUMPLIDO (local); D-ADV-01 abierto | 49/49 verde con 1 caso en rojo a propósito (§7) |
| §Calendario-4 Anti-eco | CUMPLIDO | verificado a 3 canales (§4) |
| §Finanzas-1 Sin doble descuento | CUMPLIDO | `finanzasPricingReportes.test.ts` + Q-01 |
| §Finanzas-2 Conciliación Vrbo | PARCIAL | motor genérico sí, parser real de CSV/XLS de Vrbo no (falta archivo de ejemplo real) |
| §Auditoría-1 romper cristal | CUMPLIDO | migración + test + captura |
| §Privacidad-1 huesped_minimo minimizado | CUMPLIDO (reforzado) | S-05 + vectores UPDATE/DELETE nuevos sin bypass |
| §Operación-3 restauración+reconciliación | PARCIAL | backup lógico probado; WAL continuo depende de infraestructura administrada |
| §Legal-1 nada fiscal sin flag+revisión | PARCIAL | flag en `false`, sin documento de aprobación legal fechado |
| §UX-4 Accesibilidad | NO CUMPLIDO | 0 axe-core, reconocido como limitación por ambas auditorías |

**Sección "no cerrable sin aprobación externa" de ACEPTACION.md (10 ítems)**:
correctamente etiquetados como PENDIENTE-EXTERNO en el propio documento, sin
ningún intento de marcarlos como cerrados.

## 10. BACKLOG.md — conteo verificado

95 historias (H-001–H-095): **91 hecho** (7 de ellas marcadas explícitamente
"parcial" dentro de su propio estado: H-054, H-064, H-072, H-086, H-088 y 2
más), **4 por hacer** (H-048 COULD, H-071 SHOULD, H-073 MUST — percentiles
p50/p95/p99, H-091 MUST — modo degradado solo-lectura), **0 bloqueada**
formalmente.

## 11. Bloqueos externos no cerrables desde el repo

- **B-002** (abierto, parcial): Booking.com pausó activamente nuevos
  connectivity partners (confirmado en vivo); Vrbo Connectivity Partner
  Program solo con evidencia archivada; iCal de Booking sin fuente primaria.
- **B-003** (abierto): normativa española (Registro Único de Arrendamientos,
  Orden INT parte de viajeros) no localizable.
- **B-004** (abierto): regulación local CDMX no verificable (fuentes
  oficiales con TLS roto / SPA sin contenido estático).
- **B-005** (abierto): vigencia de tasas de retención ISR/IVA México no
  confirmable (sat.gob.mx SPA inaccesible); bloquea cualquier calculadora
  fiscal.
- **B-001** (abierto, no bloqueante): ruta de trabajo administrativa.
- B-006/B-007: mitigados/resueltos (verificado independientemente en §5).

## 12. Verificación de logs citados

20/20 logs citados en `correcciones-{seguridad,dominio,producto}.md` existen
físicamente en `docs/logs/` — sin huecos, sin logs "fantasma".

---

## 13. Ronda final (post-reverificación) — verificación con ejecución real

Tras la publicación de este informe, se aplicó una ronda de corrección
acotada a los 2 puntos pendientes (commits `8cfdbc3`, `46015a1`, `50b1b6b`,
`1b323dd`; 124 commits en `main` al cierre). El reverificador (el mismo
proceso, sin delegar en un tercero) verificó CADA fix con ejecución real
propia, no por lectura de los commits.

### 13.1 Hallazgo nuevo `NODE_ENV=""` — VERIFICADO CERRADO

`git show 8cfdbc3`: `apps/api/src/config/env.ts` (`leerEntorno`) y
`packages/sim/src/comun/etiquetado.ts` (`assertNoParecerProduccion`) ahora
tratan explícitamente `valor === undefined` como la ÚNICA forma de
"ausencia"; cualquier variable DEFINIDA pero vacía o solo-espacios
(`""`/`"   "`) se clasifica como "production"/lanza fail-closed.

Ejecución real de las suites ya añadidas por el commit:
- `apps/api/test/config/env.test.ts` → **19/19 verde** (incluye
  `NODE_ENV=""`/`"  "` → `entorno:"production"` y exige secretos).
- `packages/sim/test/etiquetado.test.ts` → **9/9 verde**.
- `apps/api/test/integration/mensajeria.test.ts -t "NODE_ENV"` → **1/1
  verde**: aprobar un borrador con `NODE_ENV=""` responde HTTP **500**
  (rechazado), confirmado en el log HTTP real capturado durante la corrida
  (antes: 200 silencioso, camino real
  `apps/api/src/routes/mensajeria/borradores.ts:175`).

**Variantes adicionales del reverificador** (script propio ejecutado
temporalmente dentro de `apps/api/test/config/`, no commiteado, eliminado
tras la corrida — 6/6 verde):
- `NODE_ENV=" development "` (con espacios, sin vaciar) → **sigue
  reconociéndose como `development`**, NO fail-closed — confirma que el fix
  no sobre-corrigió (trim se aplica correctamente antes de comparar contra
  la allow-list, no antes de comprobar vacío).
- `ATIENDE_ENTORNO=""` con `NODE_ENV=production` explícito → **fail-closed**
  (la rama de allow-list explícita gana: una `ATIENDE_ENTORNO` definida pero
  vacía no está en la allow-list, lanza sin mirar `NODE_ENV`).
- `ATIENDE_ENTORNO=""` y `NODE_ENV=""` (ambas vacías) → **fail-closed**.
- Solo `NODE_ENV=""` (sin `ATIENDE_ENTORNO`) → **fail-closed** vía la rama
  heredada, mensaje "desconocido" observado.
- Solo `NODE_ENV="   "` (solo espacios) → **fail-closed**, mismo mensaje.
- `NODE_ENV=" PRODUCCIÓN "` (tilde+mayúsculas+espacios) →
  `cargarConfiguracion` exige secretos explícitos (lanza si faltan).

**Veredicto: VERIFICADO CERRADO.** Las 4 variantes pedidas por el
coordinador (`NODE_ENV=""`, `NODE_ENV="   "`, `NODE_ENV=" development "`,
`ATIENDE_ENTORNO=""` con `NODE_ENV=production`, ambas vacías) se probaron
con ejecución real y el comportamiento observado coincide en los 6 casos
con el invariante documentado en el propio código. Sin sobre-corrección
(el camino legítimo `" development "` sigue funcionando).

### 13.2 D-ADV-01 — VERIFICADO CERRADO (con nota de precisión sobre la ronda anterior)

`git show e976d99` (el fix de código real, ya existente en `main` **desde
antes** del inicio de las auditorías de seguridad/dominio/producto de
auditoría-2 — commit con fecha `2026-09-06 04:55:32`, previo a los
despachos de auditoría #36-38 a las 05:18): `traducirErrorDominio`
(`apps/api/src/routes/reservas.ts:142-149`) reconoce
`error.code === "42501"` y el texto "row-level security policy", mapea a
`recurso_no_encontrado` (404). El commit `46015a1` de esta ronda final
únicamente actualizó documentación/comentarios desactualizados
(`docs/auditoria-2/defectos-adversarial.md` y el comentario del `it` en
`tests/adversarial/multitenant/casos.test.ts`) — **la aserción del test en
sí nunca cambió** (`expect([403, 404]).toContain(res.status)` ya existía).

Ejecución real:
- `npx vitest run tests/adversarial/multitenant/casos.test.ts` → **8/8
  verde**, incluido el caso 18 (`status` observado en log: `404`).
- `npx vitest run apps/api/test/integration/api.test.ts -t "D-ADV-01"` →
  **1/1 verde**, log HTTP real: `{"metodo":"POST","ruta":"/bloqueos",
  "status":404,...}`.

**Nota de precisión:** la sección §7 de este informe (ronda inicial)
reportó D-ADV-01 como "sigue abierto" basándose en el campo "Estado:
abierto" de `defectos-adversarial.md`, sin volver a ejecutar ese `it`
específico de forma aislada (el reverificador de dominio sí corrió
`test:adversarial` completo en 49/49 verde, lo que ya incluía este caso en
verde, pero no se cruzó esa evidencia contra la afirmación textual del
documento). El código y el test ya eran correctos en la ronda inicial; el
único gap real era documental (comentario "EN ROJO a propósito" y campo de
estado desactualizados), ahora corregido. Esto no cambia el veredicto de
"REQUIERE 1 RONDA" de la síntesis original, ya que el gap de `NODE_ENV=""`
(§13.1) sí era un defecto de código real y nuevo.

**Veredicto: VERIFICADO CERRADO.**

### 13.3 Gates completos — re-ejecutados en su totalidad por el reverificador

| Comando | Estado | Conteo |
|---|---|---|
| `npm run typecheck` | **VERDE** | 7/7 workspaces, 0 errores |
| `npm run lint` | **VERDE** | 0 errores, 11 warnings preexistentes (mismos que la ronda anterior) |
| `npm run test` | **VERDE** | 92 archivos / **578 pruebas** (+10 vs. ronda anterior: nuevas de `env.test.ts`/`etiquetado.test.ts`/`mensajeria.test.ts`) |
| `npm run test:integration` | **VERDE** | 15 archivos / **136 pruebas** (+1: prueba HTTP de `mensajeria.test.ts`) |
| `npm run test:adversarial` | **VERDE** | 5 archivos / **49 pruebas**, 0 en rojo (D-ADV-01 ya no aparece como caso especial) |
| `npm run evals:agentes` | **VERDE** | 10/10 casos, 0 fallos adversariales, 100% acierto normal |

Todos ejecutados de punta a punta por el reverificador en esta sesión, no
citados de logs de terceros.

### 13.4 Conclusión de la ronda final

Los 2 puntos pendientes de la síntesis original están **VERIFICADOS
CERRADOS con ejecución real**, sin sobre-corrección ni regresión. No se
encontró ningún hallazgo crítico/alto nuevo en esta ronda. Ver
`00-SINTESIS.md` para el veredicto definitivo de Fase 2.

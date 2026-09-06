# Auditoría adversarial de seguridad — Fase 2

Auditor independiente (no autor del código). Metodología: lectura del código real de
`apps/api`, `packages/db` (migraciones + RLS), `packages/adapters` (fetcher/parser
iCal), `packages/domain` (agentes/mensajería), `packages/sim` y `apps/web`, seguida
de **reproducción ejecutable** de cada hallazgo contra `embedded-postgres`/la API
real o contra las funciones puras auditadas (vitest). Un hallazgo sin reproducción
y sin cita exacta de archivo:línea se marca **SOSPECHA**, no CONFIRMADO.

Todas las pruebas de reproducción se dejaron en `tests/auditoria-2/seguridad/`
(no se modificó `tests/adversarial/` ni código de producto en `apps/`/`packages/`):

- `ssrf-ical.adversarial.test.ts` + `vitest.config.local-ssrf-ical.ts` (25 tests)
- `rls-auth.adversarial.test.ts` + `vitest.config.rls-auth.ts` (11 tests)
- `secretos-inyeccion.adversarial.test.ts` + `vitest.config.secretos-inyeccion.ts` (26 tests)
- `xss-mensajeria.adversarial.test.tsx` + `vitest.config.xss-mensajeria.ts` (3 tests)
- `logs-flags.adversarial.test.ts` + `vitest.config.logs-flags.ts` (16 tests)

Comando genérico de reproducción de cada suite: `npx vitest run --config
tests/auditoria-2/seguridad/vitest.config.<suite>.ts`. Todas las 81 pruebas nuevas
pasan en verde porque documentan el comportamiento observado con `expect()`
(algunas confirman una vulnerabilidad real vía el valor devuelto/observado, no vía
un `test` que falle) — la evidencia textual de cada corrida se cita en cada
hallazgo.

Dos de los hallazgos críticos (S-01, S-02/S-03) se verificaron además por lectura
directa del código fuente por este auditor, independientemente de la corrida del
subagente que los reportó primero.

## Tabla de hallazgos

| ID | Severidad | Archivo:línea | Resumen | Estado |
|----|-----------|----------------|---------|--------|
| S-01 | Crítico | `packages/adapters/src/net/ssrf.ts:59-71` | Bypass total del deny-list SSRF vía IPv4 mapeada en IPv6 (`::ffff:127.0.0.1`, `::ffff:169.254.169.254`, `::ffff:10.0.0.1`) | CONFIRMADO |
| S-02 | Crítico | `apps/api/src/config/env.ts:44-45` | Clave de cifrado de credenciales de canal (AES-256-GCM) cae a un valor hardcodeado en el repo si falta `CANAL_CIFRADO_CLAVES`, sin guardarraíl de arranque en producción | CONFIRMADO |
| S-03 | Crítico | `apps/api/src/config/env.ts:27,37` | `JWT_SECRET` cae a un valor hardcodeado en el repo (`JWT_SECRET_DESARROLLO`) sin guardarraíl de arranque en producción — permite forjar tokens `superadmin` | CONFIRMADO |
| S-04 | Crítico | `packages/sim/src/comun/etiquetado.ts:30-36` | `assertNoParecerProduccion` (control D-019) no reconoce `NODE_ENV="producción"` (con tilde) ni variantes con diacríticos — los simuladores de canal se arrancan sin error creyendo estar en producción | CONFIRMADO |
| S-05 | Alto | `packages/db/src/migrations/0005_ocupacion_unidad.ts:20-25`; `apps/api/src/routes/mensajeria/conversaciones.ts:63-70` | Tabla `huesped_minimo` (PII) sin `tenant_id` ni RLS; `POST /mensajeria/conversaciones` no valida que `huespedMinimoId` pertenezca al tenant del llamante (IDOR cross-tenant) | CONFIRMADO |
| S-06 | Alto | `apps/api/src/seguridad/rateLimit.ts:21-25` | Rate limiting de `/auth/login` se evade rotando la cabecera `X-Forwarded-For` (controlada por el cliente, sin allowlist de proxy) | CONFIRMADO |
| S-07 | Alto | `packages/adapters/src/ical/parser.ts:124-147`; `packages/adapters/src/ical/resolverFecha.ts:18-19` | `DTSTART`/`DTEND` solo se validan por forma de dígitos, no por rango semántico (mes 99, hora 99 aceptados) y se propagan sin error | CONFIRMADO |
| S-08 | Alto | `packages/adapters/src/net/fetchSsrf.ts:141-148` | El límite de `maxBytes` no se aplica de forma fiable si el cuerpo llega en una sola ráfaga TCP: evasión silenciosa del límite + `uncaughtException` de proceso (DoS) | CONFIRMADO |
| S-09 | Alto | `apps/api/src/middleware/logger.ts:14-31`; `apps/api/src/workers/observabilidad/middlewareHttp.ts:18` | El logger principal de cada request y el campo `nombre` del span OTel nunca pasan por `sanitizarAtributos` — PII (email/teléfono) en la ruta llega en texto plano a logs/trazas | CONFIRMADO |
| S-10 | Alto | `apps/api/src/app.ts:96` | El manejador catch-all loguea `err.message` completo sin sanear; errores nativos de Postgres (`invalid_text_representation`) incluyen el valor recibido (potencial PII) en texto plano en logs | CONFIRMADO |
| S-11 | Alto | `apps/api/src/config/env.ts:21-24`; `apps/api/src/routes/backoffice/cuentasCanal.ts:99-100` | `leerEntorno` compara `NODE_ENV` de forma exacta y sensible a mayúsculas/tildes; con `"PRODUCTION"` o `"producción"` cae a `"development"`, desactivando el guard que impide crear cuentas de canal tipo simulador en producción | CONFIRMADO |
| S-12 | Medio | `packages/adapters/src/net/fetchSsrf.ts:25,136` | El "timeout total" documentado es en realidad un timeout de inactividad de socket (`http.request({ timeout })`) — un goteo lento evade el presupuesto de tiempo pretendido (DoS de conexión larga) | CONFIRMADO |
| S-13 | Medio | `apps/api/src/routes/auth.ts:75-81` | Canal lateral de tiempo en `/auth/login`: usuario inexistente responde ~10x más rápido que password incorrecta (permite enumeración de usuarios por timing) | CONFIRMADO |
| S-14 | Medio | `apps/api/src/agentes/proveedorClaude.ts:74-76` | Texto del huésped se interpola sin escapar en delimitadores XML ad-hoc del prompt hacia Claude — permite cerrar prematuramente `</mensaje_huesped_no_confiable>` e inyectar texto fuera del bloque "no confiable" (adaptador real inactivo por defecto, sin `ANTHROPIC_API_KEY` en el repo) | CONFIRMADO |
| S-15 | Medio | `apps/api/src/app.ts:75-79` (comentario) vs. comportamiento real de Zod v3 | El manejador de `ZodError` documenta explícitamente "no ecoar el valor recibido", pero los errores de `z.enum()` sí incluyen `received` (el valor enviado por el propio cliente) en el mensaje 422 | CONFIRMADO |
| S-16 | Medio | `packages/db/src/migrations/0044_mensajeria_auditoria.ts` (`fn_auditoria_mensaje`) | La auditoría de `mensaje`/`borrador_mensaje` copia `to_jsonb(NEW/OLD)` completo (texto del huésped) sin excluir columnas, a diferencia de `fn_auditoria_directa` (0013) que sí excluye PII; mitigado por RLS de lectura pero no cifrado/redactado | CONFIRMADO (por diseño) |
| S-17 | Bajo | `packages/adapters/src/ical/resolverFecha.ts:23` → `packages/domain/src/fechas.ts:39-41` | TZID inválido lanza `Error` genérico, no `IcsParseError` — inconsistencia de contrato de errores entre el parser y el resolvedor de fechas | CONFIRMADO (gap de contrato) |
| S-18 | Bajo | `packages/adapters/src/ical/parser.ts:211,252` | `UID` vacío (tras `trim()`) se acepta sin validar; combinado con "última ocurrencia gana" permite colisión trivial entre eventos con `UID:` vacío | SOSPECHA |
| S-19 | Bajo | `packages/domain/src/agentes/escalamiento.ts` (`PATRON_CONFIRMACION_NO_VERIFICADA`) | Filtro de contenido por regex (defensa secundaria) es evadible parafraseando ("anulada"/"revertido" en vez de "confirmado"/"cancelación") | SOSPECHA |
| S-20 | Bajo | `package.json` (raíz y workspaces) | Dependencias directas de superficie crítica un major detrás (`jose` 5.x→6.x, `zod` 3.x→4.x, `react` 18.x→19.x) y versión de `@hono/node-server` inconsistente entre `apps/api` (^1.13.7) y `apps/web` (^1.19.17); sin CVE conocido | SOSPECHA (informativo) |
| S-21 | Bajo | `apps/api/src/routes/backoffice/romperCristal.ts` (ruta POST) | "Romper cristal" con motivo de solo espacios es rechazado por el `CHECK` de BD (no se crea la concesión), pero el error se clasifica como `500 error_interno` en vez de `422` de validación | CONFIRMADO (defecto de clasificación, no bypass) |

Total: **4 crítico, 7 alto, 6 medio, 4 bajo** (21 hallazgos), de los cuales 18 CONFIRMADO y 3 SOSPECHA.

## Detalle de hallazgos críticos y altos

### S-01 — Bypass SSRF vía IPv4 mapeada en IPv6 (CRÍTICO, CONFIRMADO)

`normalizarIpv6` (`packages/adapters/src/net/ssrf.ts:59-61`) solo pela el prefijo
literal `"::ffff:"`; el resultado se compara **exclusivamente** contra patrones
IPv6 (`::1`, `fe80::/10`, `fc00::/7`, `ff00::/8`) y nunca vuelve a pasar por
`RANGOS_BLOQUEADOS_IPV4` (línea 81-94, rama `esIpv4`). Verificado por lectura
directa: `validarIpPermitida("::ffff:127.0.0.1")` → `{"permitida":true}`, igual
para `::ffff:169.254.169.254` y `::ffff:10.0.0.1`.

Reproducción real (`tests/auditoria-2/seguridad/ssrf-ical.adversarial.test.ts`):
`fetchIcsSeguro({ url: "https://feed-publico.example:<puerto>/x.ics",
resolverPersonalizado: () => ["::ffff:127.0.0.1"] })` contra un servidor HTTPS
real en loopback devuelve `{"status":200,"cuerpo":"CONTENIDO-INTERNO-SECRETO-..."}`
— sin usar el escape hatch de `permitirHttpSimuladorLocal`, con un hostname
externo arbitrario.

**Explotabilidad real:** un atacante que controla el DNS del hostname del feed
(cualquier feed iCal de un canal que el usuario configure) puede publicar un
registro `AAAA` con la forma IPv4-mapeada-en-IPv6 y alcanzar loopback, RFC1918 y
el endpoint de metadata cloud (169.254.169.254 → credenciales de instancia en
AWS/GCP/Azure) desde el sincronizador. Es una técnica de bypass de SSRF conocida y
documentada (OWASP), no teórica.

**Corrección:** en `normalizarIpv6`, si tras pelar `::ffff:` el resto matchea una
IPv4 (`net.isIPv4`), delegar recursivamente a la validación IPv4 completa en vez
de seguir comparando contra patrones IPv6.

### S-02 / S-03 — Secretos por defecto sin guardarraíl de producción (CRÍTICO, CONFIRMADO)

`apps/api/src/config/env.ts`:
```
jwtSecret: env.JWT_SECRET ?? JWT_SECRET_DESARROLLO,                              // línea 37
cifradoCanalClaves: env.CANAL_CIFRADO_CLAVES ?? "v1:MDEyMzQ1Njc4OWFiY2RlZjAx...", // línea 44-45
```
Verificado por lectura directa: no existe ningún punto en `cargarConfiguracion`
ni en `apps/api/src/index.ts`/`app.ts` que aborte el arranque cuando
`entorno === "production"` y estas variables faltan. Ambos valores por defecto
son literales públicos en el propio repositorio (el mismo que usa toda la suite
de tests). Reproducción: un JWT `superadmin` forjado con `JWT_SECRET_DESARROLLO`
contra una app arrancada sin `JWT_SECRET` en el entorno autentica con `status=200`;
un keyring construido con el valor por defecto de `CANAL_CIFRADO_CLAVES` descifra
con éxito una credencial de canal cifrada con esa misma clave por defecto.

**Impacto:** si un despliegue real omite cualquiera de las dos variables de
entorno (error operacional plausible, no un ataque sofisticado), la autenticación
completa se rompe (cualquiera puede forjar un token `superadmin`) y/o todas las
credenciales de canal cifradas quedan descifrables por cualquiera con acceso al
código fuente público.

**Corrección:** `cargarConfiguracion` debe lanzar si `entorno === "production"` y
`env.JWT_SECRET`/`env.CANAL_CIFRADO_CLAVES` no están definidos explícitamente
(fail-closed), en vez de degradar silenciosamente a un valor de desarrollo.

### S-04 — Bypass de `assertNoParecerProduccion` por acento/mayúsculas (CRÍTICO, CONFIRMADO)

`packages/sim/src/comun/etiquetado.ts:30-36`: `entorno === "production" ||
entorno === "produccion"` no cubre `"producción"` (con tilde) —
`.toLowerCase()` no normaliza diacríticos. Este es el guard central de D-019 que
debe impedir que cualquier simulador de canal (`SimuladorMensajeria`,
`ServidorIcalSimulado`, `AirbnbIcalChannelSimulator`, `BookingApiSimulator`)
arranque en producción. Con `NODE_ENV="producción"` (el error tipográfico más
plausible en un repo 100% en español), el guard no lanza y
`apps/api/src/routes/mensajeria/borradores.ts:175` construye
`SimuladorMensajeria("airbnb")` sin error en cada `/borradores/:id/aprobar`.
La suite existente `packages/sim/test/etiquetado.test.ts` solo prueba
`"production"`/`"produccion"`, nunca la variante acentuada — el hueco no estaba
cubierto.

**Corrección:** normalizar diacríticos (`entorno.normalize("NFD").replace(/[̀-ͯ]/g, "")`)
antes de comparar, o usar una lista explícita de variantes aceptadas.

## Calificación por rubro (0–10)

| Rubro | Calificación | Justificación |
|---|---|---|
| 1. SSRF (fetcher iCal) | **3/10** | Bypass total y realista del deny-list (S-01) anula la defensa central pese a que DNS rebinding TOCTOU, redirecciones multi-salto, esquema `file:`/`gopher:`, credenciales embebidas, y formas decimal/octal/hex de IPv4 SÍ están correctamente mitigadas (ver abajo). Se suma S-08 (evasión de límite de bytes + DoS por excepción no controlada) y S-12 (timeout real es de inactividad, no total). |
| 2. Parser ICS | **6/10** | Límites de tamaño/eventos/línea correctamente aplicados (ya cubiertos por el suite oficial); RRULE no implementado (sin bomba de expansión posible). Pero falta validación semántica de fecha/hora (S-07) que propaga basura aguas abajo, inconsistencia de contrato de errores en TZID (S-17), y UID vacío aceptado (S-18). |
| 3. RLS multitenant | **6/10** | 36 tablas de negocio de Lotes 1–9 verificadas con `ENABLE`+`FORCE ROW LEVEL SECURITY`; `app_rv` sin `BYPASSRLS`; fuga de contexto de sesión por pool descartada empíricamente (200 requests entrelazadas, 0 fugas). Se descuenta con fuerza por S-05: una tabla completa con PII (`huesped_minimo`) fuera del perímetro de RLS, sin segunda línea de defensa en la aplicación. |
| 4. Auth (JWT/hash/rate limit/romper cristal) | **4/10** | Hashing scrypt correcto, JWT HS256 vía `jose` sin confusión de algoritmo, rotación de refresh tokens, romper cristal con motivo/ventana acotados. Se descuenta fuerte por S-03 (secreto por defecto sin guardarraíl — auth bypass total si se despliega mal), S-06 (rate limit evadible por header spoofeado) y S-13 (canal lateral de tiempo). |
| 5. Secretos | **4/10** | Cifrado AES-256-GCM, IV único por operación, rotación por versión de keyring, y token de export iCal (32 bytes aleatorios, opaco, rotable) resistieron todos los intentos de ruptura. Se descuenta fuerte por S-02, del mismo patrón que S-03 pero sobre la clave de cifrado de credenciales de canal. |
| 6. Inyección (SQL/prompt/XSS) | **7/10** | SQL: cobertura completa parametrizada, cero hallazgos tras ataques reales contra Postgres embebido. Prompt injection contra el catálogo de tools: arquitectura de defensa en profundidad (identificadores nunca inferidos del texto del huésped) resistió 3 intentos distintos de secuestro de tool. XSS en `apps/web`: cero uso de `dangerouslySetInnerHTML`, escapado de React confirmado con payloads reales. Se descuenta por S-14 (tag-escape en el prompt real hacia Claude, aunque el adaptador está inactivo por defecto) y S-19 (filtro de confirmación evadible por paráfrasis). |
| 7. Logs/PII | **5/10** | El camino feliz de mensajería (`resumenSinPii`) no filtra PII en ningún evento de negocio normal. Pero se confirmaron tres vías reales de fuga en caminos de error/observabilidad (S-09, S-10, S-15) que contradicen invariantes documentados explícitamente en el propio código, más duplicación sin redactar de PII en auditoría de mensajería (S-16, mitigado solo por RLS). |
| 8. Supply chain | **9/10** | `npm audit --omit=dev` y con dev: 0 vulnerabilidades en 506 paquetes (55 prod). Cero scripts `postinstall`/`preinstall`/`prepare` en los 8 `package.json` del monorepo. Licencias directas 100% permisivas (MIT/ISC/Apache-2.0). Se descuenta 1 punto por S-20 (informativo: versiones desactualizadas y `@hono/node-server` inconsistente entre workspaces). |
| 9. Simuladores/flags | **4/10** | `agentes.habilitado` confirmado default-off real (sin depender de configuración adicional, y sin ningún endpoint HTTP que hoy lo pueda activar); cuota de agentes fail-closed. Se descuenta fuerte por S-04 (bypass del guard central D-019 por un error tipográfico extremadamente plausible en este equipo) y S-11 (el mismo tipo de fallo de normalización de `NODE_ENV` desactiva el guard anti-simulador de `cuentasCanal.ts`). |

## Lo que se intentó romper y NO se pudo (con evidencia)

**SSRF:**
- DNS rebinding TOCTOU: `fetchSsrf.ts:100` resuelve una sola vez y pinea la IP literal al socket (`fetchSsrf.ts:129`); Node no vuelve a resolver un host que ya es IP literal. Confirmado: `resolverPersonalizado` se invoca exactamente 1 vez por fetch.
- Redirecciones multi-salto hacia interno, con esquema distinto (`https→file`), o con credenciales embebidas: revalidado en cada salto (`fetchSsrf.ts:174-196`); rechazado con `ip_bloqueada`/`esquema_no_permitido`/`credenciales_en_url` según el vector.
- Esquema `gopher:`/no estándar: `esquemaPermitido` (`fetchSsrf.ts:59-65`) exige `https:` o `http:` + `simulador.local` + flag explícito.
- Formas decimal (2130706433), hex-por-octeto (0x7f.0.0.1), ceros de relleno (127.000.000.1): `ipv4AEntero` (`ssrf.ts:24-34`) las normaliza correctamente vía `Number()` por octeto; el rango se detecta igual.
- Content-Length mentiroso: el código nunca lee esa cabecera (`fetchSsrf.ts:141-148`), el conteo es sobre bytes reales recibidos.
- Hostnames ofuscados (`localhost.localdomain`, `*.nip.io`): la validación opera sobre la IP resuelta, no sobre el string del hostname.
- Bomba de expansión RRULE: funcionalidad no implementada, `parser.ts:199-261` nunca lee `RRULE`.
- Líneas gigantes/unfolding patológico y bombas de tamaño/eventos del ICS: límites aplicados correctamente e incrementalmente (ya cubierto también por `tests/adversarial/ssrf/casos.test.ts`).

**RLS/Auth:**
- Fuga de contexto de sesión Postgres entre requests con pool reutilizado (`set_config(..., false)`): 200 requests entrelazadas admin-A/admin-B con `pool.max=2` forzando reciclaje de conexión → 0 fugas detectadas. `fijarSesion` corre como primera operación de cada `pool.connect()` (`apps/api/src/db/contexto.ts:33-73`) y `pg.Pool` entrega la conexión física en exclusiva hasta `release()`.
- Escalada de rol vía `UPDATE usuario`: bloqueado por policy `usuario_actualizacion` (`0015_rls_politicas.ts:103-105`).
- Confusión de algoritmo JWT (`alg: none`): `jose` con clave simétrica solo acepta HMAC.
- Reutilización de refresh token tras rotación: rechazado explícitamente si `revocado_en !== null` (`auth.ts:114`).
- Reutilización/reactivación de "romper cristal" ya revocado: `POST .../revocar` sobre una concesión ya revocada devuelve `404`, nunca reactiva.

**Secretos/Inyección:**
- Descifrar credenciales sin la clave correcta, o con ciphertext/tag manipulado: `descifrar()` lanza en ambos casos (AES-GCM con verificación de tag).
- Adivinar o forzar un token de export iCal válido, o reutilizar uno rotado: 5 variantes cercanas probadas, todas `404`; rotación invalida de inmediato la URL anterior.
- Inyección SQL vía nombre de cuenta de canal, filtro `tabla`/`estado` en endpoints de auditoría/tareas: todo parametrizado, valores maliciosos se guardan/comparan como texto literal.
- Hacer que el ejecutor de agentes invoque una tool fuera de catálogo o cuele un identificador de otra unidad/tenant/reserva como argumento: 3 proveedores LLM maliciosos distintos, todos rechazados (`additionalProperties:false` + `patronesIdentificador.ts`).
- Ejecutar un `<script>`/`onerror` inyectado en mensajería vía React: renderizado como texto plano, sin ejecución, confirmado con Testing Library sobre el componente real.

**Logs/Supply chain/Flags:**
- Filtrar el texto crudo del huésped en eventos de negocio normales (`mensaje_entrante_registrado`, `borrador_generado`, etc.): `resumenSinPii` funciona correctamente en el camino feliz.
- Vulnerabilidades de dependencias conocidas (CVE): `npm audit` reporta 0 en prod y dev (506 paquetes).
- Scripts `postinstall`/`preinstall`/`prepare` maliciosos: ninguno de los 8 `package.json` del monorepo los declara.
- Activar `agentes.habilitado` sin configuración vía alguna ruta HTTP: no existe endpoint que conecte ese catálogo de flags hoy (laguna operativa, no vulnerabilidad).
- Detectar `NODE_ENV="PRODUCTION"` (mayúsculas) como fallo en `assertNoParecerProduccion`: sí lo detecta correctamente (el `.toLowerCase()` cubre mayúsculas, solo falla con diacríticos).

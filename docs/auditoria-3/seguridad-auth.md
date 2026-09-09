# Auditoría-3 — Rubro 1: Autenticación (AUTH)

Auditor adversarial independiente (Sonnet), Fase 3 / Lote 3.2. Alcance:
`apps/api/src/routes/auth.ts`, `apps/api/src/seguridad/{oidc,oidcSimulado,totp,jwt,correo,correoResend,plantillasCorreo}.ts`,
`apps/api/src/middleware/cookiesAuth.ts`, `apps/api/src/seguridad/rateLimit.ts`,
migraciones `packages/db/src/migrations/0100`–`0108`. Verificación por lectura línea a línea +
reproducción ejecutable en `tests/auditoria-3/auth/`.

Nota de método: por inestabilidad de la API de agentes esta noche, este rubro se auditó
en solitario (sin sub-agentes), con menor cobertura de la originalmente planeada. Se
priorizaron los puntos de mayor impacto (validación de id_token, CSRF, rate limiting,
MFA, invitaciones) y se marcan como SOSPECHA los puntos no verificados con repro real.

## Hallazgos

### A3-AUTH-01 — ALTO — Rate limiting en memoria, no distribuido: ineficaz en Vercel serverless — **CORREGIDO**

- **Estado:** corregido. `POST /auth/mfa/verificar` ahora usa `LimitadorVentanaPostgres`
  (`apps/api/src/seguridad/rateLimitPostgres.ts`), con el contador persistido en la tabla
  `rate_limit_bucket` (`packages/db/src/migrations/0127_rate_limit_bucket.ts`) en vez de un
  `Map` en memoria — sobrevive cold starts porque vive en Postgres, igual que el bloqueo de
  cuenta de `/auth/login`. Clave doble: por `usuario_id` (identificador fuerte, ligado al
  `mfaToken` firmado — un atacante no puede rotarlo) y por IP (`ipHashDeRequest`, defensa
  adicional). El incremento es atómico (`INSERT ... ON CONFLICT DO UPDATE` protegido por el
  lock de fila de Postgres), verificado con un test de concurrencia real (10 intentos
  simultáneos desde dos pools de conexión distintos contra la misma clave, `maximo=5`: exactamente
  5 permitidos y 5 bloqueados, nunca más). Limpieza perezosa/probabilística
  (`rate_limit_limpiar_expirados`, ~1% de las llamadas) evita que la tabla crezca sin límite
  sin requerir un cron dedicado. Config: `RATE_LIMIT_MFA_VERIFICAR_VENTANA_MS`/
  `RATE_LIMIT_MFA_VERIFICAR_MAXIMO` (por defecto 5 intentos / 5 min, la misma ventana que la
  vida del `mfaToken`).
- **Repro actualizado:** `tests/auditoria-3/auth/rateLimitNoDistribuido.test.ts` — PASA (4
  tests). El bloque original (limitador GENÉRICO en memoria, `LimitadorVentana`/
  `crearRateLimit`) se conserva sin cambios de fondo: sigue sin ser distribuido, por diseño,
  como defensa en profundidad — pero ya NO es el único freno de una ruta sensible. Un bloque
  nuevo reproduce el mismo experimento "dos instancias / cold starts" contra
  `LimitadorVentanaPostgres`, con dos `pg.Pool` independientes (simulando dos contenedores
  serverless distintos) apuntando al mismo backend Postgres real (`embedded-postgres`,
  mismas migraciones que producción): agotar el límite en la "instancia A" bloquea de
  inmediato a la "instancia B", sin esperar la ventana — lo opuesto exacto del bug original.
  Confirmado además que `test/integration/authExtendido.test.ts` (flujo MFA completo, HTTP
  real) sigue en verde con el nuevo límite activo.
- **Hallazgo original (contexto, ya no vigente para MFA):**
- **Archivo:** `apps/api/src/seguridad/rateLimit.ts:41-64` (clase `LimitadorVentana`, `Map` en memoria del proceso).
- **Uso crítico:** protege `/auth/login` (`limitadorPorEmail`, `auth.ts:478`) y, sobre todo,
  `POST /mfa/verificar` (segundo factor TOTP de 6 dígitos, `auth.ts:542-595`), que **no tiene
  ningún contador persistente en base de datos** — a diferencia del login, que sí usa
  `autenticar_registrar_intento_fallido`/`bloqueado_hasta` en Postgres (`auth.ts:500-504`).
  El `mfaToken` vive 5 minutos (`DURACION_MFA_PENDIENTE_SEGUNDOS = 300`,
  `apps/api/src/seguridad/jwt.ts:31`), y durante esos 5 minutos el único freno a probar
  códigos de 6 dígitos es el limitador genérico por IP (`app.use("*", crearRateLimit(...))`,
  `apps/api/src/app.ts:91`, 100 req/min por defecto).
- **Problema:** el propio código documenta la limitación (comentario `rateLimit.ts:6-10,22-27`):
  "suficiente para un solo proceso... un despliegue multi-instancia necesita un backend
  compartido (Redis u otro)". El despliegue evaluado en esta auditoría es **Vercel
  serverless** (`apps/api/api/index.ts`), donde cada invocación puede aterrizar en una
  instancia de función distinta o un cold start nuevo — cada uno con su propio `Map` vacío.
- **Repro:** `tests/auditoria-3/auth/rateLimitNoDistribuido.test.ts` — PASA. Se agota el
  límite (3 peticiones) en una "instancia" del middleware, y se demuestra que una segunda
  instancia (equivalente a un cold start) para la MISMA IP concede otras 3 peticiones
  íntegras, sin esperar la ventana de tiempo. Salida real: `1 passed`.
- **Impacto:** en producción sobre Vercel, un atacante que ya obtuvo email+contraseña
  válidos (p. ej. por phishing o reuso de contraseñas) puede intentar fuerza bruta contra
  el código TOTP de 6 dígitos con una tasa efectiva mucho mayor a la nominal (100/min),
  porque el contador no sobrevive entre instancias/cold-starts. El límite por IP para
  login/reset/registro sufre el mismo problema, aunque ahí el bloqueo de cuenta persistido
  en BD (`bloqueado_hasta`) sí ofrece una segunda capa de defensa — el segundo factor MFA no
  la tiene.
- **Corrección sugerida:** mover `LimitadorVentana` a un backend compartido (tabla Postgres
  con `UPSERT`+ventana, o Redis/Upstash) al menos para `/mfa/verificar` y para el contador
  de intentos por email de `/auth/login`; documentar explícitamente el riesgo en
  `docs/despliegue/README.md` si se decide no resolverlo antes de producción.

### A3-AUTH-02 — MEDIO — Token CSRF de doble envío no ligado criptográficamente a la sesión — **CORREGIDO**

- **Estado:** corregido. `rv_csrf` ya NO es un valor aleatorio independiente: se deriva
  como HMAC-SHA256 del `refreshToken` de esa sesión concreta, con una subclave propia
  derivada de `JWT_SECRET` (`derivarTokenCsrf`/`csrfTokenValidoParaRefresh`,
  `apps/api/src/seguridad/jwt.ts`) — nunca el secreto crudo directamente, para no reutilizar
  la misma clave HMAC entre dominios de uso distintos (firma de JWT vs. derivación de CSRF).
  `verificarCsrf(jwtSecret)` (`apps/api/src/middleware/cookiesAuth.ts`) ahora recibe el
  secreto de servidor y recalcula el HMAC esperado a partir del `rv_refresh` REAL que trae
  la petición, exigiendo que tanto la cookie `rv_csrf` como la cabecera `X-CSRF-Token`
  coincidan con ese valor (comparación en tiempo constante,
  `timingSafeEqual`) — ya no basta con que cookie y cabecera coincidan solo entre sí.
  `entregarSesion`/el callback OIDC (`apps/api/src/routes/auth.ts`) fijan `rv_csrf` con
  `derivarTokenCsrf(tokens.refreshToken, jwtSecret)` en vez de `generarValorAleatorio(16)`.
- **Repro actualizado:** `tests/auditoria-3/auth/csrfNoLigadoASesion.test.ts` — PASA (6
  tests). Confirma: (1) el par legítimo csrf+refresh de una misma sesión sigue aceptándose;
  (2) la combinación cruzada del hallazgo original (CSRF de la sesión A + refresh de la
  sesión B) que ANTES pasaba (200) ahora se RECHAZA (403 `csrf_invalido`); (3) el vector de
  explotación real descrito abajo ("cookie tossing": un atacante fija su propio valor,
  igual en cookie y cabecera, sobre el `rv_refresh` real de la víctima) también se rechaza,
  porque ese valor no es el HMAC correcto y el atacante no conoce `JWT_SECRET` para
  producirlo; (4)/(5) `derivarTokenCsrf`/`csrfTokenValidoParaRefresh` no aceptan un token
  calculado con un secreto o un refresh token distintos. La suite de integración existente
  (`test/integration/authExtendido.test.ts`, que ejercita el flujo real login→CSRF
  real→refresh con cookies HTTP reales) sigue en verde con el nuevo esquema.
- **Hallazgo original (contexto, ya no vigente):**
- **Archivo:** `apps/api/src/middleware/cookiesAuth.ts:59-95`; emisión en
  `apps/api/src/routes/auth.ts:269,453` (`fijarCookieCsrf(c, generarValorAleatorio(16), ...)`).
- **Problema:** `rv_csrf` era un valor aleatorio puro, sin relación (HMAC) con `rv_refresh`
  ni con ningún identificador de sesión server-side. `verificarCsrf()` solo comparaba
  `cookie rv_csrf === header X-CSRF-Token`, nunca verificaba que ese CSRF se hubiera emitido
  junto con la sesión que traía la petición.
- **Impacto:** por sí solo el doble-envío seguía mitigando CSRF cross-site clásico (un
  atacante en otro origen no puede leer `rv_csrf` por same-origin policy). El riesgo
  adicional exigía una vía secundaria para que el atacante fijara `rv_csrf` en el
  navegador de la víctima (cookie no es `httpOnly` a propósito) — p. ej. "cookie tossing"
  desde un subdominio hermano vulnerable, o cabeceras `Set-Cookie` inyectables en algún
  otro endpoint del mismo dominio registrable. No se encontró tal vía en este repo, por lo
  que el riesgo era teórico/defensa en profundidad, no explotable de forma aislada — pero el
  hallazgo real (la falta de ligadura criptográfica) se cierra con esta corrección, no solo
  se documenta.

### A3-AUTH-03 — SOSPECHA (no confirmado) — Posible carrera en aceptación de invitación

- **Archivo:** `packages/db/src/migrations/0107_auth_invitacion_y_politica_tenant.ts:49-53`
  (`autenticar_aceptar_invitacion`) + `apps/api/src/routes/auth.ts:745-767`.
- **Observación:** la comprobación de invitación (`autenticar_buscar_invitacion`, SELECT sin
  `FOR UPDATE`) y la creación del usuario (`autenticar_registrar_usuario`) ocurren en
  sentencias separadas antes de marcar `autenticar_aceptar_invitacion`, sin lock explícito
  de fila. La función de aceptación en sí es correcta (`WHERE aceptada_en IS NULL AND
  revocada_en IS NULL`), así que como mucho podría permitir que **dos** llamadas
  concurrentes con el mismo token creen dos cuentas de usuario para el mismo email/tenant
  antes de que la segunda vea `aceptada_en` ya puesto — no es account takeover, pero sí
  duplicaría el alta. No se construyó un repro con `Promise.all` contra Postgres real por
  límite de tiempo de esta sesión (ver `docs/BLOQUEOS.md` continuidad). Severidad estimada
  si se confirma: BAJO/MEDIO (duplicidad de alta, no escalación de privilegio).
- **Corrección sugerida si se confirma:** `SELECT ... FOR UPDATE` sobre la fila de
  invitación antes de crear el usuario, dentro de la misma transacción.

## Puntos verificados y BIEN implementados (para no repetirlos como pendientes)

- **Validación de `id_token` de Google/OIDC** (`apps/api/src/seguridad/oidc.ts:142-176`):
  usa `jose` (`jwtVerify` + `createRemoteJWKSet`/`createLocalJWKSet`), lo que impide
  confusión de algoritmo `alg:none`/HS256-con-clave-pública por diseño de la librería
  (el JWKS solo contiene claves asimétricas). Verifica `iss`, `aud`, `exp`/`iat` (por
  `jose`), `nonce` manual contra el guardado en `oidc_flow`, y rechaza explícitamente
  `email_verified !== true` (línea 165-167). Mensajes de error genéricos hacia el cliente
  (no revela cuál validación falló).
- **PKCE + `state`**: `code_verifier` y `nonce` se generan y persisten server-side en
  `oidc_flow` asociados al `state` (hasheado), y el `state` se consume exactamente una vez
  (`UPDATE oidc_flow SET consumido_en = now() ... AND consumido_en IS NULL`,
  `auth.ts:319-324`) — protege contra CSRF de callback y replay del `code`.
- **Vinculación de cuenta por email**: solo ocurre tras `email_verified === true` validado
  contra el proveedor; vincular a cuenta YA EXISTENTE se permite siempre (no otorga acceso
  nuevo), y crear cuenta NUEVA vía Google respeta la política del tenant
  (`abierto`/`dominio_permitido`/cerrado) — `auth.ts:402-419`.
- **Reset de password**: token de 32 bytes vía `crypto.randomBytes` (`generarValorAleatorio`),
  hasheado antes de guardar (`token_un_uso.token_hash`), un solo uso (`usado_en`), expiración
  verificada server-side, mensaje de respuesta idéntico exista o no el email
  (`auth.ts:840-860`), invalida TODAS las sesiones existentes al completarse
  (`auth.ts:886-898`).
- **MFA TOTP**: ventana ±1 paso de 30s (estándar, no excesiva —
  `apps/api/src/seguridad/totp.ts:15-16`), códigos de recuperación de un solo uso
  (`consumirCodigoRecuperacion`, se reemplazan tras usarse), sesión completa emitida SOLO
  tras el segundo paso — el `mfaToken` previo no es una sesión válida por sí mismo.
- **Refresh rotativo con detección de reutilización**: un token ya revocado presentado de
  nuevo revoca TODA la familia (`auth.ts:628-654`), verificado también por
  `apps/api/test/integration/authExtendido.test.ts` (test de integración existente,
  descripción en su cabecera).
- **Cookies**: `rv_refresh` httpOnly+Secure(prod)+SameSite=Lax, `path=/auth` (alcance
  reducido); `Secure` es fail-closed (solo se desactiva si `entorno === "development"`, todo
  lo demás exige `Secure`).
- **Bloqueo de cuenta por intentos fallidos**: persistido en Postgres
  (`autenticar_registrar_intento_fallido`/`bloqueado_hasta`), sobrevive a multi-instancia
  a diferencia del rate limiter genérico (contraste directo con A3-AUTH-01).
- **Invitaciones**: no se pueden aceptar dos veces a nivel de función SQL
  (`WHERE aceptada_en IS NULL AND revocada_en IS NULL`), ni con email distinto al invitado
  (`auth.ts:752-754`), y expiran (`expira_en` verificado).
- **Logout global**: `POST /logout-global` revoca TODOS los refresh tokens activos del
  usuario (`auth.ts:1055-1063`), no solo la cookie actual.

## No verificado por límite de tiempo (declarar honestamente, no asumir OK)

- Enumeración de usuarios por **tiempo** de respuesta (solo se verificó por mensaje/código;
  no se midieron latencias reales entre email existente/no existente con `HASH_SENUELO_TIMING`).
- Ventana exacta de expiración del token de verificación de correo y de invitación bajo reloj
  real (solo lectura de código, no repro con reloj falseado).
- Cobertura completa de `oidcSimulado.ts` (imposibilidad de activarlo fuera de dev/test) —
  no se auditó en este rubro; puede solaparse con `despliegue.md`.

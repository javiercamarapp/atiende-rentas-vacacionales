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

### A3-AUTH-01 — ALTO — Rate limiting en memoria, no distribuido: ineficaz en Vercel serverless

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

### A3-AUTH-02 — MEDIO — Token CSRF de doble envío no ligado criptográficamente a la sesión

- **Archivo:** `apps/api/src/middleware/cookiesAuth.ts:59-95`; emisión en
  `apps/api/src/routes/auth.ts:269,453` (`fijarCookieCsrf(c, generarValorAleatorio(16), ...)`).
- **Problema:** `rv_csrf` es un valor aleatorio puro, sin relación (HMAC) con `rv_refresh`
  ni con ningún identificador de sesión server-side. `verificarCsrf()` solo compara
  `cookie rv_csrf === header X-CSRF-Token`, nunca verifica que ese CSRF se haya emitido
  junto con la sesión que trae la petición.
- **Repro:** `tests/auditoria-3/auth/csrfNoLigadoASesion.test.ts` — PASA. Se emiten dos
  pares de cookies para dos "sesiones" distintas (A y B) y se demuestra que combinar el
  refresh de B con el CSRF de A (más la cabecera igual al CSRF de A) pasa la verificación
  sin error. Salida real: `1 passed`.
- **Impacto:** por sí solo el doble-envío sigue mitigando CSRF cross-site clásico (un
  atacante en otro origen no puede leer `rv_csrf` por same-origin policy). El riesgo
  adicional exigiría una vía secundaria para que el atacante fije `rv_csrf` en el
  navegador de la víctima (cookie no es `httpOnly` a propósito) — p. ej. "cookie tossing"
  desde un subdominio hermano vulnerable, o cabeceras `Set-Cookie` inyectables en algún
  otro endpoint del mismo dominio registrable. No se encontró tal vía en este repo, por lo
  que el riesgo hoy es teórico/defensa en profundidad, no explotable de forma aislada.
- **Corrección sugerida:** derivar `rv_csrf` como HMAC del `refreshToken`/`familiaId` con
  una clave de servidor (o firmar el token con `jwt.ts`), para que un CSRF cookie robado o
  fijado por otra vía nunca sea válido para una sesión distinta a la que lo emitió.

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

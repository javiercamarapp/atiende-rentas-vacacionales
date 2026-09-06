# Google Sign-In — configuración exacta en Google Cloud Console (Lote 3.2)

Esta guía la ejecuta el USUARIO (o quien tenga acceso a la cuenta de
Google Cloud de la organización) — ningún agente de este repo tiene ni
puede crear credenciales de Google. Sin estas tres variables de entorno
(`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REDIRECT_URI`) el botón "Continuar con Google" aparece
**deshabilitado con motivo explícito** en la UI (`GET /auth/config`) —
nunca un error 500 ni un botón que aparente funcionar y falle. Ver
también `docs/despliegue/README.md` §3 (tabla de variables de entorno) y
§7 (dominio propio).

## 0. Qué implementa este repo (para entender qué le vas a dar permiso a hacer)

- Flujo **Authorization Code + PKCE** (RFC 7636), nunca el flujo implícito.
- Scopes pedidos: `openid email profile` — **ningún otro** (ni Drive, ni
  Calendar, ni Contacts). El botón de Google solo sirve para iniciar
  sesión/vincular una cuenta, nunca para acceder a datos de Google del
  usuario.
- El `id_token` de Google se valida de punta a punta antes de crear o
  vincular cualquier cuenta: firma contra el JWKS real de Google
  (`https://www.googleapis.com/oauth2/v3/certs`), `iss` =
  `https://accounts.google.com`, `aud` = tu `client_id`, `nonce`,
  vigencia, y `email_verified = true` — un correo de Google NO verificado
  por Google mismo nunca crea ni vincula ninguna cuenta local (ver
  `apps/api/src/seguridad/oidc.ts`).
- Vincular una identidad de Google a una cuenta local YA EXISTENTE (mismo
  correo verificado) **siempre** está permitido. CREAR una cuenta nueva
  vía Google la gobierna `tenant.politica_vinculacion_google`
  (`invitado_solo` por defecto/`dominio_permitido`/`abierto`) — configúrala
  por tenant desde donde tu equipo administre tenants (backoffice); no es
  parte de esta guía de Google Cloud.

## 1. Crear (o reutilizar) un proyecto en Google Cloud

1. Entra a <https://console.cloud.google.com/>.
2. Arriba a la izquierda, selector de proyecto → **Nuevo proyecto** (o
   elige uno existente si tu organización ya tiene uno para este
   producto). Nombre sugerido: `Atiende Rentas Vacacionales`.

## 2. Configurar la pantalla de consentimiento OAuth

Menú → **APIs y servicios** → **Pantalla de consentimiento de OAuth**.

1. **Tipo de usuario**: `Externo` (a menos que TODOS tus usuarios sean de
   un Google Workspace propio y quieras restringir a `Interno` — en ese
   caso usa `Interno`, más simple, sin revisión de Google).
2. **Información de la app**:
   - Nombre de la app: el nombre visible que el usuario verá en la
     pantalla de Google ("Atiende Rentas Vacacionales" o el nombre
     comercial real que uses).
   - Correo de asistencia al usuario: un correo real de tu organización.
   - Logotipo de la app (opcional, pero recomendado — súbelo si quieres
     que la pantalla de consentimiento se vea profesional).
3. **Dominio de la aplicación** (opcional pero recomendado):
   - Página principal: `https://<tu-dominio-de-producción>`
   - Política de privacidad / Términos de servicio: si ya los tienes
     publicados, ponlos aquí (Google los exige para salir de "modo
     prueba" con usuarios externos).
4. **Dominios autorizados**: agrega el dominio raíz de tu despliegue (p.
   ej. `vercel.app` si usas el subdominio por defecto de Vercel del
   §1 de `docs/despliegue/README.md`, o tu dominio propio del §7).
5. **Datos de contacto del desarrollador**: tu correo.
6. **Scopes**: en el paso "Scopes" agrega exactamente:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
   (Estos tres son los estándar detrás de "openid email profile" — no
   agregues ningún scope sensible/restringido, este producto no los
   necesita y pedirlos activaría un proceso de verificación de Google
   mucho más largo).
7. **Usuarios de prueba** (solo si dejaste el tipo de usuario en modo
   "Prueba", el estado inicial): agrega aquí los correos de las personas
   que van a probar el login con Google ANTES de publicar la app — sin
   esto, Google les bloquea el login con "la app no ha completado el
   proceso de verificación".
8. Cuando estés listo para que CUALQUIER usuario de Google pueda iniciar
   sesión (no solo tus usuarios de prueba): botón **Publicar app**. Para
   los tres scopes de arriba (no sensibles), Google normalmente no exige
   una revisión manual — pasa a "En producción" casi de inmediato.

## 3. Crear las credenciales OAuth (Client ID / Client Secret)

Menú → **APIs y servicios** → **Credenciales** → **+ Crear credenciales**
→ **ID de cliente de OAuth**.

1. **Tipo de aplicación**: `Aplicación web`.
2. **Nombre**: algo identificable, p. ej. `Atiende RV — web (producción)`.
3. **Orígenes autorizados de JavaScript**: agrega el origen exacto de tu
   web (sin path, sin barra final):
   - Producción: `https://<tu-dominio-de-producción>`
   - Si pruebas en Preview de Vercel también, agrega ese origen de
     Preview (cambia en cada deploy de Preview si usas URLs generadas
     automáticamente — normalmente basta con producción).
4. **URIs de redireccionamiento autorizados**: agrega la URL EXACTA del
   callback de este backend. Con el despliegue de
   `docs/despliegue/README.md` (Vercel, mismo origen, API bajo `/api/*`):

   ```
   https://<tu-dominio-de-producción>/api/auth/google/callback
   ```

   Para desarrollo local (`apps/api` sirviendo directo en `:8787`, sin el
   prefijo `/api` de Vercel):

   ```
   http://localhost:8787/auth/google/callback
   ```

   **Debe coincidir EXACTAMENTE** (protocolo, dominio, path, sin barra
   final de más ni de menos) con el valor que pongas en
   `GOOGLE_OAUTH_REDIRECT_URI` — Google rechaza el intercambio de código
   si no coinciden byte a byte.
5. Crear. Google te muestra el **Client ID** y el **Client Secret** —
   cópialos, el secret solo se muestra completo esta vez (puedes volver a
   verlo o regenerarlo después desde la misma pantalla de credenciales).

## 4. Variables de entorno (nunca se guardan en este repo)

En Vercel → Project Settings → Environment Variables (o tu gestor de
secretos si usas el VPS del §8 de `docs/despliegue/README.md`):

| Variable | Valor |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | El "Client ID" del paso 3 (termina en `.apps.googleusercontent.com`) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | El "Client Secret" del paso 3 |
| `GOOGLE_OAUTH_REDIRECT_URI` | La URL exacta del paso 3, punto 4 (debe coincidir byte a byte) |

Local (`.env`, nunca commiteado): copia `apps/api/.env.example` y llena
esas tres variables con los valores de desarrollo (normalmente puedes
reusar el mismo proyecto de Google Cloud y agregar el URI de
`localhost:8787` como un segundo "URI de redireccionamiento autorizado"
del mismo Client ID — no hace falta un Client ID separado por entorno,
aunque es buena práctica tener uno de producción y uno de
desarrollo/Preview si tu organización lo prefiere).

## 5. Verificar que quedó bien configurado

1. `GET /auth/config` (con las tres variables puestas) debe responder
   `{"googleHabilitado": true, "googleMotivoDeshabilitado": null, ...}`.
   Sin ellas (o con alguna vacía), `googleHabilitado: false` y
   `googleMotivoDeshabilitado` trae el mensaje exacto de qué falta —
   nunca un 500.
2. En la pantalla de login de la web, el botón "Continuar con Google"
   deja de estar deshabilitado.
3. Haz clic, elige tu cuenta de Google real en la pantalla de Google, y
   confirma que vuelves a la app ya con sesión iniciada (la cookie de
   sesión se fija en el callback, `apps/api/src/routes/auth.ts`).
4. Si tu cuenta de Google no existe todavía como usuario local: revisa
   `tenant.politica_vinculacion_google` de ese tenant — con
   `invitado_solo` (el valor por defecto de cualquier tenant nuevo)
   necesitas una invitación pendiente para ese correo exacto; con
   `dominio_permitido` necesitas que el dominio del correo (o el `hd` de
   Workspace) esté en `tenant.dominios_google_permitidos`; con `abierto`
   cualquier correo verificado puede darse de alta.

## 6. Proveedor OIDC simulado (desarrollo/pruebas/E2E — sin esta guía)

Para desarrollo local, pruebas de integración y E2E de Playwright
**nunca hace falta nada de esta guía**: `apps/api` monta automáticamente
un proveedor OIDC simulado propio (`apps/api/src/seguridad/
oidcSimulado.ts`, `GET /auth/oidc-simulado-login/inicio`) con su propio
emisor y JWKS — fail-closed fuera de `development`/`test` explícitos
(nunca se monta en producción, D-019). Es la vía que usan
`apps/api/test/integration/authExtendido.test.ts` y
`apps/web/e2e/lote3-2-google-simulado.spec.ts` para ejercitar el flujo
completo de Google sin depender de la cuenta real ni de red externa.

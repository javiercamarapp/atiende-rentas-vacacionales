# Sentry — monitoreo de errores (bucle B)

Esta guía la ejecuta el USUARIO (o quien tenga la cuenta de Sentry y el
panel de Vercel) — igual que `docs/despliegue/README.md` y
`docs/despliegue/google-oauth.md`, ningún agente de este repo crea
proyectos de Sentry ni tiene sesión en su panel.

**Estrictamente opcional.** Sin las variables de entorno de abajo, ni la
API ni el frontend llaman jamás a Sentry — cero llamadas de red, cero
overhead (`apps/api/src/observabilidad/sentry.ts` / `apps/web/src/lib/
sentry.ts`, mismo criterio fail-closed/"nada finge producción" que el
resto de adaptadores reales de este repo, D-017/D-019).

## 1. Crear el proyecto en Sentry

1. https://sentry.io → **Create Project**.
2. Crear DOS proyectos dentro de la misma organización (comparten el
   mismo panel de alertas/issues, pero cada SDK necesita su propio DSN):
   - Plataforma **Node.js** (Express/genérico sirve igual — este repo usa
     Hono directamente, no un framework que Sentry liste explícito) →
     nombre sugerido `atiende-rv-api`.
   - Plataforma **React** → nombre sugerido `atiende-rv-web`.
3. En cada proyecto, **Settings → Client Keys (DSN)** → copiar el DSN
   (`https://<clave>@<org>.ingest.sentry.io/<id>` o el dominio propio si
   la organización usa `sentry.io` con "region" distinta — copiar tal
   cual lo muestra el panel, no reescribirlo a mano).

## 2. Variables de entorno

### API (`apps/api/.env.example`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `SENTRY_DSN` | No (opcional) | DSN del proyecto **Node.js**. Sin ella, `iniciarSentry` nunca llama `Sentry.init`. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Fracción de transacciones muestreadas, `0.0`–`1.0`. Por defecto `0.1` (10%) si se omite o el valor no es un número válido en ese rango. |
| `SENTRY_SEND_PII` | No | `"true"` para permitir que `user.email` viaje a Sentry. Cualquier otro valor (incluida su ausencia) redacta el correo antes de enviar el evento. |

Además, `apps/api/api/index.ts` usa `VERCEL_GIT_COMMIT_SHA` (la inyecta
Vercel automáticamente en cada build, no hay que configurarla a mano)
como `release` — así cada evento en Sentry queda asociado al commit
exacto desplegado.

La ruta interna de prueba (§4) reutiliza `CRON_SECRET`, la variable que
ya introduce el paquete de sincronización por cron para sus propias
rutas internas (`apps/api/src/rutas/internas/**`) — no hace falta una
segunda variable solo para esto.

### Web (`apps/web/.env.example`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `VITE_SENTRY_DSN` | No (opcional) | DSN del proyecto **React**. Variable de BUILD de Vite: solo se embebe en el bundle si está definida en tiempo de build. Sin ella, `iniciarSentryWeb` nunca llama `Sentry.init`. |

## 3. Configurar en Vercel

Panel de Vercel → proyecto → **Settings → Environment Variables**:

- `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` (opcional, por defecto `0.1`),
  `SENTRY_SEND_PII` (opcional, por defecto desactivado) → entorno
  **Production** y/o **Preview**, según se quiera monitorear ambos.
- `VITE_SENTRY_DSN` → mismo entorno(s). Al ser variable de build, un
  cambio de valor requiere un **Redeploy** (no basta con que la función
  serverless se reinicie) para que el nuevo bundle de `apps/web` la
  incluya.

Sin estas variables, el despliegue funciona exactamente igual que hoy
(no rompe nada, no degrada ninguna ruta) — Sentry es puramente aditivo.

## 4. Disparar un evento de prueba y verificarlo en Sentry

Con `SENTRY_DSN` y `CRON_SECRET` ya configurados en el despliegue:

```bash
curl -i https://<tu-dominio>/api/internal/sentry-test \
  -H "x-cron-secret: <el mismo valor de CRON_SECRET>"
```

Respuestas posibles (fail-closed, `apps/api/src/observabilidad/
sentry.ts#crearRutaPruebaSentry`):

- **503** `servicio_no_configurado` — `CRON_SECRET` no está configurado en
  este despliegue. La ruta nunca queda "abierta" por accidente.
- **401** `no_autorizado` — la cabecera `x-cron-secret` (o
  `Authorization: Bearer <secreto>`) falta o no coincide.
- **200** `{"enviado": false, ...}` — el secreto es correcto pero
  `SENTRY_DSN` no está configurado: confirma que la ruta funciona sin
  fingir que se envió un evento.
- **200** `{"enviado": true}` — se llamó `Sentry.captureException` con un
  error sintético ("Evento de prueba de Sentry (GET
  /internal/sentry-test)").

Después de un `enviado: true`, entrar al proyecto **Node.js** en
https://sentry.io → pestaña **Issues** → debería aparecer ese evento en
menos de un minuto, con:

- `environment` = el valor de `APP_ENV_LABEL`/`NODE_ENV` de ese
  despliegue (nunca "producción" a ciegas si no se configuró
  explícitamente).
- `release` = el SHA del commit desplegado (`VERCEL_GIT_COMMIT_SHA`).
- Sin cabeceras `authorization`/`cookie` en el request adjunto al evento
  (deben aparecer como `[REDACTADO]` si el evento las incluyó) y sin
  `user.email` salvo que `SENTRY_SEND_PII=true` esté configurado.

Para el proyecto **React**, la forma más simple de generar un evento de
prueba real es forzar un error de render en un entorno de Preview (por
ejemplo, temporalmente, lanzar un error dentro de un componente) y
confirmar que aparece la pantalla de fallback en español ("Algo salió
mal") en vez de una pantalla en blanco, y que el evento llega a Sentry —
revertir ese cambio de prueba antes de fusionar.

## 5. Qué queda pendiente de configuración externa

- Crear los dos proyectos en Sentry (Node.js + React) y copiar sus DSN —
  requiere sesión en https://sentry.io con la cuenta/organización que use
  Javier.
- Configurar `SENTRY_DSN`/`VITE_SENTRY_DSN` (y opcionalmente
  `SENTRY_TRACES_SAMPLE_RATE`/`SENTRY_SEND_PII`) en el panel de Vercel.
- Nada de esto bloquea el despliegue actual: sin estas variables, la API
  y la web funcionan exactamente igual que antes de este paquete.

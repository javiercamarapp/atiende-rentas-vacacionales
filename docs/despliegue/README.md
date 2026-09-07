# Despliegue — guía paso a paso (Lote 3.3)

Esta guía la ejecuta el USUARIO (o quien tenga las credenciales de Vercel/
Stripe/Google/SMTP) — ningún agente de este repo tiene sesión de Vercel
productiva ni compra nada por su cuenta. Ver también:
`docs/despliegue/google-oauth.md` (Google Sign-In, Lote 3.2) y
`docs/despliegue/canales-mexico.md` (canales de distribución, Lote 3.4).

## 0. Qué ya está hecho y verificado en este repo

- `vercel.json` (raíz): proyecto único de Vercel que sirve `apps/web`
  como sitio estático y `apps/api` como una Función serverless de Node.js
  bajo `/api/*` — MISMO ORIGEN para ambos (sin CORS cross-origin, una sola
  cookie de sesión).
- `api/index.js` (raíz, **generado**, no se edita a mano ni se versiona —
  ver `.gitignore`): bundle de `apps/api/api/index.ts` producido por
  `npm run build:api-vercel` (`deploy/build-api-vercel.mjs`, esbuild). Ver
  el comentario de cabecera de ese script para el porqué del empaquetado
  explícito (los paquetes internos del monorepo son TypeScript sin
  compilar; el "Node.js Builder" zero-config de Vercel no los transpila).
- Fail-closed en el borde: si faltan `JWT_SECRET`/`CANAL_CIFRADO_CLAVES`,
  la función NUNCA revienta con 500 — `GET /api/health` responde 200 con
  `{"status":"sin_configurar", ...}` y el resto de rutas responde 503. Sin
  `DATABASE_URL`, `GET /api/health` responde `{"status":"ok",
  "baseDeDatos":"sin_configurar"}` (chequeo barato, sin abrir conexión) —
  `GET /api/health/detallado` sí abre una conexión real.
- **Verificado con un despliegue real a Preview** (no producción) el
  2026-09-06: `npx vercel build` + `npx vercel deploy --prebuilt` sin
  ningún secreto configurado → `/api/health` 200 honesto; con
  `JWT_SECRET`/`CANAL_CIFRADO_CLAVES` de prueba configurados y sin
  `DATABASE_URL` → `/api/health` 200 con `baseDeDatos: "sin_configurar"`;
  la web estática carga y sirve `index.html` con normalidad. Iterar hasta
  aquí costó 3 rondas de depuración real (documentadas en los comentarios
  de `apps/api/api/index.ts` y `deploy/build-api-vercel.mjs`): resolución
  de módulos TS de los paquetes del workspace, formato ESM vs CJS del
  bundle, y la firma exacta que exige el launcher Node.js de Vercel
  (`export const fetch`, NO `export default`).

## 1. Primer deploy en Vercel

```bash
npx vercel login              # sesión con la cuenta/equipo que vaya a ser dueño del proyecto
npx vercel link               # vincula esta carpeta al proyecto de Vercel (crea uno si no existe)
```

Esto genera `.vercel/project.json` (ignorado por git — cada quien lo
vincula localmente o en CI con `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`, ver
§4).

## 2. Crear el Postgres gestionado

Cualquiera de estas tres opciones funciona igual de bien — este repo NO
elige una cuenta por ti; documento las tres. Las migraciones son las
mismas (`packages/db/src/migrations/`, `pg` estándar), así que cambiar de
proveedor después es solo cambiar `DATABASE_URL`.

### Opción A — Neon vía Vercel Marketplace (más simple si ya usas Vercel)

1. Panel de Vercel → tu proyecto → pestaña **Storage** → **Create
   Database** → **Neon** (Postgres serverless).
2. Vercel inyecta `DATABASE_URL` automáticamente como variable de entorno
   del proyecto (Production + Preview, según elijas) — no hace falta
   copiarla a mano.
3. Aun así, define explícitamente el resto de variables de §3 (Neon solo
   resuelve `DATABASE_URL`).

### Opción B — Supabase

1. Crea un proyecto en <https://supabase.com> → **Project Settings** →
   **Database** → copia la cadena "Connection string" en modo **Session**
   (puerto 5432, no el *pooler* de puerto 6543: las migraciones abren
   transacciones largas que el modo *transaction pooling* corta).
2. Pega esa cadena como `DATABASE_URL` en Vercel (§3).

### Opción C — Postgres propio (cualquier VPS/nube con Postgres 16+)

1. Crea la base de datos y un rol de aplicación (`app_rv`, ver
   `packages/db/src/migrations/0012_rol_aplicacion.ts`) — **nunca** uses
   el superusuario como `DATABASE_URL` de runtime: un superusuario ignora
   RLS sin importar `FORCE ROW LEVEL SECURITY` (D-020,
   `apps/api/src/db/pool.ts`).
2. Asegúrate de que acepte conexiones TLS entrantes desde internet (los
   runtimes de Vercel no tienen IP fija) — añade `?sslmode=require` a la
   cadena si tu proveedor lo exige.

Con cualquiera de las tres: corre `npm run db:migrar:desplegar` (ver §5)
apuntando `DATABASE_URL` a esa base antes de la primera promoción a
producción.

## 3. Variables de entorno exactas (Vercel → Project Settings → Environment Variables)

Cárgalas por ambiente (**Production** / **Preview** / **Development**) —
un valor de prueba en Preview y el real en Production es la separación
recomendada.

| Variable | Obligatoria | Notas |
|---|---|---|
| `DATABASE_URL` | Sí en producción real (fail-closed suave: sin ella, `/api/health` reporta `baseDeDatos: "sin_configurar"` en vez de 500, pero ninguna ruta que toque datos funciona) | Rol `app_rv`, nunca el superusuario — §2 |
| `JWT_SECRET` | Sí (fail-closed duro: sin ella, la función entera responde 503 salvo `/health`) | ≥32 caracteres — genera con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CANAL_CIFRADO_CLAVES` | Sí (mismo fail-closed duro) | Formato `v1:<32 bytes base64>` — genera con `node -e "console.log('v1:' + require('crypto').randomBytes(32).toString('base64'))"` |
| `ATIENDE_ENTORNO` / `NODE_ENV` | Recomendado explícito | Vercel fija `NODE_ENV=production` automáticamente en Preview y Production por igual — usa `APP_ENV_LABEL` (abajo) para distinguirlos en la UI/healthcheck, nunca dependas de `NODE_ENV` para eso |
| `APP_ENV_LABEL` | Recomendado | `produccion` en Production, `vista-previa` (o similar) en Preview — es solo la etiqueta que muestra `GET /health`, no afecta ninguna lógica de seguridad |
| `WEB_ORIGIN` | Sí | El dominio final de la web, p. ej. `https://atiende-rentas-vacacionales.vercel.app` o tu dominio propio (§7) |
| `API_PUBLIC_URL` | Sí | `https://<tu-dominio>/api` — usada para componer la URL absoluta del feed `.ics` (`GET /export-ical`) |
| `GOOGLE_OAUTH_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` | No | Sin las tres, el botón de Google aparece deshabilitado — nunca 500. Ver `docs/despliegue/google-oauth.md` |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_FROM` | No | Sin `SMTP_HOST`, se usa el adaptador de correo simulado (nunca envía correo real) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | No | Sin AMBAS, `apps/api/src/routes/facturacion.ts` monta únicamente `PagosSimulado` — nunca llama a Stripe real ni monta el webhook real. Ver §6 |
| `POLITICA_CONTRASENA_HIBP` | No | `false` por defecto — depende de red externa (HaveIBeenPwned), nunca actives esto en Preview |

No definas ninguna de estas como cadena vacía (`""`) a propósito — para
`NODE_ENV` en particular eso NO equivale a omitirla (ver el comentario
correspondiente en `apps/api/.env.example`): una variable definida pero
vacía se trata como un valor productivo desconocido (fail-closed), igual
de estricto que si no la reconociera en absoluto.

## 4. Conectar GitHub Actions con Vercel (despliegue automático en cada push a `main`)

`.github/workflows/deploy.yml` despliega a producción en cada push a
`main` — **solo** si el repositorio de GitHub tiene estos tres secrets
(Settings → Secrets and variables → Actions):

- `VERCEL_TOKEN` — Vercel → Account Settings → Tokens → Create.
- `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` — están en `.vercel/project.json`
  tras el `vercel link` de §1 (`orgId`/`projectId`).
- `DATABASE_URL` (opcional, para que el workflow también corra
  `npm run db:migrar:desplegar` antes del deploy).

Sin esos secrets, el job se OMITE con un `::warning::` explícito en el
resumen del run — nunca falla en rojo el pipeline de CI solo porque Vercel
todavía no está conectado.

## 5. Migraciones — idempotentes, nunca automáticas en un build de Preview

```bash
DATABASE_URL="postgres://…" npm run db:migrar:desplegar   # aplica lo pendiente
DATABASE_URL="postgres://…" npm run db:verificar-migraciones  # solo lectura, detecta drift
```

`db:migrar:desplegar` (`scripts/migrar-desplegar.ts`) reusa el mismo
runner con protección de drift por hash de contenido que las pruebas de
integración (`packages/db/src/runner/migrar.ts`, D-DSD-14): un `id` ya
aplicado con contenido distinto al del catálogo actual hace fallar el
comando en vez de reaplicar o ignorar en silencio. A propósito **no**
está en `vercel.json` (`buildCommand`) — correr migraciones en cada build
de Preview de cualquier PR contra un Postgres compartido sería peligroso.
Córrelo a mano en el primer deploy y en `.github/workflows/deploy.yml`
(§4) para los siguientes.

## 6. Primer deploy — pasos exactos

```bash
npm ci
npx vercel login
npx vercel link
# … crear el Postgres gestionado (§2) y cargar TODAS las variables de §3 en
#   Vercel → Project Settings → Environment Variables (Production) …
DATABASE_URL="<la misma cadena de Production>" npm run db:migrar:desplegar
npx vercel build --prod            # equivalente local exacto de lo que Vercel construye
npx vercel deploy --prebuilt --prod
```

Credenciales que aporta el usuario (nunca están en este repo): la sesión
de Vercel (`vercel login`), la cadena de conexión del Postgres elegido
(§2), y opcionalmente las de Google OAuth / SMTP / Stripe si se activan
esos módulos.

## 7. Dominio propio

Vercel → Project Settings → Domains → agrega tu dominio y sigue las
instrucciones de DNS (CNAME o los registros A que Vercel indique).
Actualiza `WEB_ORIGIN`/`API_PUBLIC_URL`/`GOOGLE_OAUTH_REDIRECT_URI` al
dominio final y vuelve a desplegar.

## 8. Alternativa: VPS propio con Docker

Ver `deploy/Dockerfile` + `deploy/docker-compose.yml` (imágenes `api`,
`web`, `postgres`):

```bash
cp deploy/.env.docker.example deploy/.env.docker   # rellenar secretos
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.docker up -d --build
```

Migra automáticamente al arrancar `api` (idempotente, mismo runner de
§5). Sirve la web con `nginx` en el puerto 8080, proxeando `/api/*` al
contenedor `api` — mismo patrón de "mismo origen" que en Vercel. No
verificado con una corrida real de `docker compose` en este entorno (sin
demonio de Docker disponible aquí) — revísalo en un ambiente con Docker
antes de confiar en él para producción.

## 8.5. Cron de sincronización iCal

`GET /api/internal/cron/sync-ical` (registrado en `vercel.json` →
`crons`, cada 15 minutos) dispara el motor de sync iCal para los canales
activos de todos los tenants — sin esto, los calendarios importados solo
se refrescan bajo `POST /canales/:id/sync` manual, nunca solos. Requiere
`CRON_SECRET` (Vercel lo envía automático como `Authorization: Bearer` si
la variable existe en el proyecto) y `CRON_SYNC_SUPERADMIN_ID` — ver
`docs/despliegue/cron-sync.md` para el diseño completo, el tradeoff de
seguridad de cómo lee canales cross-tenant (requiere revisión humana
antes de producción) y cómo probarlo con `curl`. **Plan Hobby de Vercel
no ejecuta este `schedule` cada 15 minutos** (lo agrupa a ~1 vez al día
sin avisar) — requiere plan Pro o superior, ver `docs/despliegue/cron-sync.md`
§"Requisito de plan de Vercel".

## 9. Checklist de producción

- [ ] `DATABASE_URL` apunta al rol `app_rv` (nunca al superusuario de
      migraciones) — D-020.
- [ ] `JWT_SECRET`/`CANAL_CIFRADO_CLAVES` generados con el comando de §3,
      guardados en un gestor de secretos (no solo en el panel de Vercel).
- [ ] Backups automáticos habilitados en el proveedor de Postgres elegido
      (Neon/Supabase tienen point-in-time recovery integrado; un Postgres
      propio necesita `pg_dump`/WAL archiving configurado a mano).
- [ ] Rotación de secretos: agenda de rotación de `JWT_SECRET` (invalida
      todas las sesiones activas) y `CANAL_CIFRADO_CLAVES` (requiere
      re-cifrar credenciales de canal existentes — sin herramienta
      automática todavía, ver Backlog).
- [ ] Alertas: `GET /health/detallado` y `GET /metrics` (Prometheus) ya
      existen (Lote 10) — conéctalos a tu monitor externo (UptimeRobot,
      Better Stack, Grafana Cloud, etc.); este repo no incluye un servicio
      de monitoreo propio.
- [ ] Runbooks existentes: `docs/runbooks/` (si existe en tu checkout) —
      revisar antes de la primera incidencia real.
- [ ] `CRON_SECRET` (§8.5) generado y configurado en Vercel — sin él, el
      cron de sync iCal permanece inactivo (503, fail-closed), nunca falla
      "silenciosamente" en producción. `CRON_SYNC_SUPERADMIN_ID` apunta a
      un superadmin real y activo — **revisar `docs/despliegue/cron-sync.md`
      antes de activarlo**: el diseño de acceso cross-tenant tiene un
      tradeoff de seguridad que requiere aprobación explícita.
- [ ] Plan de Vercel del proyecto soporta el `schedule` de `crons` en
      `vercel.json` (cada 15 minutos requiere Pro o superior — Hobby lo
      agrupa a ~1 vez al día sin error visible) — confirmar en Project
      Settings → Cron Jobs antes de dar por hecho que el cron corre con
      la frecuencia esperada.
- [ ] `APP_ENV_LABEL=produccion` en Production (nunca "desarrollo") —
      D-019/DEFINICION-DE-HECHO §1.
- [ ] Stripe: si se activa (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`),
      confirmar que el webhook apunta a `https://<tu-dominio>/api/facturacion/webhooks/stripe`
      y que el "Signing secret" del webhook coincide con
      `STRIPE_WEBHOOK_SECRET` — ver `docs/despliegue/README.md` §6 de
      `packages/domain/src/facturacion/` para el contrato exacto.

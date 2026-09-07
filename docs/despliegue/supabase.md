# Desplegar contra Supabase (Lote 3.3)

Guía específica de Supabase — complementa `docs/despliegue/README.md`
(§2 "Opción B — Supabase" enlaza aquí). El proyecto de Supabase de este
repo **todavía no existe**: esta guía deja todo listo para que, en cuanto
alguien con acceso lo cree, solo haga falta pegar las URLs en las
variables de entorno de abajo — nada de código pendiente.

## 0. Resumen de la incompatibilidad importante (léelo antes de elegir URLs)

Supabase expone Postgres detrás de **tres** cadenas de conexión distintas
por proyecto (Project Settings → Database → Connection string):

| # | Nombre en el panel de Supabase | Puerto | Modo |
|---|---|---|---|
| 1 | Direct connection | 5432 | Sin pooler — una conexión TCP real por cliente |
| 2 | Session pooler (Supavisor) | 5432 (vía IPv4) | Sesión: el backend físico queda ligado al cliente mientras dure la conexión |
| 3 | Transaction pooler (Supavisor) | 6543 | Transacción: el backend físico se reasigna al terminar CADA transacción |

`apps/api/src/db/contexto.ts` fija el contexto de RLS de esta API con:

```sql
SELECT set_config('app.tenant_id', $1, false)  -- is_local = false = alcance de SESIÓN
```

a propósito (el dominio hace sus propios `COMMIT` internos sobre la misma
conexión — con `SET LOCAL`, es decir alcance de transacción, el primer
`COMMIT` interno borraría el contexto antes de que la función termine).
Ese alcance de sesión **no sobrevive de forma confiable** a la opción 3
(*Transaction Pooler*, puerto 6543): en cuanto una transacción termina,
Supavisor puede devolver el backend físico al pool y darle al mismo
cliente uno DISTINTO en la siguiente consulta — el contexto de RLS
fijado se perdería en silencio (fail-closed: RLS negaría acceso a datos
legítimos, no filtraría datos de otro tenant, pero seguiría siendo un
bug funcional real).

**Conclusión — qué URL va en cada variable:**

- `DATABASE_URL` (pool de runtime de `apps/api`, cuando se conecte al
  helper de `packages/db/src/runner/conexionServerless.ts` — ver nota al
  final de este documento) → opción **1** o **2**. NUNCA la opción 3
  mientras el contexto de RLS siga siendo de sesión.
- `DATABASE_URL_DIRECT` (solo migraciones, `scripts/db-migrate-prod.mjs`)
  → siempre opción **1** (conexión directa) — Supabase mismo recomienda
  la conexión directa para migraciones (DDL, sesiones más largas que una
  consulta suelta).

Los advisory locks que usa esta API (`packages/domain/src/aplicacion/
ejecutor.ts`, `apps/api/src/routes/finanzas.ts`) usan
`pg_advisory_XACT_lock` — **transaccionales**, liberados automáticamente
al `COMMIT`/`ROLLBACK` de esa misma transacción — esos SÍ son compatibles
con el *Transaction Pooler*. No son la razón del bloqueo de arriba; el
contexto de RLS de sesión sí lo es.

## 1. Crear el proyecto

1. <https://supabase.com/dashboard> → **New project** → elige
   organización, nombre, contraseña de la base de datos (guárdala en un
   gestor de secretos, no en texto plano) y región (la más cercana a
   donde corran las funciones de Vercel).
2. Espera a que termine de aprovisionar (unos minutos).

## 2. Copiar las cadenas de conexión

**Project Settings → Database → Connection string.** Copia:

- **Direct connection** → usar para `DATABASE_URL_DIRECT` (y, si no vas a
  usar el Session Pooler, también para `DATABASE_URL`).
- **Session pooler** → usar para `DATABASE_URL` si tu red de despliegue
  prefiere/exige IPv4 (Vercel Functions sí puede necesitar esto; la
  conexión directa es IPv6 en proyectos nuevos de Supabase).

Sustituye `[YOUR-PASSWORD]` en la cadena por la contraseña real del paso
1. Ambas cadenas empiezan con `postgres://postgres...` (Direct) o
`postgres://postgres.<ref>...` (poolers) — el `.env.example` de
`apps/api` documenta el formato completo de las tres.

## 3. Aplicar las migraciones

Desde una máquina con acceso a internet y `npm ci` ya corrido en este
repo:

```bash
DATABASE_URL_DIRECT="postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
  npx tsx scripts/db-migrate-prod.mjs
```

Salida esperada la primera vez: `OK — N migración(es) nueva(s)
aplicada(s): 0001_extensiones, ...`. Volver a correrlo (mismo comando) es
seguro — es idempotente: `OK — N migración(es) en el catálogo, ninguna
nueva por aplicar.`

Alternativa (ya existía antes de este documento, sigue funcionando,
sin SSL propio — únicamente úsala si tu red no necesita TLS explícito o
si `DATABASE_SSL` ya viene resuelto por otra vía):
`DATABASE_URL="<misma URL>" npm run db:migrar:desplegar`.

**Como paso de CI explícito** (nunca dentro de `vercel.json`/
`buildCommand` — ver `docs/despliegue/README.md` §5 sobre por qué):
agrega `DATABASE_URL_DIRECT` como secret del repo y un paso equivalente
al de `.github/workflows/deploy.yml` que ya existe para
`db:migrar:desplegar`, apuntando en cambio a
`npx tsx scripts/db-migrate-prod.mjs` — cambio de workflow que este
paquete de trabajo NO aplica (`.github/workflows/*` está protegido);
queda como siguiente paso explícito para quien integre.

## 4. Configurar las variables en Vercel

```bash
npx vercel env add DATABASE_URL production
# pega la cadena de la opción 1 o 2 (§2) cuando lo pida

npx vercel env add DATABASE_URL_DIRECT production
# pega la cadena de la opción 1 (Direct connection)

# Opcional — normalmente no hace falta, TLS se detecta solo por el host:
# npx vercel env add DATABASE_SSL production   # valor: require
```

Repite para el ambiente `preview` si vas a probar contra el mismo
proyecto de Supabase desde Preview deployments (o crea un proyecto de
Supabase separado para Preview — recomendado si el plan lo permite, para
no mezclar datos de prueba con producción).

## 5. Verificar `GET /api/health`

Tras el siguiente deploy (`npx vercel deploy --prod` o el push a `main`
que dispare `.github/workflows/deploy.yml`):

```bash
curl -s https://<tu-dominio>/api/health | jq
```

Con `DATABASE_URL` configurada y alcanzable, el campo `baseDeDatos` debe
leer `"ok"` (con `migracionesPendientes` en 0 si ya corriste el paso 3).
Si lee `"error"`, el campo `baseDeDatosMotivo` trae un motivo corto y
clasificado (`"credenciales inválidas"`, `"host no resuelve (DNS)"`,
`"timeout tras 2000ms"`, etc.) — nunca la cadena de conexión ni la
contraseña. Revisa primero que la variable en Vercel sea exactamente la
cadena copiada en §2 (sin `[YOUR-PASSWORD]` literal) y que el proyecto de
Supabase no esté pausado (el plan gratis pausa proyectos inactivos).

## 6. Nota sobre el pool de runtime real de `apps/api`

`packages/db/src/runner/conexionServerless.ts` (SSL automático por host +
pool pequeño para funciones + reutilización entre invocaciones vía
variable de módulo) ya está construido y probado
(`packages/db/test/runner/conexionServerless.test.ts`), y `GET /health`
ya lo usa para su propio chequeo de conexión
(`packages/db/src/runner/saludBaseDeDatos.ts`). El pool de runtime que
usan las rutas de negocio (`apps/api/src/db/pool.ts`,
`apps/api/src/app.ts` línea del `new pg.Pool(...)`) **todavía construye
el `Pool` a mano, sin este helper** — quedó fuera del alcance de archivos
mutables de este paquete de trabajo (`docs/PROGRAMA-PUNTA-A-PUNTA.md`,
paquete D solo puede tocar el campo `baseDeDatos` de `apps/api/src/
app.ts`). Migrar esos dos archivos a `crearOpcionesPoolServerless`/
`obtenerPoolServerlessCompartido` de `packages/db` es el siguiente paso
natural, sin el cual la API seguirá conectando a Supabase sin TLS
explícito y sin los límites de pool pensados para serverless — funciona
igual con Direct/Session (arriba), pero no aprovecha esta preparación
todavía.

import pg from "pg";

/**
 * D-DSD-15 (Lote 3.3, Supabase): construcción de `pg.Pool` segura para
 * funciones serverless (Vercel Functions) apuntando a un Postgres
 * GESTIONADO (Supabase) en vez de al `embedded-postgres`/PGlite local de
 * pruebas. Tres responsabilidades separadas y probadas por separado:
 *
 *  1. `resolverSslPg`: decide si la conexión necesita TLS y con qué nivel
 *     de verificación de certificado.
 *  2. `construirOpcionesPoolServerless`: arma el `pg.PoolConfig` completo
 *     (SSL + límites de pool pensados para una función, no para un
 *     servidor Node de vida larga).
 *  3. `obtenerPoolServerlessCompartido`: cachea el `pg.Pool` en una
 *     variable de MÓDULO, para que invocaciones sucesivas de una misma
 *     instancia de función (mismo cold start) reutilicen las conexiones
 *     en vez de abrir una `pg.Pool` nueva por invocación — exactamente el
 *     patrón que ya usa `apps/api/api/index.ts` para el propio `Hono` app
 *     (`appCache`).
 *
 * NO se usa (todavía) para el pool de runtime real de `apps/api`
 * (`apps/api/src/db/pool.ts`/`apps/api/src/app.ts:57`) — esos dos
 * archivos quedan fuera del alcance mutable de este paquete de trabajo
 * (`docs/PROGRAMA-PUNTA-A-PUNTA.md`, paquete D). `GET /health`
 * (`apps/api/src/app.ts`) sí usa este módulo, a través de
 * `saludBaseDeDatos.ts`, para su propio chequeo de conexión — ver el
 * comentario de incompatibilidad con el *transaction pooler* de Supabase
 * más abajo, que aplica igual de fuerte al pool de runtime cuando se
 * conecte.
 *
 * INCOMPATIBILIDAD DETECTADA CON EL TRANSACTION POOLER DE SUPABASE
 * (puerto 6543, PgBouncer en modo "transaction"): `apps/api/src/db/
 * contexto.ts` fija el contexto de RLS con
 * `SELECT set_config('app.tenant_id', $1, false)` — `is_local = false`,
 * es decir alcance de SESIÓN, a propósito (el propio comentario de ese
 * archivo explica por qué: el dominio hace sus propios `COMMIT` internos
 * sobre la misma conexión, y `SET LOCAL` se borraría en el primer
 * `COMMIT`). En modo "transaction" de PgBouncer/Supavisor, el backend
 * físico se reasigna al terminar CADA transacción — el contexto de sesión
 * fijado por `fijarSesion()` podría perderse antes de que la consulta de
 * negocio se ejecute sobre otro backend, rompiendo RLS en silencio (fail
 * -closed: negaría acceso, no lo filtraría, pero seguiría siendo
 * incorrecto). Por eso: `DATABASE_URL` (pool de runtime real, cuando se
 * conecte) y `DATABASE_URL_DIRECT` (migraciones) deben usar la conexión
 * DIRECTA (puerto 5432) o el *Session Pooler* de Supabase (Supavisor en
 * modo sesión, también puerto 5432) — NUNCA el *Transaction Pooler*
 * (puerto 6543) mientras el contexto de RLS siga siendo de sesión. Los
 * advisory locks de `packages/domain/src/aplicacion/ejecutor.ts` y
 * `apps/api/src/routes/finanzas.ts` SÍ son compatibles con el modo
 * transacción (`pg_advisory_XACT_lock`, liberado automáticamente en el
 * `COMMIT`/`ROLLBACK` de esa misma transacción) — no son la razón del
 * bloqueo. Ver docs/despliegue/supabase.md.
 */

/** Sufijos de host de Supabase que implican TLS obligatorio por defecto —
 * tanto el host directo (`db.<ref>.supabase.co`) como cualquiera de los
 * dos poolers Supavisor (`*.pooler.supabase.com`, puertos 5432 o 6543):
 * Supabase nunca acepta conexiones Postgres en texto plano en ninguno de
 * los tres, la única diferencia entre ellos es el modo de pooling. */
const SUFIJOS_HOST_SUPABASE = [".supabase.co", ".pooler.supabase.com"];

/** `true` si el host de `databaseUrl` es reconocible como un endpoint de
 * Supabase (directo o cualquiera de los dos poolers). Una URL inválida (o
 * vacía) nunca lanza aquí — simplemente no reconoce el host como
 * Supabase; la validación de que la URL sea usable es responsabilidad de
 * `pg` al conectar, no de este helper. */
export function hostRequiereSslPorDefecto(databaseUrl: string): boolean {
  let host: string;
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return SUFIJOS_HOST_SUPABASE.some((sufijo) => host.endsWith(sufijo));
}

/** Subconjunto de variables de entorno que este módulo lee — documentado
 * también en `apps/api/.env.example`. Se acepta cualquier objeto
 * compatible (incluido `process.env`) para poder inyectar un entorno de
 * prueba sin tocar variables globales del proceso. */
export interface EntornoConexionDb {
  DATABASE_SSL?: string;
  DATABASE_SSL_NO_VERIFY?: string;
  DATABASE_POOL_MAX?: string;
  DATABASE_POOL_IDLE_TIMEOUT_MS?: string;
  DATABASE_POOL_CONNECTION_TIMEOUT_MS?: string;
}

/**
 * Decide la opción `ssl` a pasar a `pg.Pool`/`pg.Client`:
 *  - `DATABASE_SSL=require` fuerza TLS sin importar el host (por si algún
 *    día se usa un proveedor gestionado que no sea Supabase, o un proxy
 *    intermedio con TLS).
 *  - Si no, TLS se activa automáticamente cuando el host es reconocible
 *    como Supabase (`hostRequiereSslPorDefecto`).
 *  - Sin ninguna de las dos condiciones, se devuelve `undefined` — deja
 *    que `pg` decida (sin TLS), el caso normal de `embedded-postgres`/
 *    PGlite/Postgres local de desarrollo, que no exponen TLS.
 *
 * `DATABASE_SSL_NO_VERIFY=true` (SOLO EMERGENCIAS, desactivada por
 * defecto — nunca se activa a menos que se defina explícitamente):
 * desactiva `rejectUnauthorized`, es decir acepta CUALQUIER certificado
 * sin verificar la cadena — un downgrade real de seguridad (abre la
 * puerta a un MITM). Supabase firma con una CA pública válida, así que en
 * el caso normal NUNCA hace falta esta variable; existe solo para
 * diagnosticar en caliente un problema de cadena de certificados sin
 * quedar completamente bloqueado, documentada en
 * docs/despliegue/supabase.md con esa advertencia explícita.
 */
export function resolverSslPg(
  databaseUrl: string,
  env: EntornoConexionDb = process.env,
): pg.PoolConfig["ssl"] {
  const forzadoPorVariable = env.DATABASE_SSL === "require";
  const requerido = forzadoPorVariable || hostRequiereSslPorDefecto(databaseUrl);
  if (!requerido) return undefined;

  const sinVerificar = env.DATABASE_SSL_NO_VERIFY === "true";
  if (sinVerificar) {
    console.warn(
      "[db] DATABASE_SSL_NO_VERIFY=true: verificación de certificado TLS DESACTIVADA. Úsalo solo " +
        "para diagnosticar un problema de certificado en caliente — nunca lo dejes así en un " +
        "despliegue real (acepta cualquier certificado, incluido uno de un atacante en medio).",
    );
  }
  return { rejectUnauthorized: !sinVerificar };
}

/** Límites de pool pensados para una FUNCIÓN serverless (posiblemente
 * muchas instancias concurrentes, cada una con su propio pool) — no para
 * un servidor Node de vida larga con un único pool grande. Supabase
 * gestiona un número finito de conexiones por proyecto (más estrecho
 * todavía en el plan gratis); un pool "max" alto por instancia de función
 * agotaría ese límite en cuanto Vercel escale a varias instancias
 * concurrentes. Todos los valores son configurables por variable de
 * entorno para poder ajustarlos sin código si el plan de Supabase cambia. */
const POOL_MAX_POR_DEFECTO = 3;
const POOL_IDLE_TIMEOUT_MS_POR_DEFECTO = 5_000;
const POOL_CONNECTION_TIMEOUT_MS_POR_DEFECTO = 5_000;

function enteroDesdeEnv(valor: string | undefined, porDefecto: number): number {
  if (valor === undefined || valor.trim() === "") return porDefecto;
  const parseado = Number.parseInt(valor, 10);
  return Number.isFinite(parseado) && parseado > 0 ? parseado : porDefecto;
}

export function construirOpcionesPoolServerless(
  databaseUrl: string,
  env: EntornoConexionDb = process.env,
): pg.PoolConfig {
  return {
    connectionString: databaseUrl,
    ssl: resolverSslPg(databaseUrl, env),
    max: enteroDesdeEnv(env.DATABASE_POOL_MAX, POOL_MAX_POR_DEFECTO),
    idleTimeoutMillis: enteroDesdeEnv(env.DATABASE_POOL_IDLE_TIMEOUT_MS, POOL_IDLE_TIMEOUT_MS_POR_DEFECTO),
    connectionTimeoutMillis: enteroDesdeEnv(
      env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
      POOL_CONNECTION_TIMEOUT_MS_POR_DEFECTO,
    ),
  };
}

// Caché a nivel de módulo: en una función serverless "caliente" (mismo
// proceso Node reutilizado entre invocaciones), este `Map` sobrevive entre
// llamadas — evita reabrir un `pg.Pool` (y sus conexiones TCP+TLS) en cada
// invocación. Solo se crea un pool nuevo si `databaseUrl` cambia (no
// debería, en producción es una sola variable de entorno fija) o tras un
// `_reiniciarCachePoolsServerless()` explícito (pruebas).
const cachePoolsServerless = new Map<string, pg.Pool>();

export function obtenerPoolServerlessCompartido(
  databaseUrl: string,
  env: EntornoConexionDb = process.env,
): pg.Pool {
  const existente = cachePoolsServerless.get(databaseUrl);
  if (existente) return existente;
  const pool = new pg.Pool(construirOpcionesPoolServerless(databaseUrl, env));
  // Un pool de `pg` emite `error` en conexiones ociosas que el servidor
  // cierra de su lado (p. ej. Supabase reciclando una conexión inactiva) —
  // sin este listener, ese evento sería una excepción no capturada que
  // tumbaría el proceso entero (comportamiento documentado de `pg.Pool`).
  pool.on("error", (error) => {
    console.error("[db] error en conexión ociosa del pool serverless:", (error as Error).message);
  });
  cachePoolsServerless.set(databaseUrl, pool);
  return pool;
}

/** Solo para pruebas: cierra y limpia todos los pools cacheados, para que
 * cada test parta de un `pg.Pool` nuevo y no deje handles abiertos entre
 * archivos de prueba. */
export async function _reiniciarCachePoolsServerless(): Promise<void> {
  const pools = [...cachePoolsServerless.values()];
  cachePoolsServerless.clear();
  await Promise.all(pools.map((pool) => pool.end().catch(() => undefined)));
}

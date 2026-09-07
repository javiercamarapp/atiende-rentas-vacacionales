#!/usr/bin/env -S npx tsx
/**
 * `node --loader tsx scripts/db-migrate-prod.mjs` / `npx tsx
 * scripts/db-migrate-prod.mjs` (Lote 3.3, despliegue a Supabase).
 *
 * Aplica, de forma IDEMPOTENTE, todas las migraciones del catálogo que
 * todavía no estén registradas en `schema_migrations` del ambiente
 * apuntado — reusa el mismo runner con protección de drift por hash de
 * contenido que ya usan las pruebas de integración
 * (`packages/db/src/runner/migrar.ts`, D-DSD-14).
 *
 * Diferencias deliberadas frente a `scripts/migrar-desplegar.ts` (Lote
 * 3.3 original, sigue existiendo y sigue siendo lo que corre
 * `.github/workflows/deploy.yml` — archivo protegido de este paquete de
 * trabajo, no se toca):
 *
 *  1. Prioriza `DATABASE_URL_DIRECT` sobre `DATABASE_URL`. Un Postgres
 *     gestionado por Supabase expone hasta tres cadenas de conexión
 *     distintas (Project Settings → Database): conexión DIRECTA (puerto
 *     5432, sin pooler), *Session Pooler* (Supavisor en modo sesión,
 *     puerto 5432) y *Transaction Pooler* (Supavisor en modo transacción,
 *     puerto 6543). Para migraciones (DDL potencialmente largo, sesiones
 *     de vida corta pero con `BEGIN`/`COMMIT` explícitos por migración)
 *     la conexión DIRECTA es la recomendada por Supabase — ver
 *     docs/despliegue/supabase.md. Si solo existe `DATABASE_URL`
 *     (todavía no se aprovisionó una URL directa separada, o un Postgres
 *     no-Supabase sin distinción de pooler), se usa esa.
 *  2. Aplica SSL automáticamente cuando el host es reconocible como
 *     Supabase (o cuando `DATABASE_SSL=require`) — ver
 *     `packages/db/src/runner/conexionServerless.ts`. Sin esto, conectar
 *     contra Supabase con `pg.Client` a secas (como hace
 *     `migrar-desplegar.ts`) falla: Supabase exige TLS.
 *  3. Pensado para correrse como paso MANUAL o de CI EXPLÍCITO — nunca
 *     dentro de `vercel.json`/`buildCommand` (correr migraciones DDL en
 *     cada build de PREVIEW de cualquier PR, contra un Postgres
 *     compartido, sería peligroso: builds concurrentes, PRs sin revisar).
 *     Comando exacto una vez exista el proyecto Supabase:
 *
 *       DATABASE_URL_DIRECT="postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
 *         npx tsx scripts/db-migrate-prod.mjs
 *
 *     (o exportar la variable en el entorno de CI — ver
 *     docs/despliegue/supabase.md, que documenta ambas rutas: manual
 *     desde una laptop y como paso explícito de un workflow de CI).
 *
 * Sin `DATABASE_URL_DIRECT` NI `DATABASE_URL`, termina con código 0 (no
 * 1): un despliegue todavía sin Postgres gestionado aprovisionado no es
 * un error de este comando — mismo criterio que `migrar-desplegar.ts` y
 * que `GET /health` (`baseDeDatos: "sin_configurar"`).
 */
import pg from "pg";
import { aplicarMigraciones } from "../packages/db/src/runner/migrar.js";
import { migraciones } from "../packages/db/src/migrations/index.js";
import { resolverSslPg } from "../packages/db/src/runner/conexionServerless.js";

/** @typedef {import("../packages/db/src/runner/ejecutorSql.js").EjecutorSql} EjecutorSql */

/** @param {pg.Client} cliente @returns {EjecutorSql} */
function ejecutorDesdeClientePg(cliente) {
  return {
    async query(sql, params) {
      const resultado = await cliente.query(sql, params);
      return { rows: resultado.rows, rowCount: resultado.rowCount };
    },
    async exec(sql) {
      await cliente.query(sql);
    },
  };
}

/**
 * Elige qué variable de entorno usar como cadena de conexión de
 * migraciones y por qué — separado de `main()` para poder probarlo sin
 * abrir ninguna conexión real.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ databaseUrl: string | undefined; origen: "DATABASE_URL_DIRECT" | "DATABASE_URL" | null }}
 */
export function resolverUrlMigracion(env) {
  const direct = env.DATABASE_URL_DIRECT?.trim();
  if (direct) return { databaseUrl: direct, origen: "DATABASE_URL_DIRECT" };
  const normal = env.DATABASE_URL?.trim();
  if (normal) return { databaseUrl: normal, origen: "DATABASE_URL" };
  return { databaseUrl: undefined, origen: null };
}

/**
 * Ejecución completa: resuelve la URL, conecta (con SSL si corresponde),
 * aplica migraciones pendientes y cierra la conexión. Exportada para
 * pruebas de integración (contra `embedded-postgres`) sin pasar por
 * `process.exitCode`/stdout — solo el código de estado que produciría el
 * CLI.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {{ log?: (msg: string) => void; error?: (msg: string) => void }} [io]
 * @returns {Promise<number>} código de salida (0 éxito/sin URL, 1 error)
 */
export async function ejecutarMigracionProd(env, io = {}) {
  const log = io.log ?? console.log;
  const error = io.error ?? console.error;

  const { databaseUrl, origen } = resolverUrlMigracion(env);
  if (!databaseUrl) {
    log(
      "[db-migrate-prod] Ni DATABASE_URL_DIRECT ni DATABASE_URL están definidas — sin Postgres " +
        "gestionado que migrar todavía (ver docs/despliegue/supabase.md). No es un error: saliendo " +
        "con código 0.",
    );
    return 0;
  }

  const ssl = resolverSslPg(databaseUrl, env);
  log(
    `[db-migrate-prod] Conectando vía ${origen} (${ssl ? "TLS activo" : "sin TLS"})...`,
  );

  const cliente = new pg.Client({ connectionString: databaseUrl, ssl });
  try {
    await cliente.connect();
  } catch (err) {
    error(`[db-migrate-prod] No se pudo conectar: ${/** @type {Error} */ (err).message}`);
    return 1;
  }

  try {
    const ejecutor = ejecutorDesdeClientePg(cliente);
    const aplicadasEnEstaCorrida = await aplicarMigraciones(ejecutor, migraciones);
    if (aplicadasEnEstaCorrida.length === 0) {
      log(
        `[db-migrate-prod] OK — ${migraciones.length} migración(es) en el catálogo, ninguna nueva por aplicar.`,
      );
    } else {
      log(
        `[db-migrate-prod] OK — ${aplicadasEnEstaCorrida.length} migración(es) nueva(s) aplicada(s): ` +
          aplicadasEnEstaCorrida.join(", "),
      );
    }
    return 0;
  } catch (err) {
    error(`[db-migrate-prod] Migración falló: ${/** @type {Error} */ (err).message}`);
    return 1;
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

async function main() {
  return ejecutarMigracionProd(process.env);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((err) => {
      console.error("[db-migrate-prod] Error inesperado:", err);
      process.exitCode = 1;
    });
}

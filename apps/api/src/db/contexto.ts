import type { Pool, PoolClient } from "pg";
// Import por ruta de módulo, NUNCA por el barril `@atiende-rv/db` (mismo
// criterio documentado en `app.ts`): el barril reexporta también los
// motores de pruebas (`embedded-postgres`/PGlite), y un import de VALOR
// desde ahí los arrastra al bundle serverless de Vercel. Este módulo no
// tiene ninguna dependencia de esos motores, así que el import directo es
// seguro.
import type { PoolConsultable } from "@atiende-rv/db/src/runner/enrutadorLecturaReplica.js";

/**
 * Conexión por request que fija los settings de sesión que RLS necesita
 * (LOTES.md Lote 3: "conexión por request que fija los settings dentro de
 * la transacción", D-020). `set_config(nombre, valor, is_local)` es la
 * forma parametrizada de `SET`/`SET LOCAL` — evita interpolar el
 * `tenant_id`/`usuario_id` (ya verificados vía JWT, pero sin razón para
 * tratarlos como código SQL confiable) directamente en el texto del SQL.
 *
 * Se usa `is_local = false` (alcance de SESIÓN, no de transacción) a
 * propósito: las funciones de `packages/domain/src/aplicacion/reservas.ts`
 * gestionan sus PROPIAS transacciones internas (`BEGIN`/`SAVEPOINT`/
 * `COMMIT`/`ROLLBACK`) sobre el mismo `EjecutorTransaccional` — si los
 * settings fueran `SET LOCAL` (transacción), el primer `COMMIT` interno del
 * dominio los borraría antes de que la función termine de escribir en
 * `outbox_evento`. Con alcance de sesión, los settings sobreviven
 * cualquier número de transacciones anidadas-en-la-práctica sobre la misma
 * conexión — la mitigación de fuga entre requests es procedural, no de
 * Postgres: TODA ruta que hace checkout de una conexión del pool llama a
 * `fijarSesion`/`limpiarSesion` como la PRIMERA operación, antes de
 * cualquier consulta sensible a RLS, así que un valor "viejo" de una
 * request anterior reutilizando la misma conexión física nunca llega a
 * usarse para autorizar nada.
 */
export interface SesionDb {
  usuarioId: string;
  tenantId: string | null;
  rol: string;
  colaboradorNivel?: string | null;
}

export async function fijarSesion(cliente: PoolClient, sesion: SesionDb): Promise<void> {
  await cliente.query("SELECT set_config('app.user_id', $1, false)", [sesion.usuarioId]);
  await cliente.query("SELECT set_config('app.tenant_id', $1, false)", [sesion.tenantId ?? ""]);
  await cliente.query("SELECT set_config('app.rol', $1, false)", [sesion.rol]);
  await cliente.query("SELECT set_config('app.colaborador_nivel', $1, false)", [
    sesion.colaboradorNivel ?? "",
  ]);
}

/** Limpia los settings de sesión (usado antes de operaciones
 * pre-autenticación como login: ninguna fila debe ser visible vía RLS
 * "normal" hasta que se verifique la contraseña). */
export async function limpiarSesion(cliente: PoolClient): Promise<void> {
  await cliente.query(
    "SELECT set_config('app.user_id', '', false), set_config('app.tenant_id', '', false), set_config('app.rol', '', false), set_config('app.colaborador_nivel', '', false)",
  );
}

/**
 * Adquiere una conexión del pool, fija la sesión de aplicación, ejecuta
 * `fn` y SIEMPRE libera la conexión de vuelta al pool — con un `ROLLBACK`
 * defensivo antes de liberar (no-op si `fn` ya cerró su propia
 * transacción con `COMMIT`, que es el caso normal cuando `fn` delega en
 * `packages/domain`).
 */
export async function conSesion<T>(pool: Pool, sesion: SesionDb | null, fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    if (sesion) {
      await fijarSesion(cliente, sesion);
    } else {
      await limpiarSesion(cliente);
    }
    return await fn(cliente);
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}

/** Conexión cruda del pool sin fijar ni limpiar sesión — solo para
 * apps/api/src/routes/auth.ts (login/refresh), que necesita controlar a
 * mano en qué momento exacto se fija `app.user_id` (recién verificada la
 * contraseña o el hash del refresh token, nunca antes). */
export async function conConexion<T>(pool: Pool, fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    return await fn(cliente);
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * H-091/REQ-166: adapta un `pg.Pool` + una `SesionDb` ya resuelta (la de la
 * request en curso) a la interfaz `PoolConsultable` que espera
 * `EnrutadorLecturaReplica` (`packages/db/src/runner/enrutadorLecturaReplica.ts`)
 * — cada `.query()` abre su PROPIA conexión vía `conSesion` (fija los
 * mismos settings de sesión RLS que cualquier otra consulta de la API,
 * `SELECT set_config('app.tenant_id', ...)` etc.) y la libera al terminar.
 * Es intencionalmente "barato de construir": no abre ninguna conexión por
 * sí solo, solo hasta que `consultaSoloLectura` invoca `.query()` — así que
 * construir un `EnrutadorLecturaReplica` nuevo por request (necesario
 * porque la sesión RLS varía por usuario/tenant) no tiene costo de red
 * extra frente al `conSesion` directo que reemplaza. */
export function poolConsultableParaLectura(pool: Pool, sesion: SesionDb | null): PoolConsultable {
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
      const resultado = await conSesion(pool, sesion, (cliente) => cliente.query(sql, params as unknown[] | undefined));
      return { rows: resultado.rows as T[] };
    },
  };
}

/** Helper para operaciones CRUD simples (no delegadas a `packages/domain`)
 * que sí necesitan una transacción explícita de una sola pieza. */
export async function enTransaccion<T>(cliente: PoolClient, fn: () => Promise<T>): Promise<T> {
  await cliente.query("BEGIN");
  try {
    const resultado = await fn();
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

import pg from "pg";

/**
 * Pool de conexión de runtime, siempre autenticado como `app_rv`
 * (packages/db/src/migrations/0012_rol_aplicacion.ts) — nunca como el
 * superusuario de migraciones. `DATABASE_URL` debe apuntar a ese rol; si
 * apunta al superusuario, RLS quedaría completamente sin efecto (D-020:
 * un superusuario ignora RLS sin importar `FORCE`), así que se valida en
 * `apps/api/src/config/env.ts` que no se use `postgres`/`root` como
 * usuario en un entorno que no sea `test`.
 */
export function crearPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl });
}

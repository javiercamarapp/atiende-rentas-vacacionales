import type pg from "pg";
// Ruta de módulo directa (no el barril) — ver nota en apps/api/src/app.ts.
import { obtenerPoolServerlessCompartido } from "@atiende-rv/db/src/runner/conexionServerless.js";

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
  // SSL automático para hosts gestionados (Supabase), pool acotado y
  // cacheado entre invocaciones serverless — ver
  // packages/db/src/runner/conexionServerless.ts.
  return obtenerPoolServerlessCompartido(databaseUrl);
}

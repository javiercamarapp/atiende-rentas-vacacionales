import { Hono } from "hono";
import type pg from "pg";
import type { KeyringCifradoCanal } from "../../seguridad/cifrado.js";
import { crearRutasBackofficeAuditoria } from "./auditoria.js";
import { crearRutasBackofficeCuentasCanal } from "./cuentasCanal.js";
import { crearRutasBackofficeFlags } from "./flags.js";
import { crearRutasBackofficePropiedades } from "./propiedades.js";
import { crearRutasBackofficeRomperCristal } from "./romperCristal.js";
import { crearRutasBackofficeTenants } from "./tenants.js";
import { crearRutasBackofficeUnidades } from "./unidades.js";
import { crearRutasBackofficeUsuarios } from "./usuarios.js";

/**
 * Back office / superadmin (Lote 8, BACKLOG E13 + E02 H-011/H-012).
 * Carpeta exclusiva de este lote (`apps/api/src/routes/backoffice/`,
 * docs/fase2/LOTES.md). Montado en `apps/api/src/routes/index.ts` bajo
 * `/backoffice` — un único `app.route(...)` nuevo, el punto de fusión
 * documentado que cada lote añade sin reescribir el resto del archivo.
 */
export function crearRutasBackoffice(pool: pg.Pool, jwtSecret: string, keyring: KeyringCifradoCanal): Hono {
  const app = new Hono();

  app.route("/tenants", crearRutasBackofficeTenants(pool, jwtSecret));
  app.route("/romper-cristal", crearRutasBackofficeRomperCristal(pool, jwtSecret));
  app.route("/flags", crearRutasBackofficeFlags(jwtSecret));
  app.route("/propiedades", crearRutasBackofficePropiedades(pool, jwtSecret));
  app.route("/unidades", crearRutasBackofficeUnidades(pool, jwtSecret));
  app.route("/cuentas-canal", crearRutasBackofficeCuentasCanal(pool, jwtSecret, keyring));
  app.route("/usuarios", crearRutasBackofficeUsuarios(pool, jwtSecret));
  app.route("/auditoria", crearRutasBackofficeAuditoria(pool, jwtSecret));

  return app;
}

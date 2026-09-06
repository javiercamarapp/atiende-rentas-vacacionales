import { Hono } from "hono";
import type pg from "pg";
import type { KeyringCifradoCanal } from "../seguridad/cifrado.js";
import { crearRutasAgentes } from "./agentes/index.js";
import { crearRutasAuditoria } from "./auditoria.js";
import { crearRutasAuth } from "./auth.js";
import { crearRutasBackoffice } from "./backoffice/index.js";
import { crearRutasBloqueos } from "./bloqueos.js";
import { crearRutasCanales } from "./canales.js";
import { crearRutasConflictos } from "./conflictos.js";
import { crearRutasFinanzas } from "./finanzas.js";
import { crearRutasLimpieza } from "./limpieza/index.js";
import { crearRutasMensajeria } from "./mensajeria/index.js";
import { crearRutasPricing } from "./pricing.js";
import { crearRutasPropiedades } from "./propiedades.js";
import { crearRutasReportes } from "./reportes.js";
import { crearRutasReservas } from "./reservas.js";
import { crearRutasTenants } from "./tenants.js";
import { crearRutasUnidades } from "./unidades.js";
import { crearRutasUsuarios } from "./usuarios.js";

export interface DependenciasRutas {
  pool: pg.Pool;
  jwtSecret: string;
  keyring: KeyringCifradoCanal;
}

// Registro de rutas de apps/api (Lote 3: primera carga real, sobre el
// router vacío que dejó Lote 0). Punto de fusión compartido documentado en
// docs/fase2/LOTES.md (cabecera): lotes posteriores (4-10) añaden su
// propio `app.route(...)` aquí, en un commit pequeño y separado — nunca
// reescriben este archivo completo.
export function registrarRutas(app: Hono, deps: DependenciasRutas): Hono {
  const { pool, jwtSecret, keyring } = deps;

  app.route("/auth", crearRutasAuth(pool, jwtSecret));
  app.route("/tenants", crearRutasTenants(pool, jwtSecret));
  app.route("/usuarios", crearRutasUsuarios(pool, jwtSecret));
  app.route("/propiedades", crearRutasPropiedades(pool, jwtSecret));
  app.route("/unidades", crearRutasUnidades(pool, jwtSecret));
  app.route("/reservas", crearRutasReservas(pool, jwtSecret));
  app.route("/bloqueos", crearRutasBloqueos(pool, jwtSecret));
  app.route("/conflictos", crearRutasConflictos(pool, jwtSecret));
  app.route("/canales", crearRutasCanales(pool, jwtSecret, keyring));
  app.route("/auditoria", crearRutasAuditoria(pool, jwtSecret));
  app.route("/operacion", crearRutasLimpieza(pool, jwtSecret));
  app.route("/mensajeria", crearRutasMensajeria(pool, jwtSecret));
  app.route("/finanzas", crearRutasFinanzas(pool, jwtSecret));
  app.route("/pricing", crearRutasPricing(pool, jwtSecret));
  app.route("/reportes", crearRutasReportes(pool, jwtSecret));
  app.route("/backoffice", crearRutasBackoffice(pool, jwtSecret, keyring));
  app.route("/agentes", crearRutasAgentes(pool, jwtSecret));

  return app;
}

import { Hono } from "hono";
import type pg from "pg";
import type { KeyringCifradoCanal } from "../seguridad/cifrado.js";
import { crearRutasAgentes } from "./agentes/index.js";
import { crearRutasAuditoria } from "./auditoria.js";
import { crearRutasAuth, type DependenciasAuth } from "./auth.js";
import { crearRutasBackoffice } from "./backoffice/index.js";
import { crearRutasBloqueos } from "./bloqueos.js";
import { crearRutasCanales } from "./canales.js";
import { crearRutasConflictos } from "./conflictos.js";
import { crearRutasExportIcal } from "./exportIcal.js";
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
import type { OpcionesRateLimit } from "../seguridad/rateLimit.js";

export interface DependenciasRutas {
  pool: pg.Pool;
  jwtSecret: string;
  keyring: KeyringCifradoCanal;
  /** Lote 11B, corrección #3 (URL de exportación iCal): base pública de
   * esta API para componer la URL absoluta del feed que se le entrega al
   * usuario. */
  urlPublicaApi: string;
  /** S-06: límite adicional de intentos de /auth/login por email,
   * independiente del rate limit genérico por IP. */
  rateLimitLoginPorEmail: OpcionesRateLimit;
  /** Lote 3.2 (H-096+, auth extendida): resto de dependencias de
   * apps/api/src/routes/auth.ts (Google OIDC, correo, política de
   * contraseñas/bloqueo, proveedor OIDC simulado) — agrupadas aparte para
   * no inflar más esta interfaz compartida entre lotes; ver
   * `DependenciasAuth` en ./auth.ts. */
  auth: Omit<DependenciasAuth, "pool" | "jwtSecret" | "keyring" | "rateLimitLoginPorEmail">;
}

// Registro de rutas de apps/api (Lote 3: primera carga real, sobre el
// router vacío que dejó Lote 0). Punto de fusión compartido documentado en
// docs/fase2/LOTES.md (cabecera): lotes posteriores (4-10) añaden su
// propio `app.route(...)` aquí, en un commit pequeño y separado — nunca
// reescriben este archivo completo.
export function registrarRutas(app: Hono, deps: DependenciasRutas): Hono {
  const { pool, jwtSecret, keyring, urlPublicaApi, rateLimitLoginPorEmail, auth } = deps;

  app.route("/auth", crearRutasAuth({ pool, jwtSecret, keyring, rateLimitLoginPorEmail, ...auth }));
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
  app.route("/export-ical", crearRutasExportIcal(pool, jwtSecret, urlPublicaApi));

  return app;
}

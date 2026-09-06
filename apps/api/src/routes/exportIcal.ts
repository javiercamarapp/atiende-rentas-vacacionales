import crypto from "node:crypto";
import { Hono } from "hono";
import type pg from "pg";
import type { PoolClient } from "pg";
import { ErrorDominio } from "../contrato/tipos.js";
import { conSesion, enTransaccion } from "../db/contexto.js";
import type { ContextoAuth } from "../middleware/autenticacion.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { sesionDeAuth } from "../middleware/tenant.js";

interface FilaToken {
  token_export: string;
  token_export_rotado_en: string | null;
}

function generarTokenExport(): string {
  // 32 bytes aleatorios (256 bits) codificados sin caracteres reservados
  // de URL (H-024, "nunca almacena credenciales en la URL en texto
  // legible sin ser tratado como secreto") — mismo nivel que un token de
  // sesión, nunca un id/secuencial predecible.
  return crypto.randomBytes(32).toString("base64url");
}

/** `apps/web` ya conoce los canales por su código estable (`airbnb`,
 * `vrbo`, `booking` — catálogo de `pages/conectividad/catalogoCanales.ts`),
 * nunca por su uuid interno; resolver el código aquí evita inventar un
 * segundo mapeo código→id solo para el frontend. */
async function resolverUnidadYCanal(
  cliente: PoolClient,
  unidadId: string,
  canalCodigo: string,
): Promise<{ canalId: string }> {
  const unidad = await cliente.query("SELECT id FROM unidad WHERE id = $1", [unidadId]);
  if (unidad.rows.length === 0) {
    throw new ErrorDominio("recurso_no_encontrado", "Unidad no encontrada o sin permiso");
  }
  const canal = await cliente.query<{ id: string }>("SELECT id FROM canal WHERE codigo = $1", [canalCodigo]);
  if (canal.rows.length === 0) {
    throw new ErrorDominio("recurso_no_encontrado", `Canal desconocido: "${canalCodigo}"`);
  }
  return { canalId: canal.rows[0]!.id };
}

function urlDelFeed(urlPublicaApi: string, token: string): string {
  return `${urlPublicaApi.replace(/\/$/, "")}/feed/ical/${token}.ics`;
}

async function emitirOMantenerToken(
  pool: pg.Pool,
  auth: ContextoAuth,
  unidadId: string,
  canalCodigo: string,
  forzarRotacion: boolean,
): Promise<FilaToken & { canalId: string }> {
  return conSesion(pool, sesionDeAuth(auth), (cliente) =>
    enTransaccion(cliente, async () => {
      const { canalId } = await resolverUnidadYCanal(cliente, unidadId, canalCodigo);
      const tokenNuevo = generarTokenExport();
      const asignacion = forzarRotacion
        ? `token_export = EXCLUDED.token_export, token_export_rotado_en = EXCLUDED.token_export_rotado_en`
        : `token_export = COALESCE(unidad_canal_feed.token_export, EXCLUDED.token_export),
           token_export_rotado_en = COALESCE(unidad_canal_feed.token_export_rotado_en, EXCLUDED.token_export_rotado_en)`;
      const { rows } = await cliente.query<FilaToken>(
        `INSERT INTO unidad_canal_feed (unidad_id, canal_id, token_export, token_export_rotado_en)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (unidad_id, canal_id) DO UPDATE SET ${asignacion}
         RETURNING token_export, token_export_rotado_en`,
        [unidadId, canalId, tokenNuevo],
      );
      return { ...rows[0]!, canalId };
    }),
  );
}

/**
 * Endpoints AUTENTICADOS (Lote 11B, corrección #3) que entregan la URL del
 * feed `.ics` público (`GET /feed/ical/:token`, `feedIcal.ts`) por
 * unidad+canal, con token opaco rotable — nunca la credencial en sí
 * inventada por el cliente, siempre generada en el servidor
 * (`crypto.randomBytes`, nunca `Math.random`).
 *
 * Mismo rol que la política de ESCRITURA de `unidad_canal_feed`
 * (migración `0092_rls_tablas_canal_lote2.ts`: superadmin/admin_gestora) —
 * pedir la URL crea la fila de configuración si todavía no existe
 * (idempotente: no cambia un token ya emitido), así que exige el mismo
 * rol que cualquier otra escritura de configuración de canal.
 */
export function crearRutasExportIcal(pool: pg.Pool, jwtSecret: string, urlPublicaApi: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/:unidadId/:canalCodigo", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const unidadId = c.req.param("unidadId");
    const canalCodigo = c.req.param("canalCodigo");

    const fila = await emitirOMantenerToken(pool, auth, unidadId, canalCodigo, false);

    return c.json({
      unidadId,
      canalCodigo,
      token: fila.token_export,
      url: urlDelFeed(urlPublicaApi, fila.token_export),
      rotadoEn: fila.token_export_rotado_en,
    });
  });

  // POST .../rotar — invalida el token anterior de inmediato (UNIQUE en
  // `token_export`, sobrescrito atómicamente): cualquier cliente que
  // siguiera usando la URL vieja recibe 404 en la próxima solicitud al
  // feed público, nunca sigue funcionando "hasta que expire".
  app.post("/:unidadId/:canalCodigo/rotar", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const unidadId = c.req.param("unidadId");
    const canalCodigo = c.req.param("canalCodigo");

    const fila = await emitirOMantenerToken(pool, auth, unidadId, canalCodigo, true);

    return c.json({
      unidadId,
      canalCodigo,
      token: fila.token_export,
      url: urlDelFeed(urlPublicaApi, fila.token_export),
      rotadoEn: fila.token_export_rotado_en,
    });
  });

  return app;
}

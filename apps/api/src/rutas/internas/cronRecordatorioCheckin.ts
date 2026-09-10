import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type pg from "pg";
import type { PoolClient } from "pg";
import { fijarSesion, limpiarSesion } from "../../db/contexto.js";
import { construirAdaptadorCorreo } from "../../seguridad/correo.js";
import {
  ejecutarRecordatorioCheckin,
  type EjecutorRecordatorioCheckin,
  type OpcionesRecordatorioCheckin,
  type ResultadoRecordatorioCheckin,
} from "../../workers/notificacionesHuesped/recordatorioCheckin.js";

/**
 * `GET /internal/cron/recordatorio-checkin` (montada bajo `/api` en
 * Vercel, mismo criterio que `GET /internal/cron/sync-ical` — la URL real
 * es `/api/internal/cron/recordatorio-checkin`, configurada en
 * `vercel.json` `crons[].path`): dispara `ejecutarRecordatorioCheckin`
 * (`workers/notificacionesHuesped/recordatorioCheckin.ts`) sobre las
 * reservas de TODOS los tenants con check-in próximo.
 *
 * Mismo mecanismo de acceso cross-tenant que `cronSync.ts`
 * (`SERVICIO_CRON_SYNC_ICAL`, A3-DESP-01): una identidad de superadmin
 * con una DELEGACIÓN DE SERVICIO estable en `delegacion_servicio_sistema`
 * (0128_delegacion_servicio_sistema.ts) — verificada aquí, NUNCA
 * auto-otorgada (esa tabla no tiene política INSERT para `app_rv`). Un
 * operador con acceso directo a Postgres debe crear esa fila con
 * `servicio = SERVICIO_RECORDATORIO_CHECKIN_HUESPED` antes de activar
 * `CRON_RECORDATORIO_CHECKIN_SUPERADMIN_ID` en un despliegue nuevo — ver
 * `docs/despliegue/cron-sync.md` para el SQL exacto (mismo procedimiento,
 * distinto `servicio`).
 *
 * A diferencia de `cronSync.ts`, esta ruta NO escribe en
 * `auditoria_ejecucion_servicio_sistema`: esa tabla tiene columnas
 * específicas de "feeds" (`feeds_procesados`, etc.) pensadas para el cron
 * de sync — reutilizarla aquí con esas columnas para contar
 * recordatorios sería una fila engañosa para quien la audite después. El
 * resumen de cada corrida queda en el propio `{procesados: {...}}` de la
 * respuesta 200 y en logs estructurados (mismo criterio que
 * `dispatcher.ts`/`recordatorioCheckin.ts` para fallos por fila).
 *
 * `GET /recordatorio-checkin` — sin `CRON_SECRET`: 503 fail-closed. Sin/
 * con token incorrecto: 401. Con el token correcto: procesa el lote y
 * responde 200, o 500 explícito si el arranque falló (superadmin mal
 * configurado, sin delegación activa, o el pool no pudo dar una
 * conexión) — nunca un 200 fingido.
 */

export const SERVICIO_RECORDATORIO_CHECKIN_HUESPED = "recordatorio_checkin_huesped";

function tokenValido(recibido: string, esperado: string): boolean {
  const bufRecibido = Buffer.from(recibido, "utf8");
  const bufEsperado = Buffer.from(esperado, "utf8");
  if (bufRecibido.length !== bufEsperado.length) return false;
  return timingSafeEqual(bufRecibido, bufEsperado);
}

function ejecutorDeCliente(cliente: PoolClient): EjecutorRecordatorioCheckin {
  return {
    async query(sql, params) {
      const resultado = await cliente.query(sql, params as unknown[] | undefined);
      return { rows: resultado.rows };
    },
  };
}

/** Abre una conexión, fija la sesión RLS como el superadmin configurado y
 * verifica rol + delegación de servicio activa — lanza ANTES de tocar
 * cualquier tabla de negocio si algo de eso falla (fail-closed explícito,
 * mismo criterio que `crearProveedorSesionPostgres` de `cronSync.ts`). El
 * llamador es dueño de liberar la conexión devuelta (`cliente.release()`),
 * incluso en el camino feliz. */
async function abrirSesionRecordatorioCheckin(pool: pg.Pool, superadminId: string): Promise<PoolClient> {
  const cliente = await pool.connect();
  try {
    await fijarSesion(cliente, { usuarioId: superadminId, tenantId: null, rol: "superadmin" });

    const filaRol = await cliente.query<{ rol: string | null }>("SELECT rol_actual() AS rol");
    if (filaRol.rows[0]?.rol !== "superadmin") {
      throw new Error(
        `CRON_RECORDATORIO_CHECKIN_SUPERADMIN_ID ("${superadminId}") no corresponde a un usuario activo con ` +
          "rol 'superadmin' — verifica el valor configurado (SELECT id FROM usuario WHERE rol='superadmin' " +
          "AND activo).",
      );
    }

    const filaDelegacion = await cliente.query<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM delegacion_servicio_sistema
         WHERE superadmin_id = $1 AND servicio = $2 AND revocado_en IS NULL
       ) AS existe`,
      [superadminId, SERVICIO_RECORDATORIO_CHECKIN_HUESPED],
    );
    if (!filaDelegacion.rows[0]?.existe) {
      throw new Error(
        `CRON_RECORDATORIO_CHECKIN_SUPERADMIN_ID ("${superadminId}") no tiene una delegación de servicio ` +
          `activa ("${SERVICIO_RECORDATORIO_CHECKIN_HUESPED}") en delegacion_servicio_sistema — un operador ` +
          "con acceso directo a Postgres debe crear esa fila explícitamente antes de activar este cron en un " +
          "despliegue nuevo (ver docs/despliegue/cron-sync.md).",
      );
    }

    return cliente;
  } catch (error) {
    await limpiarSesion(cliente).catch(() => undefined);
    cliente.release();
    throw error;
  }
}

export interface DependenciasCronRecordatorioCheckin {
  pool: pg.Pool;
  /** Inyectable SOLO para pruebas (`test/notificaciones/
   * cronRecordatorioCheckin.test.ts`): por defecto abre la sesión
   * delegada real y llama a `ejecutarRecordatorioCheckin`. */
  procesar?: () => Promise<ResultadoRecordatorioCheckin>;
  opcionesProcesar?: Omit<OpcionesRecordatorioCheckin, "ejecutor" | "correo" | "urlPublicaWeb">;
}

export function crearRutasCronRecordatorioCheckin(deps: DependenciasCronRecordatorioCheckin): Hono {
  const app = new Hono();

  app.get("/recordatorio-checkin", async (c) => {
    const secreto = process.env.CRON_SECRET;
    if (!secreto) {
      return c.json(
        {
          error: {
            codigo: "servicio_no_configurado",
            mensaje:
              "CRON_SECRET no está configurado en este despliegue — el cron de recordatorio de check-in " +
              "permanece inactivo (fail-closed).",
          },
        },
        503,
      );
    }

    const cabeceraAuth = c.req.header("authorization") ?? "";
    const token = cabeceraAuth.startsWith("Bearer ") ? cabeceraAuth.slice("Bearer ".length) : null;
    if (!token || !tokenValido(token, secreto)) {
      return c.json({ error: { codigo: "no_autorizado", mensaje: "Token de cron inválido o ausente." } }, 401);
    }

    let cliente: PoolClient | null = null;
    try {
      let resultado: ResultadoRecordatorioCheckin;
      if (deps.procesar) {
        resultado = await deps.procesar();
      } else {
        const superadminId = process.env.CRON_RECORDATORIO_CHECKIN_SUPERADMIN_ID?.trim() || null;
        if (!superadminId) {
          throw new Error(
            "CRON_RECORDATORIO_CHECKIN_SUPERADMIN_ID no está configurado: el cron de recordatorio de " +
              "check-in necesita el id de un usuario superadmin activo con delegación de servicio para leer " +
              "reservas de TODOS los tenants respetando RLS.",
          );
        }
        cliente = await abrirSesionRecordatorioCheckin(deps.pool, superadminId);
        resultado = await ejecutarRecordatorioCheckin({
          ejecutor: ejecutorDeCliente(cliente),
          correo: construirAdaptadorCorreo(process.env),
          urlPublicaWeb: process.env.WEB_ORIGIN ?? "http://localhost:5173",
          ...deps.opcionesProcesar,
        });
      }
      return c.json({ procesados: resultado }, 200);
    } catch (error) {
      console.error(
        JSON.stringify({
          error: "cron_recordatorio_checkin_no_disponible",
          mensaje: error instanceof Error ? error.message : String(error),
        }),
      );
      return c.json(
        {
          error: {
            codigo: "cron_recordatorio_checkin_no_disponible",
            mensaje: "El cron de recordatorio de check-in no pudo ejecutarse — ver logs del servidor.",
          },
        },
        500,
      );
    } finally {
      if (cliente) {
        await limpiarSesion(cliente).catch(() => undefined);
        (cliente as PoolClient).release();
      }
    }
  });

  return app;
}

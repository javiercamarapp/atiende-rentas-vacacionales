import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type pg from "pg";
import type { PoolClient } from "pg";
import { fijarSesion, limpiarSesion } from "../../db/contexto.js";
import {
  ejecutarLiberacionInstruccionesAcceso,
  type EjecutorLiberacionInstruccionesAcceso,
  type OpcionesLiberacionInstruccionesAcceso,
  type ResultadoLiberacionInstruccionesAcceso,
} from "../../workers/notificacionesHuesped/liberacionInstruccionesAcceso.js";

/**
 * `GET /internal/cron/liberacion-instrucciones-acceso` (montada bajo
 * `/api` en Vercel — la URL real es `/api/internal/cron/liberacion-
 * instrucciones-acceso`, configurada en `vercel.json` `crons[].path`):
 * dispara `ejecutarLiberacionInstruccionesAcceso`
 * (`workers/notificacionesHuesped/liberacionInstruccionesAcceso.ts`, REQ-095)
 * sobre las reservas de TODOS los tenants con check-in en la ventana de
 * T-48h.
 *
 * Mismo mecanismo de acceso cross-tenant que `cronRecordatorioCheckin.ts`/
 * `cronSync.ts` (A3-DESP-01): una identidad de superadmin con una
 * DELEGACIÓN DE SERVICIO estable en `delegacion_servicio_sistema`
 * (0128_delegacion_servicio_sistema.ts) — verificada aquí, NUNCA
 * auto-otorgada. Un operador con acceso directo a Postgres debe crear esa
 * fila con `servicio = SERVICIO_LIBERACION_INSTRUCCIONES_ACCESO` antes de
 * activar `CRON_LIBERACION_INSTRUCCIONES_ACCESO_SUPERADMIN_ID` en un
 * despliegue nuevo — ver `docs/despliegue/cron-sync.md` para el SQL exacto
 * (mismo procedimiento, distinto `servicio`).
 *
 * Corre más seguido que el recordatorio de correo (pensado cada hora,
 * igual que `recordatorio-checkin`) porque la ventana que le importa es de
 * HORAS (T-48h), no de días — una corrida que se salta una hora todavía
 * encuentra la reserva pendiente en la siguiente mientras siga dentro de
 * la ventana `[T-48h, T-checkin)`.
 *
 * `GET /liberacion-instrucciones-acceso` — sin `CRON_SECRET`: 503
 * fail-closed. Sin/con token incorrecto: 401. Con el token correcto:
 * procesa el lote y responde 200, o 500 explícito si el arranque falló
 * (superadmin mal configurado, sin delegación activa, o el pool no pudo
 * dar una conexión) — nunca un 200 fingido.
 */

export const SERVICIO_LIBERACION_INSTRUCCIONES_ACCESO = "liberacion_instrucciones_acceso";

function tokenValido(recibido: string, esperado: string): boolean {
  const bufRecibido = Buffer.from(recibido, "utf8");
  const bufEsperado = Buffer.from(esperado, "utf8");
  if (bufRecibido.length !== bufEsperado.length) return false;
  return timingSafeEqual(bufRecibido, bufEsperado);
}

function ejecutorDeCliente(cliente: PoolClient): EjecutorLiberacionInstruccionesAcceso {
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
 * mismo criterio que `abrirSesionRecordatorioCheckin` de
 * `cronRecordatorioCheckin.ts`). El llamador es dueño de liberar la
 * conexión devuelta (`cliente.release()`), incluso en el camino feliz. */
async function abrirSesionLiberacionInstruccionesAcceso(pool: pg.Pool, superadminId: string): Promise<PoolClient> {
  const cliente = await pool.connect();
  try {
    await fijarSesion(cliente, { usuarioId: superadminId, tenantId: null, rol: "superadmin" });

    const filaRol = await cliente.query<{ rol: string | null }>("SELECT rol_actual() AS rol");
    if (filaRol.rows[0]?.rol !== "superadmin") {
      throw new Error(
        `CRON_LIBERACION_INSTRUCCIONES_ACCESO_SUPERADMIN_ID ("${superadminId}") no corresponde a un usuario ` +
          "activo con rol 'superadmin' — verifica el valor configurado (SELECT id FROM usuario WHERE " +
          "rol='superadmin' AND activo).",
      );
    }

    const filaDelegacion = await cliente.query<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM delegacion_servicio_sistema
         WHERE superadmin_id = $1 AND servicio = $2 AND revocado_en IS NULL
       ) AS existe`,
      [superadminId, SERVICIO_LIBERACION_INSTRUCCIONES_ACCESO],
    );
    if (!filaDelegacion.rows[0]?.existe) {
      throw new Error(
        `CRON_LIBERACION_INSTRUCCIONES_ACCESO_SUPERADMIN_ID ("${superadminId}") no tiene una delegación de ` +
          `servicio activa ("${SERVICIO_LIBERACION_INSTRUCCIONES_ACCESO}") en delegacion_servicio_sistema — un ` +
          "operador con acceso directo a Postgres debe crear esa fila explícitamente antes de activar este cron " +
          "en un despliegue nuevo (ver docs/despliegue/cron-sync.md).",
      );
    }

    return cliente;
  } catch (error) {
    await limpiarSesion(cliente).catch(() => undefined);
    cliente.release();
    throw error;
  }
}

export interface DependenciasCronLiberacionInstruccionesAcceso {
  pool: pg.Pool;
  /** Inyectable SOLO para pruebas (`test/notificaciones/
   * cronLiberacionInstruccionesAcceso.test.ts`): por defecto abre la
   * sesión delegada real y llama a `ejecutarLiberacionInstruccionesAcceso`. */
  procesar?: () => Promise<ResultadoLiberacionInstruccionesAcceso>;
  opcionesProcesar?: Omit<OpcionesLiberacionInstruccionesAcceso, "ejecutor">;
}

export function crearRutasCronLiberacionInstruccionesAcceso(
  deps: DependenciasCronLiberacionInstruccionesAcceso,
): Hono {
  const app = new Hono();

  app.get("/liberacion-instrucciones-acceso", async (c) => {
    const secreto = process.env.CRON_SECRET;
    if (!secreto) {
      return c.json(
        {
          error: {
            codigo: "servicio_no_configurado",
            mensaje:
              "CRON_SECRET no está configurado en este despliegue — el cron de liberación de instrucciones de " +
              "acceso permanece inactivo (fail-closed).",
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
      let resultado: ResultadoLiberacionInstruccionesAcceso;
      if (deps.procesar) {
        resultado = await deps.procesar();
      } else {
        const superadminId = process.env.CRON_LIBERACION_INSTRUCCIONES_ACCESO_SUPERADMIN_ID?.trim() || null;
        if (!superadminId) {
          throw new Error(
            "CRON_LIBERACION_INSTRUCCIONES_ACCESO_SUPERADMIN_ID no está configurado: el cron de liberación de " +
              "instrucciones de acceso necesita el id de un usuario superadmin activo con delegación de servicio " +
              "para leer reservas de TODOS los tenants respetando RLS.",
          );
        }
        cliente = await abrirSesionLiberacionInstruccionesAcceso(deps.pool, superadminId);
        resultado = await ejecutarLiberacionInstruccionesAcceso({
          ejecutor: ejecutorDeCliente(cliente),
          ...deps.opcionesProcesar,
        });
      }
      return c.json({ procesados: resultado }, 200);
    } catch (error) {
      console.error(
        JSON.stringify({
          error: "cron_liberacion_instrucciones_acceso_no_disponible",
          mensaje: error instanceof Error ? error.message : String(error),
        }),
      );
      return c.json(
        {
          error: {
            codigo: "cron_liberacion_instrucciones_acceso_no_disponible",
            mensaje: "El cron de liberación de instrucciones de acceso no pudo ejecutarse — ver logs del servidor.",
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

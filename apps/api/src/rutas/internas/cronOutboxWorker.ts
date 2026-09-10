import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type pg from "pg";
import type { PoolClient } from "pg";
import type { EjecutorSql } from "@atiende-rv/db";
import { fijarSesion, limpiarSesion } from "../../db/contexto.js";
import { redactarPiiEnTexto } from "../../workers/observabilidad/otel.js";
import { procesarPendientesOutbox, type ResultadoProcesarLote } from "../../workers/observabilidad/outboxWorker.js";
import { aplicarEfectoOutboxProduccion } from "../../workers/observabilidad/efectosOutbox.js";
import type { RegistroMetricas } from "../../workers/observabilidad/metricas.js";

/**
 * `GET /internal/cron/outbox-worker` (montada bajo `/api` en Vercel, ver
 * `apps/api/api/index.ts:montarBajoApi` — la URL real es
 * `/api/internal/cron/outbox-worker`, la que se configura en
 * `vercel.json` `crons[].path`): dispara `procesarPendientesOutbox`
 * (motor de replay idempotente "exactamente una vez" de Lote 10,
 * `apps/api/src/workers/observabilidad/outboxWorker.ts`) con el
 * `aplicarEfecto` REAL de producción (`efectosOutbox.ts`) — antes de este
 * cron, ese motor NUNCA se invocaba fuera de sus propias pruebas: de él
 * solo se usaban, en producción, dos funciones de solo-lectura para
 * `/health/detallado` (`contarPendientesOutbox`/`edadPendienteMasViejoMs`,
 * ver `rutas.ts`), nunca `procesarPendientesOutbox` en sí. Mismo criterio
 * de protección (`CRON_SECRET`, fail-closed) que `GET /internal/cron/
 * sync-ical` y `GET /internal/cron/webhooks-retry`.
 *
 * ## Por qué esta ruta NO necesita la delegación de servicio de `cronSync.ts`
 *
 * A diferencia de `cronSync.ts` (que SÍ necesita `delegacion_servicio_
 * sistema` porque `unidad_canal_feed`/`unidad`/`propiedad` exigen
 * `is_tenant_member` para CADA tenant), la política RLS real de
 * `outbox_evento` (`0015_rls_politicas.ts`) es:
 *
 * ```sql
 * CREATE POLICY outbox_evento_select ON outbox_evento FOR SELECT
 *   USING (rol_actual() = 'superadmin');
 * ```
 *
 * — sin `is_tenant_member` de por medio: CUALQUIER superadmin activo ya
 * ve TODA la tabla, de todos los tenants, sin necesitar una delegación de
 * servicio adicional. Lo mismo aplica a `alerta`
 * (`0081_alerta.ts`, sin RLS en absoluto — igual que `webhook_saliente_
 * reintento`, tabla de infraestructura interna) y a `outbox_evento_
 * consumido_observabilidad` (`0080_...ts`, tampoco tiene RLS). Por eso
 * esta ruta solo necesita fijar la sesión con una identidad `superadmin`
 * activa y verificarlo con `rol_actual()` — sin el paso adicional de
 * `delegacion_servicio_sistema` que sí necesita `cronLimpiezaCheckout.ts`
 * (esa ruta SÍ toca `tarea_operativa`, que exige `is_tenant_member` por
 * tenant en su política INSERT).
 *
 * Reutiliza la MISMA identidad de servicio que `cronSync.ts`
 * (`CRON_SYNC_SUPERADMIN_ID` — el nombre de la variable quedó fijado por
 * el primer cron que la introdujo, pero cualquier cron interno que
 * necesite una sesión `superadmin` puede reutilizar la misma identidad ya
 * configurada en el despliegue).
 *
 * `GET /outbox-worker` — sin `CRON_SECRET` configurado: 503 fail-closed,
 * NUNCA ejecuta nada. Con `CRON_SECRET` configurado pero un
 * `Authorization: Bearer <token>` ausente o distinto: 401. Con el token
 * correcto: procesa el lote pendiente y responde 200 con
 * `{procesados, omitidosYaConsumidos}`, o 500 si el arranque del lote
 * falló (p. ej. `CRON_SYNC_SUPERADMIN_ID` mal configurado, o el propio
 * lote lanzó) — nunca un 200 fingido.
 */

function tokenValido(recibido: string, esperado: string): boolean {
  const bufRecibido = Buffer.from(recibido, "utf8");
  const bufEsperado = Buffer.from(esperado, "utf8");
  if (bufRecibido.length !== bufEsperado.length) return false;
  return timingSafeEqual(bufRecibido, bufEsperado);
}

function ejecutorDeCliente(cliente: PoolClient): EjecutorSql {
  return {
    async query(sql, params) {
      const resultado = await cliente.query(sql, params as unknown[] | undefined);
      return { rows: resultado.rows, rowCount: resultado.rowCount };
    },
    async exec(sql) {
      await cliente.query(sql);
    },
  };
}

export interface DependenciasCronOutboxWorker {
  pool: pg.Pool;
  metricas?: RegistroMetricas;
  /** Tope de eventos por corrida (por defecto 50, igual que
   * `procesarPendientesOutbox`). */
  limite?: number;
  /** Inyectable SOLO para pruebas (`test/observabilidad/
   * cronOutboxWorker.test.ts`): por defecto abre una sesión `superadmin`
   * real contra Postgres y llama a `procesarPendientesOutbox` con
   * `aplicarEfectoOutboxProduccion`. Permite probar el camino HTTP
   * completo (200 con el resultado del lote, 401/503/500) sin una base
   * de datos real — el motor de replay en sí ya se prueba directamente
   * contra `procesarPendientesOutbox`/`aplicarEfectoOutboxProduccion` en
   * `test/observabilidad/outboxWorker.test.ts` y `efectosOutbox.test.ts`. */
  procesar?: () => Promise<ResultadoProcesarLote>;
}

export function crearRutasCronOutboxWorker(deps: DependenciasCronOutboxWorker): Hono {
  const app = new Hono();

  app.get("/outbox-worker", async (c) => {
    const secreto = process.env.CRON_SECRET;
    if (!secreto) {
      return c.json(
        {
          error: {
            codigo: "servicio_no_configurado",
            mensaje:
              "CRON_SECRET no está configurado en este despliegue — el cron del worker de outbox " +
              "permanece inactivo (fail-closed). Ver docs/despliegue/cron-sync.md.",
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
      let resultado: ResultadoProcesarLote;
      if (deps.procesar) {
        resultado = await deps.procesar();
      } else {
        const superadminId = process.env.CRON_SYNC_SUPERADMIN_ID?.trim() || null;
        if (!superadminId) {
          throw new Error(
            "CRON_SYNC_SUPERADMIN_ID no está configurado: el cron del worker de outbox necesita el id de " +
              "un usuario superadmin activo ya existente para leer outbox_evento respetando RLS " +
              "(ver docs/despliegue/cron-sync.md).",
          );
        }

        cliente = await deps.pool.connect();
        await fijarSesion(cliente, { usuarioId: superadminId, tenantId: null, rol: "superadmin" });

        // Mismo criterio fail-closed que `crearProveedorSesionPostgres`
        // (`cronSync.ts`): `rol_actual()` deriva SIEMPRE de la tabla
        // `usuario` en vivo, nunca del `app.rol` que acabamos de fijar —
        // si el id configurado no existe o no es superadmin activo, esto
        // falla ANTES de tocar `outbox_evento`.
        const filaRol = await cliente.query<{ rol: string | null }>("SELECT rol_actual() AS rol");
        if (filaRol.rows[0]?.rol !== "superadmin") {
          throw new Error(
            `CRON_SYNC_SUPERADMIN_ID ("${superadminId}") no corresponde a un usuario activo con rol ` +
              "'superadmin' — verifica el valor configurado.",
          );
        }

        resultado = await procesarPendientesOutbox({
          ejecutor: ejecutorDeCliente(cliente),
          aplicarEfecto: aplicarEfectoOutboxProduccion,
          limite: deps.limite,
          metricas: deps.metricas,
        });
      }
      return c.json(resultado, 200);
    } catch (error) {
      console.error(
        JSON.stringify({
          error: "cron_outbox_worker_no_disponible",
          mensaje: redactarPiiEnTexto(error instanceof Error ? error.message : String(error)),
        }),
      );
      return c.json(
        {
          error: {
            codigo: "cron_outbox_worker_no_disponible",
            mensaje: "El cron del worker de outbox no pudo ejecutarse — ver logs del servidor.",
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

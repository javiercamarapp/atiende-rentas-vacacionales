import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type pg from "pg";
import type { PoolClient } from "pg";
import type { EjecutorSql } from "@atiende-rv/db";
import { redactarPiiEnTexto } from "../../workers/observabilidad/otel.js";
import {
  procesarReintentosWebhookPendientes,
  type OpcionesProcesarReintentosWebhook,
  type ResultadoProcesarReintentosWebhook,
} from "../../workers/notificaciones/webhookReintento.js";

/**
 * `GET /internal/cron/webhooks-retry` (montada bajo `/api` en Vercel, ver
 * `apps/api/api/index.ts:montarBajoApi` — la URL real es
 * `/api/internal/cron/webhooks-retry`, la que se configura en
 * `vercel.json` `crons[].path`): dispara
 * `procesarReintentosWebhookPendientes` (A3-NOTIF-03,
 * `apps/api/src/workers/notificaciones/webhookReintento.ts`) sobre las
 * filas de `webhook_saliente_reintento` cuya hora de reintento ya llegó,
 * de TODOS los tenants — mismo punto de entrada HTTP (protegido por
 * `CRON_SECRET`) que ya usa `GET /internal/cron/sync-ical`
 * (`cronSync.ts`).
 *
 * A diferencia de `cronSync.ts`, esta ruta NO necesita abrir una sesión
 * RLS de superadmin con delegación de servicio: `webhook_saliente_
 * reintento` y `webhook_tenant` son tablas de infraestructura interna SIN
 * RLS por diseño (ver el comentario de cabecera de
 * `0131_webhook_saliente_reintento.ts` y de `0120_notificaciones_
 * multicanal.ts`) — el propio pool `app_rv` ya puede leerlas/escribirlas
 * directamente, igual que `dispatcher.ts` al encolar. Por eso el
 * "proveedor de sesión" aquí es solo "sacar un cliente del pool y
 * envolverlo en un `EjecutorSql`", sin `fijarSesion`/verificación de
 * delegación de por medio.
 *
 * `GET /webhooks-retry` — sin `CRON_SECRET` configurado: 503 fail-closed,
 * NUNCA ejecuta nada (ni siquiera saca una conexión del pool). Con
 * `CRON_SECRET` configurado pero un `Authorization: Bearer <token>`
 * ausente o distinto: 401. Con el token correcto: procesa el lote y
 * responde 200 con `{procesadas: [...]}`, o 500 si el arranque del lote
 * falló (p. ej. el pool no pudo dar una conexión) — nunca un 200 fingido.
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

export interface DependenciasCronWebhooksReintento {
  pool: pg.Pool;
  /** Inyectable SOLO para pruebas (`test/notificaciones/
   * cronWebhooksReintento.test.ts`): por defecto saca un cliente real del
   * pool y llama a `procesarReintentosWebhookPendientes`. Permite probar
   * el camino HTTP completo (200 con el resultado del lote, 401/503 de
   * auth) sin una base de datos real — la lógica de backoff/idempotencia
   * en sí ya se prueba directamente contra `procesarReintentosWebhookPendientes`
   * en `test/notificaciones/webhookReintento.test.ts`. */
  procesar?: () => Promise<ResultadoProcesarReintentosWebhook>;
  opcionesProcesar?: Omit<OpcionesProcesarReintentosWebhook, "ejecutor">;
}

export function crearRutasCronWebhooksReintento(deps: DependenciasCronWebhooksReintento): Hono {
  const app = new Hono();

  app.get("/webhooks-retry", async (c) => {
    const secreto = process.env.CRON_SECRET;
    if (!secreto) {
      return c.json(
        {
          error: {
            codigo: "servicio_no_configurado",
            mensaje:
              "CRON_SECRET no está configurado en este despliegue — el cron de reintento de webhooks " +
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
      let resultado: ResultadoProcesarReintentosWebhook;
      if (deps.procesar) {
        resultado = await deps.procesar();
      } else {
        cliente = await deps.pool.connect();
        resultado = await procesarReintentosWebhookPendientes({
          ejecutor: ejecutorDeCliente(cliente),
          ...deps.opcionesProcesar,
        });
      }
      return c.json(resultado, 200);
    } catch (error) {
      console.error(
        JSON.stringify({
          error: "cron_webhooks_retry_no_disponible",
          mensaje: redactarPiiEnTexto(error instanceof Error ? error.message : String(error)),
        }),
      );
      return c.json(
        {
          error: {
            codigo: "cron_webhooks_retry_no_disponible",
            mensaje: "El cron de reintento de webhooks no pudo ejecutarse — ver logs del servidor.",
          },
        },
        500,
      );
    } finally {
      if (cliente) (cliente as PoolClient).release();
    }
  });

  return app;
}

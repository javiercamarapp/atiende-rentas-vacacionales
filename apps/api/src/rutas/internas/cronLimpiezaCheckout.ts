import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type pg from "pg";
import type { PoolClient } from "pg";
import type { EjecutorTransaccional } from "@atiende-rv/domain";
import { procesarEventosCheckoutPendientes, type ResultadoProcesarEventos } from "@atiende-rv/domain";
import { fijarSesion, limpiarSesion } from "../../db/contexto.js";
import { redactarPiiEnTexto } from "../../workers/observabilidad/otel.js";

/**
 * `GET /internal/cron/limpieza-checkout` (montada bajo `/api` en Vercel,
 * ver `apps/api/api/index.ts:montarBajoApi` — la URL real es
 * `/api/internal/cron/limpieza-checkout`, la que se configura en
 * `vercel.json` `crons[].path`): dispara
 * `procesarEventosCheckoutPendientes` (H-049,
 * `packages/domain/src/limpieza/aplicacion/tareas.ts`) para TODOS los
 * tenants — hasta este cron, ese consumidor SOLO corría bajo
 * `POST /operacion/tareas/procesar-eventos` (`apps/api/src/routes/
 * limpieza/tareas.ts`), el botón "Refrescar" del panel de staff: sin que
 * un humano lo presionara, un checkout confirmado (`cerrar_disponibilidad`
 * encolado en `outbox_evento`, ver `packages/domain/src/aplicacion/
 * reservas.ts`) nunca generaba su tarea de limpieza sola. Mismo criterio
 * de protección (`CRON_SECRET`, fail-closed) que `GET /internal/cron/
 * sync-ical` y `GET /internal/cron/webhooks-retry`.
 *
 * ## Por qué SÍ necesita la misma delegación de servicio que `cronSync.ts`
 *
 * `procesarEventosCheckoutPendientes` lee `outbox_evento` (visible solo a
 * `rol_actual() = 'superadmin'`, `0015_rls_politicas.ts`) e
 * inserta/actualiza `tarea_operativa` — cuya política INSERT
 * (`0036_rls_operacion.ts`) exige `is_tenant_member(usuario_actual_id(),
 * unidad_tenant_id(unidad_id))` ADEMÁS del rol. Como en `cronSync.ts`
 * (ver ese archivo para el análisis completo), un superadmin NO es
 * miembro honorario de ningún tenant ajeno desde H-075/H-076 — necesita
 * una delegación de servicio activa (`delegacion_servicio_sistema`,
 * `0128_delegacion_servicio_sistema.ts`, A3-DESP-01) para que
 * `is_tenant_member` lo reconozca como miembro de TODOS los tenants. Este
 * archivo reutiliza el MISMO mecanismo (nunca `acceso_romper_cristal`),
 * con su propio nombre de servicio (`SERVICIO_CRON_LIMPIEZA_CHECKOUT`) —
 * un superadmin puede tener delegaciones activas para varios servicios a
 * la vez, cada una es una fila independiente.
 *
 * ### Delegación de servicio del cron (acción operativa única)
 *
 * Antes de activar este cron en un despliegue nuevo, un operador con
 * acceso directo a Postgres debe crear la delegación una sola vez (mismo
 * procedimiento que `docs/despliegue/cron-sync.md` §"Delegación de
 * servicio del cron", solo cambia el nombre del servicio):
 *
 * ```sql
 * INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo)
 * VALUES (
 *   'cron_limpieza_checkout',
 *   '<CRON_SYNC_SUPERADMIN_ID>',
 *   'Delegación estable para GET /internal/cron/limpieza-checkout — genera ' ||
 *   'tareas de limpieza automáticamente al checkout, todos los tenants.'
 * );
 * ```
 *
 * Reutiliza la MISMA identidad `CRON_SYNC_SUPERADMIN_ID` que `cronSync.ts`
 * (el nombre de la variable de entorno quedó fijado por el primer cron
 * que la introdujo; nada impide que otra identidad tenga su propia
 * delegación si se prefiere rotarla por separado).
 *
 * `GET /limpieza-checkout` — sin `CRON_SECRET` configurado: 503
 * fail-closed. Con `CRON_SECRET` configurado pero token ausente o
 * distinto: 401. Con el token correcto: procesa el lote y responde 200
 * con `{procesados, tareasCreadas, tareasReprogramadas, tareasCanceladas}`,
 * o 500 explícito si el arranque de la sesión o el propio lote fallaron
 * (p. ej. sin delegación activa) — nunca un 200 fingido con
 * `{procesados: 0}` silencioso.
 */

export const SERVICIO_CRON_LIMPIEZA_CHECKOUT = "cron_limpieza_checkout";

function tokenValido(recibido: string, esperado: string): boolean {
  const bufRecibido = Buffer.from(recibido, "utf8");
  const bufEsperado = Buffer.from(esperado, "utf8");
  if (bufRecibido.length !== bufEsperado.length) return false;
  return timingSafeEqual(bufRecibido, bufEsperado);
}

function ejecutorDeCliente(cliente: PoolClient): EjecutorTransaccional {
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

export interface ResumenEjecucionLimpiezaCheckout {
  iniciadoEn: Date;
  procesados: number;
  huboError: boolean;
}

export interface SesionLimpiezaCheckout {
  ejecutor: EjecutorTransaccional;
  /** Registra el resumen en `auditoria_ejecucion_servicio_sistema`
   * (canal DEDICADO de A3-DESP-01, nunca `acceso_romper_cristal`) y
   * libera la conexión — SIEMPRE se debe llamar exactamente una vez. */
  cerrar(resumen: ResumenEjecucionLimpiezaCheckout): Promise<void>;
}

export interface OpcionesAbrirSesionLimpiezaCheckout {
  pool: pg.Pool;
  /** UUID de un usuario `usuario.rol = 'superadmin'` activo ya existente
   * — reutiliza `CRON_SYNC_SUPERADMIN_ID` (ver cabecera de este archivo).
   * `null` hace que se lance de inmediato, fail-closed. */
  superadminId: string | null;
}

/** Construye la sesión real: fija RLS como el superadmin configurado,
 * verifica que de verdad resuelve a un superadmin activo, y verifica que
 * tenga una delegación de servicio activa para
 * `SERVICIO_CRON_LIMPIEZA_CHECKOUT` — nunca la crea (mismo criterio que
 * `crearProveedorSesionPostgres` de `cronSync.ts`, ver la cabecera de
 * este archivo para el porqué). */
export async function abrirSesionLimpiezaCheckout(
  opciones: OpcionesAbrirSesionLimpiezaCheckout,
): Promise<SesionLimpiezaCheckout> {
  const { pool, superadminId } = opciones;
  if (!superadminId) {
    throw new Error(
      "CRON_SYNC_SUPERADMIN_ID no está configurado: el cron de limpieza al checkout necesita el id de un " +
        "usuario superadmin activo ya existente para leer/escribir tareas operativas de TODOS los tenants " +
        "respetando RLS (ver docs/despliegue/cron-sync.md).",
    );
  }

  const cliente = await pool.connect();
  try {
    await fijarSesion(cliente, { usuarioId: superadminId, tenantId: null, rol: "superadmin" });

    const filaRol = await cliente.query<{ rol: string | null }>("SELECT rol_actual() AS rol");
    if (filaRol.rows[0]?.rol !== "superadmin") {
      throw new Error(
        `CRON_SYNC_SUPERADMIN_ID ("${superadminId}") no corresponde a un usuario activo con rol ` +
          "'superadmin' — verifica el valor configurado (SELECT id FROM usuario WHERE rol='superadmin' " +
          "AND activo).",
      );
    }

    const filaDelegacion = await cliente.query<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM delegacion_servicio_sistema
         WHERE superadmin_id = $1 AND servicio = $2 AND revocado_en IS NULL
       ) AS existe`,
      [superadminId, SERVICIO_CRON_LIMPIEZA_CHECKOUT],
    );
    if (!filaDelegacion.rows[0]?.existe) {
      throw new Error(
        `CRON_SYNC_SUPERADMIN_ID ("${superadminId}") no tiene una delegación de servicio activa ` +
          `("${SERVICIO_CRON_LIMPIEZA_CHECKOUT}") en delegacion_servicio_sistema — ver la cabecera de ` +
          "cronLimpiezaCheckout.ts para el INSERT que un operador debe correr una sola vez.",
      );
    }

    return {
      ejecutor: ejecutorDeCliente(cliente),
      async cerrar(resumen: ResumenEjecucionLimpiezaCheckout) {
        try {
          // Canal de auditoría DEDICADO (A3-DESP-01), compartido con
          // `cronSync.ts` (misma tabla, `servicio` distinto). Las columnas
          // `tenants_alcanzados`/`feeds_error`/`feeds_pendientes` no
          // aplican a este consumidor (no agrupa por tenant y no aísla
          // errores por evento — un fallo aborta el lote completo, ver
          // `procesarEventosCheckoutPendientes`), así que se registran en
          // 0 salvo `feeds_error` cuando el lote completo falló.
          await cliente.query(
            `INSERT INTO auditoria_ejecucion_servicio_sistema
               (servicio, superadmin_id, iniciado_en, finalizado_en, tenants_alcanzados,
                feeds_procesados, feeds_error, feeds_pendientes)
             VALUES ($1, $2, $3, now(), 0, $4, $5, 0)`,
            [
              SERVICIO_CRON_LIMPIEZA_CHECKOUT,
              superadminId,
              resumen.iniciadoEn,
              resumen.procesados,
              resumen.huboError ? 1 : 0,
            ],
          );
        } finally {
          await limpiarSesion(cliente).catch(() => undefined);
          cliente.release();
        }
      },
    };
  } catch (error) {
    await limpiarSesion(cliente).catch(() => undefined);
    cliente.release();
    throw error;
  }
}

export interface DependenciasCronLimpiezaCheckout {
  pool: pg.Pool;
  /** Tope de eventos por corrida (por defecto 50, igual que
   * `procesarEventosCheckoutPendientes`). */
  limite?: number;
  /** Inyectable SOLO para pruebas (`test/observabilidad/
   * cronLimpiezaCheckout.test.ts`): por defecto abre la sesión real
   * (`abrirSesionLimpiezaCheckout`) y llama a
   * `procesarEventosCheckoutPendientes`. Permite probar el camino HTTP
   * completo (200/401/503/500) sin una base de datos real — el
   * consumidor en sí ya se prueba contra PGlite en
   * `packages/domain/test/limpieza/**` y `test/integration/limpieza.test.ts`,
   * y la sesión RLS real contra Postgres en
   * `test/integration/cronLimpiezaCheckoutRls.test.ts`. */
  procesar?: () => Promise<ResultadoProcesarEventos>;
}

export function crearRutasCronLimpiezaCheckout(deps: DependenciasCronLimpiezaCheckout): Hono {
  const app = new Hono();

  app.get("/limpieza-checkout", async (c) => {
    const secreto = process.env.CRON_SECRET;
    if (!secreto) {
      return c.json(
        {
          error: {
            codigo: "servicio_no_configurado",
            mensaje:
              "CRON_SECRET no está configurado en este despliegue — el cron de limpieza al checkout " +
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

    const iniciadoEn = new Date();
    try {
      let resultado: ResultadoProcesarEventos;
      if (deps.procesar) {
        resultado = await deps.procesar();
      } else {
        const superadminId = process.env.CRON_SYNC_SUPERADMIN_ID?.trim() || null;
        const sesion = await abrirSesionLimpiezaCheckout({ pool: deps.pool, superadminId });
        try {
          resultado = await procesarEventosCheckoutPendientes(sesion.ejecutor, deps.limite);
          await sesion.cerrar({ iniciadoEn, procesados: resultado.procesados, huboError: false });
        } catch (error) {
          await sesion.cerrar({ iniciadoEn, procesados: 0, huboError: true }).catch(() => undefined);
          throw error;
        }
      }
      return c.json(resultado, 200);
    } catch (error) {
      console.error(
        JSON.stringify({
          error: "cron_limpieza_checkout_no_disponible",
          mensaje: redactarPiiEnTexto(error instanceof Error ? error.message : String(error)),
        }),
      );
      return c.json(
        {
          error: {
            codigo: "cron_limpieza_checkout_no_disponible",
            mensaje: "El cron de limpieza al checkout no pudo ejecutarse — ver logs del servidor.",
          },
        },
        500,
      );
    }
  });

  return app;
}

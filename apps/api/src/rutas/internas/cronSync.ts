import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type pg from "pg";
import type { PoolClient } from "pg";
import type { ContextoSincronizacion } from "@atiende-rv/adapters";
import type { EjecutorTransaccional } from "@atiende-rv/domain";
import { fijarSesion, limpiarSesion } from "../../db/contexto.js";
import { ejecutarCicloSyncInstrumentado } from "../../workers/observabilidad/cicloSyncInstrumentado.js";
import { crearTrazador, redactarPiiEnTexto, type Trazador } from "../../workers/observabilidad/otel.js";
import {
  construirExportadoresDesdeEntorno,
  leerConfiguracionOtelEntorno,
} from "../../workers/observabilidad/exportadores.js";
import type { RegistroMetricas } from "../../workers/observabilidad/metricas.js";

/**
 * `GET /internal/cron/sync-ical` (montada bajo `/api` en Vercel, ver
 * `apps/api/api/index.ts:montarBajoApi` — la URL real es
 * `/api/internal/cron/sync-ical`, la que se configura en `vercel.json`
 * `crons[0].path`): dispara `ejecutarCicloSyncInstrumentado` (motor de
 * sync iCal de Lote 2, instrumentado en Lote 10) para cada canal iCal
 * activo de TODOS los tenants — hoy ese motor solo corre bajo
 * `POST /canales/:id/sync` manual (que ni siquiera lo invoca
 * directamente, solo encola un evento en `outbox_evento` que ningún
 * worker corriendo en Vercel Functions consume), así que en producción
 * los calendarios importados nunca se refrescan solos.
 *
 * ## Por qué esto no es un simple "SELECT * de todos los tenants"
 * (decisión que requiere revisión humana explícita, ver
 * docs/despliegue/cron-sync.md §"Cómo lee canales de todos los tenants")
 *
 * `apps/api` se conecta a Postgres como el rol `app_rv`
 * (`packages/db/src/migrations/0012_rol_aplicacion.ts`): `NOSUPERUSER
 * NOBYPASSRLS`, con RLS `FORCE`ado en toda tabla de negocio. Desde la
 * migración `0061_acceso_romper_cristal.ts` (H-075/H-076), un superadmin
 * DEJÓ de ser miembro honorario de cualquier tenant — `is_tenant_member`
 * exige una fila vigente en `acceso_romper_cristal` (motivo + ventana
 * temporal, auditada) para CADA tenant que quiera leer/escribir. Sin una
 * de estas concesiones, `unidad_canal_feed`/`cuenta_canal`/`unidad`/
 * `propiedad` devuelven 0 filas para cualquier identidad, superadmin
 * incluido — un cron que solo abriera una sesión de superadmin "a secas"
 * reportaría `{procesados: 0}` para siempre, silenciosamente, exactamente
 * el tipo de "finge que sincroniza pero no hace nada" que este programa
 * prohíbe.
 *
 * ## A3-DESP-01: esto YA NO usa "romper cristal" para nada rutinario
 *
 * Versión anterior de este archivo (antes de `0128_delegacion_servicio_
 * sistema.ts`): cada corrida se AUTO-OTORGABA, con la identidad
 * `CRON_SYNC_SUPERADMIN_ID`, una concesión `acceso_romper_cristal` — el
 * mecanismo reservado para acceso HUMANO de emergencia (H-075/H-076) — a
 * TODOS los tenants, la usaba, y la auto-revocaba al terminar. Repetido
 * cada 15 minutos, para siempre, eso banalizaba exactamente la señal que
 * `acceso_romper_cristal` existe para preservar rara: un humano
 * auditando el panel de "romper cristal" tenía que aprender a filtrar
 * filas del cron para no perder de vista una excepción real.
 *
 * Ahora el acceso cross-tenant rutinario del cron pasa por
 * `delegacion_servicio_sistema` (`0128_delegacion_servicio_sistema.ts`):
 * una fila estable, creada una sola vez por un operador con acceso
 * directo a Postgres (nunca por este código — la tabla no tiene política
 * INSERT/UPDATE/DELETE para `app_rv`, así que ni este archivo ni ninguna
 * otra ruta de `apps/api` puede auto-otorgarse la delegación), que
 * `is_tenant_member` reconoce como membresía de TODOS los tenants
 * mientras siga activa. `crearProveedorSesionPostgres` solo VERIFICA que
 * esa delegación exista y esté activa (`SERVICIO_CRON_SYNC_ICAL`) —
 * fail-closed si no, igual que ya fallaba si `CRON_SYNC_SUPERADMIN_ID` no
 * resolvía a un superadmin activo. `acceso_romper_cristal` queda
 * intocado por este archivo: sigue siendo, sin excepción, el canal
 * reservado para acceso humano de emergencia.
 *
 * El uso real de esa delegación SÍ queda auditado, pero en su propio
 * canal dedicado: `auditoria_ejecucion_servicio_sistema`, una fila por
 * corrida con el resumen del lote (`SesionTrabajoCron.cerrar`, ver más
 * abajo) — nunca mezclado con `acceso_romper_cristal` ni con
 * `auditoria_mutacion`. Ver `docs/despliegue/cron-sync.md` para el
 * análisis completo y cómo activar la delegación en un despliegue nuevo.
 */

// --- Contrato de canal iCal activo -----------------------------------

export interface FeedIcalActivo {
  feedId: string;
  unidadId: string;
  canalId: string;
  canalCodigo: string;
  tenantId: string;
  urlImport: string;
  zonaHorariaPropiedad: string;
  ultimaSincronizacionExitosaEn: string | null;
}

/** Resumen de UNA corrida completa del cron, pasado a `cerrar` para que
 * quede como la fila de `auditoria_ejecucion_servicio_sistema` — el canal
 * de auditoría DEDICADO al uso de la delegación de servicio (A3-DESP-01),
 * separado de `acceso_romper_cristal`. */
export interface ResumenEjecucionCron {
  iniciadoEn: Date;
  /** Tenants distintos entre los feeds REALMENTE intentados (procesados u
   * con error) — nunca incluye `pendientes` que el presupuesto de tiempo
   * ni siquiera llegó a tocar. */
  tenantsAlcanzados: number;
  feedsProcesados: number;
  feedsError: number;
  feedsPendientes: number;
}

/** Una "sesión de trabajo" ya autorizada (RLS satisfecho) que vive
 * mientras dura UNA ejecución del cron: un único `ejecutor` reutilizable
 * para leer la lista de canales y, después, aplicar el ciclo de sync de
 * cada uno — deben compartir la misma conexión/sesión de Postgres para
 * que la delegación de servicio siga vigente durante las escrituras, no
 * solo durante la lectura inicial. */
export interface SesionTrabajoCron {
  ejecutor: EjecutorTransaccional;
  listarFeedsActivos(): Promise<FeedIcalActivo[]>;
  /** Registra el resumen del lote en el canal de auditoría dedicado
   * (A3-DESP-01) y libera la conexión — SIEMPRE se debe llamar, incluso
   * si `listarFeedsActivos` o el procesamiento de canales lanzó (en ese
   * caso `resumen` refleja lo que se alcanzó a hacer antes del fallo). */
  cerrar(resumen: ResumenEjecucionCron): Promise<void>;
}

export interface ProveedorSesionCron {
  abrir(): Promise<SesionTrabajoCron>;
}

// --- Resultado del ciclo completo -------------------------------------

export interface DetalleFeedCron {
  feedId: string;
  unidadId: string;
  canalCodigo: string;
  /** Uno de `ResultadoCicloFetch` de `@atiende-rv/adapters` cuando el
   * ciclo terminó sin lanzar (incluye fallos "de negocio" ya manejados
   * por la máquina de cuarentena, p. ej. `fallo_red`/`fallo_parseo`). */
  resultado?: string;
  /** Presente solo si `ejecutarCiclo` lanzó una excepción no manejada —
   * mensaje saneado con `redactarPiiEnTexto` (S-10), nunca el stack ni el
   * error crudo. */
  error?: string;
}

export interface ResultadoCronSync {
  procesados: number;
  errores: number;
  pendientes: number;
  detalles: DetalleFeedCron[];
}

export interface ResultadoEjecutarCiclo {
  resultado: string;
}

export interface OpcionesEjecutarCronSyncIcal {
  proveedorSesion: ProveedorSesionCron;
  ejecutarCiclo: (feed: FeedIcalActivo, ejecutor: EjecutorTransaccional) => Promise<ResultadoEjecutarCiclo>;
  /** Tope de tiempo TOTAL para el lote completo (por defecto
   * `PRESUPUESTO_MS_DEFECTO`) — la función `maxDuration` de Vercel es 30s
   * (`vercel.json`); se deja margen para el cold start, la apertura de
   * conexión y la respuesta HTTP. Se revisa ANTES de empezar cada canal
   * (nunca se aborta un fetch a mitad de camino): si no alcanza el
   * tiempo, los canales restantes quedan en `pendientes` — el ORDEN
   * estable por "más desactualizado primero" (`listarFeedsActivos`) hace
   * que la siguiente invocación del cron recoja naturalmente los que
   * quedaron fuera, sin necesidad de un cursor persistido aparte. */
  presupuestoMs?: number;
  /** Reloj inyectable para pruebas deterministas. */
  ahoraMs?: () => number;
}

export const PRESUPUESTO_MS_DEFECTO = 22_000;

/** Orquestación pura, sin HTTP ni Postgres real — testeable con un
 * `proveedorSesion`/`ejecutarCiclo` simulados (mismo estilo de inyección
 * que `procesarPendientesOutbox` en `outboxWorker.ts`). Un canal que
 * lanza NUNCA aborta el resto del lote (D-DSD-06, mismo criterio que el
 * motor de sync con eventos individuales); el tope de tiempo total NUNCA
 * corta un canal a la mitad, solo evita EMPEZAR uno nuevo. */
export async function ejecutarCronSyncIcal(opciones: OpcionesEjecutarCronSyncIcal): Promise<ResultadoCronSync> {
  const ahoraMs = opciones.ahoraMs ?? (() => Date.now());
  const presupuestoMs = opciones.presupuestoMs ?? PRESUPUESTO_MS_DEFECTO;
  const inicioMs = ahoraMs();
  const iniciadoEn = new Date(inicioMs);

  // Hoisted fuera del `try` a propósito: el `finally` construye el
  // resumen para `sesion.cerrar` con lo que se alcanzó a hacer incluso si
  // `listarFeedsActivos` o un `ejecutarCiclo` lanzaron sin capturar
  // (nunca deja la corrida sin su fila en `auditoria_ejecucion_servicio_
  // sistema`, A3-DESP-01).
  const tenantsAlcanzados = new Set<string>();
  const detalles: DetalleFeedCron[] = [];
  let procesados = 0;
  let errores = 0;
  let totalFeeds = 0;
  let indice = 0;

  const sesion = await opciones.proveedorSesion.abrir();
  try {
    const feeds = await sesion.listarFeedsActivos();
    totalFeeds = feeds.length;

    for (; indice < feeds.length; indice++) {
      if (ahoraMs() - inicioMs >= presupuestoMs) break;
      const feed = feeds[indice]!;
      tenantsAlcanzados.add(feed.tenantId);
      try {
        const resultado = await opciones.ejecutarCiclo(feed, sesion.ejecutor);
        procesados++;
        detalles.push({
          feedId: feed.feedId,
          unidadId: feed.unidadId,
          canalCodigo: feed.canalCodigo,
          resultado: resultado.resultado,
        });
      } catch (error) {
        errores++;
        detalles.push({
          feedId: feed.feedId,
          unidadId: feed.unidadId,
          canalCodigo: feed.canalCodigo,
          error: redactarPiiEnTexto(error instanceof Error ? error.message : String(error)),
        });
      }
    }

    return { procesados, errores, pendientes: totalFeeds - indice, detalles };
  } finally {
    await sesion.cerrar({
      iniciadoEn,
      tenantsAlcanzados: tenantsAlcanzados.size,
      feedsProcesados: procesados,
      feedsError: errores,
      feedsPendientes: totalFeeds - indice,
    });
  }
}

// --- Proveedor de sesión real contra Postgres (producción) ------------

/** Nombre del servicio en `delegacion_servicio_sistema`/
 * `auditoria_ejecucion_servicio_sistema` (0128_delegacion_servicio_
 * sistema.ts) — distinguible por diseño del `alcance='general'` que usan
 * las concesiones humanas de `acceso_romper_cristal`: son tablas
 * DISTINTAS, así que ni siquiera hace falta un valor "raro" para no
 * confundirlos (A3-DESP-01). */
export const SERVICIO_CRON_SYNC_ICAL = "cron_sync_ical";
/** Timeout de fetch por canal individual (más corto que el default de
 * `fetchIcsSeguro`, 15s) para que un solo feed lento no consuma buena
 * parte del presupuesto total de 22s del lote. */
const TIMEOUT_FETCH_POR_CANAL_MS = 8_000;

interface FilaFeedActivo {
  feed_id: string;
  unidad_id: string;
  canal_id: string;
  url_import: string;
  ultima_sincronizacion_exitosa_en: string | null;
  tenant_id: string;
  zona_horaria_propiedad: string;
  canal_codigo: string;
}

const SQL_LISTAR_FEEDS_ACTIVOS = `
  SELECT ucf.id AS feed_id,
         ucf.unidad_id,
         ucf.canal_id,
         ucf.url_import,
         ucf.ultima_sincronizacion_exitosa_en::text AS ultima_sincronizacion_exitosa_en,
         p.tenant_id,
         p.zona_horaria AS zona_horaria_propiedad,
         ca.codigo AS canal_codigo
  FROM unidad_canal_feed ucf
  JOIN unidad u ON u.id = ucf.unidad_id
  JOIN propiedad p ON p.id = u.propiedad_id
  JOIN canal ca ON ca.id = ucf.canal_id
  WHERE ucf.url_import IS NOT NULL AND btrim(ucf.url_import) <> ''
  -- Orden estable por "más desactualizado primero": si el lote se corta
  -- por presupuesto de tiempo, los canales que SÍ se sincronizaron ahora
  -- tienen timestamp fresco y bajan al final de la cola — la siguiente
  -- invocación (15 min después) recoge naturalmente los que quedaron
  -- pendientes, sin necesidad de un cursor persistido aparte.
  ORDER BY COALESCE(ucf.ultima_sincronizacion_exitosa_en, '-infinity'::timestamptz) ASC, ucf.id ASC
`;

function filaAFeedIcalActivo(fila: FilaFeedActivo): FeedIcalActivo {
  return {
    feedId: fila.feed_id,
    unidadId: fila.unidad_id,
    canalId: fila.canal_id,
    canalCodigo: fila.canal_codigo,
    tenantId: fila.tenant_id,
    urlImport: fila.url_import,
    zonaHorariaPropiedad: fila.zona_horaria_propiedad,
    ultimaSincronizacionExitosaEn: fila.ultima_sincronizacion_exitosa_en,
  };
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

export interface OpcionesProveedorSesionPostgres {
  pool: pg.Pool;
  /** UUID de un usuario `usuario.rol = 'superadmin'` activo ya existente
   * — ver `CRON_SYNC_SUPERADMIN_ID` en `.env.example`. `null` (variable
   * sin configurar) hace que `abrir()` lance de inmediato, ANTES de
   * tocar ninguna tabla de negocio (fail-closed explícito, nunca un
   * `{procesados: 0}` silencioso). */
  superadminId: string | null;
}

/** Construye el `ProveedorSesionCron` real: abre una conexión, fija la
 * sesión RLS como el superadmin configurado, verifica que esa identidad
 * de verdad resuelve a un superadmin activo (`rol_actual()`, función
 * `SECURITY DEFINER` ya otorgada a `app_rv` desde 0014_rls_funciones_helper.ts
 * — no hace falta ninguna consulta nueva sin RLS para esta verificación),
 * y verifica que tenga una DELEGACIÓN DE SERVICIO activa en
 * `delegacion_servicio_sistema` (0128_delegacion_servicio_sistema.ts,
 * A3-DESP-01) — nunca la crea: esa tabla no tiene política INSERT para
 * `app_rv`, así que este código NO PUEDE auto-otorgársela aunque
 * quisiera. Si la delegación no existe o fue revocada, `abrir()` lanza
 * ANTES de tocar cualquier tabla de negocio (fail-closed explícito, el
 * mismo criterio que ya aplicaba a `CRON_SYNC_SUPERADMIN_ID` mal
 * configurado) — ver `docs/despliegue/cron-sync.md` §"Delegación de
 * servicio del cron" para cómo un operador la activa. */
export function crearProveedorSesionPostgres(opciones: OpcionesProveedorSesionPostgres): ProveedorSesionCron {
  return {
    async abrir(): Promise<SesionTrabajoCron> {
      const superadminId = opciones.superadminId;
      if (!superadminId) {
        throw new Error(
          "CRON_SYNC_SUPERADMIN_ID no está configurado: el cron de sync iCal necesita el id de un usuario " +
            "superadmin activo ya existente para leer/escribir configuración de canal de TODOS los tenants " +
            "respetando RLS (ver docs/despliegue/cron-sync.md).",
        );
      }

      const cliente = await opciones.pool.connect();
      try {
        await fijarSesion(cliente, { usuarioId: superadminId, tenantId: null, rol: "superadmin" });

        // `rol_actual()` deriva SIEMPRE de la tabla `usuario` en vivo
        // (0014_rls_funciones_helper.ts) — si el id configurado no existe,
        // no está activo, o no tiene rol 'superadmin', esto es `null` y
        // fallamos aquí mismo, ANTES de comprobar la delegación o de
        // intentar leer una sola fila de negocio.
        const filaRol = await cliente.query<{ rol: string | null }>("SELECT rol_actual() AS rol");
        if (filaRol.rows[0]?.rol !== "superadmin") {
          throw new Error(
            `CRON_SYNC_SUPERADMIN_ID ("${superadminId}") no corresponde a un usuario activo con rol ` +
              "'superadmin' — verifica el valor configurado (SELECT id FROM usuario WHERE rol='superadmin' " +
              "AND activo).",
          );
        }

        // A3-DESP-01: ya NO se auto-otorga nada aquí. Solo se VERIFICA que
        // un operador haya activado, de antemano y a mano, la delegación
        // de servicio — la política SELECT de `delegacion_servicio_
        // sistema` deja ver esta fila aunque `is_tenant_member` para
        // tenants de negocio siga en 0 hasta este mismo SELECT resolver
        // `true` (la política de esa tabla es `rol_actual() = 'superadmin'`,
        // no `is_tenant_member`).
        const filaDelegacion = await cliente.query<{ existe: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM delegacion_servicio_sistema
             WHERE superadmin_id = $1 AND servicio = $2 AND revocado_en IS NULL
           ) AS existe`,
          [superadminId, SERVICIO_CRON_SYNC_ICAL],
        );
        if (!filaDelegacion.rows[0]?.existe) {
          throw new Error(
            `CRON_SYNC_SUPERADMIN_ID ("${superadminId}") no tiene una delegación de servicio activa ` +
              `("${SERVICIO_CRON_SYNC_ICAL}") en delegacion_servicio_sistema — el cron ya no se auto-otorga ` +
              "acceso cross-tenant vía acceso_romper_cristal (A3-DESP-01). Un operador con acceso directo a " +
              "Postgres debe crear esa fila explícitamente antes de activar este cron en un despliegue nuevo " +
              "(ver docs/despliegue/cron-sync.md, sección \"Delegación de servicio del cron\").",
          );
        }

        return {
          ejecutor: ejecutorDeCliente(cliente),
          async listarFeedsActivos() {
            const { rows } = await cliente.query<FilaFeedActivo>(SQL_LISTAR_FEEDS_ACTIVOS);
            return rows.map(filaAFeedIcalActivo);
          },
          async cerrar(resumen: ResumenEjecucionCron) {
            try {
              // Canal de auditoría DEDICADO (A3-DESP-01): una fila por
              // corrida, nunca mezclada con acceso_romper_cristal. La
              // política INSERT de esta tabla vuelve a exigir una
              // delegación activa para este mismo `servicio` — si algo
              // revocó la delegación a medio lote, este INSERT falla en
              // vez de fingir que la ejecución fue autorizada de
              // principio a fin.
              await cliente.query(
                `INSERT INTO auditoria_ejecucion_servicio_sistema
                   (servicio, superadmin_id, iniciado_en, finalizado_en, tenants_alcanzados,
                    feeds_procesados, feeds_error, feeds_pendientes)
                 VALUES ($1, $2, $3, now(), $4, $5, $6, $7)`,
                [
                  SERVICIO_CRON_SYNC_ICAL,
                  superadminId,
                  resumen.iniciadoEn,
                  resumen.tenantsAlcanzados,
                  resumen.feedsProcesados,
                  resumen.feedsError,
                  resumen.feedsPendientes,
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
    },
  };
}

async function ejecutarCicloParaFeed(
  feed: FeedIcalActivo,
  ejecutor: EjecutorTransaccional,
  trazador: Trazador,
  metricas: RegistroMetricas,
): Promise<ResultadoEjecutarCiclo> {
  const ctx: ContextoSincronizacion = {
    ejecutor,
    unidadId: feed.unidadId,
    canalId: feed.canalId,
    zonaHorariaPropiedad: feed.zonaHorariaPropiedad,
  };
  const resultado = await ejecutarCicloSyncInstrumentado({
    ctx,
    opcionesFetch: { url: feed.urlImport, timeoutMs: TIMEOUT_FETCH_POR_CANAL_MS },
    canalNombre: feed.canalCodigo,
    trazador,
    metricas,
  });
  return { resultado: resultado.resultado };
}

// --- Ruta HTTP ----------------------------------------------------------

function tokenValido(recibido: string, esperado: string): boolean {
  const bufRecibido = Buffer.from(recibido, "utf8");
  const bufEsperado = Buffer.from(esperado, "utf8");
  if (bufRecibido.length !== bufEsperado.length) return false;
  return timingSafeEqual(bufRecibido, bufEsperado);
}

export interface DependenciasCronSyncIcal {
  pool: pg.Pool;
  metricas: RegistroMetricas;
  /** Inyectable SOLO para pruebas (`test/observabilidad/cronSync.test.ts`):
   * por defecto construye la sesión real contra Postgres
   * (`crearProveedorSesionPostgres` + `CRON_SYNC_SUPERADMIN_ID`). Permite
   * probar el camino HTTP completo (200 con conteos, aislamiento de
   * errores por canal, tope de tiempo) con canales/ejecuciones
   * simuladas, sin una base de datos real. */
  proveedorSesion?: ProveedorSesionCron;
  ejecutarCiclo?: OpcionesEjecutarCronSyncIcal["ejecutarCiclo"];
  presupuestoMs?: number;
  ahoraMs?: () => number;
}

/**
 * `crearRutasCronSyncIcal` se monta desde `workers/observabilidad/rutas.ts`
 * (paquete cron-sync SOLO toca `apps/api/src/rutas/internas/**` y
 * `apps/api/src/workers/observabilidad/**` — nunca `app.ts`), reutilizando
 * el mismo punto de montaje que ya usa `rutasObservabilidad`
 * (`app.route("/", rutasObservabilidad(...))` en `app.ts`, sin tocarlo).
 *
 * `GET /sync-ical` — sin `CRON_SECRET` configurado: 503 fail-closed,
 * NUNCA ejecuta nada (ni siquiera abre una conexión a Postgres). Con
 * `CRON_SECRET` configurado pero un `Authorization: Bearer <token>`
 * ausente o distinto: 401. Con el token correcto: ejecuta el lote y
 * responde 200 con `{procesados, errores, pendientes, detalles}`, o 500
 * si el propio arranque del lote falló (p. ej. `CRON_SYNC_SUPERADMIN_ID`
 * mal configurado) — nunca un 200 fingido.
 */
export function crearRutasCronSyncIcal(deps: DependenciasCronSyncIcal): Hono {
  const app = new Hono();

  app.get("/sync-ical", async (c) => {
    const secreto = process.env.CRON_SECRET;
    if (!secreto) {
      return c.json(
        {
          error: {
            codigo: "servicio_no_configurado",
            mensaje:
              "CRON_SECRET no está configurado en este despliegue — el cron de sincronización iCal " +
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

    const trazador = crearTrazador(
      "atiende-rv-api-cron",
      construirExportadoresDesdeEntorno(leerConfiguracionOtelEntorno()),
    );
    const superadminId = process.env.CRON_SYNC_SUPERADMIN_ID?.trim() || null;
    const proveedorSesion =
      deps.proveedorSesion ?? crearProveedorSesionPostgres({ pool: deps.pool, superadminId });
    const ejecutarCiclo =
      deps.ejecutarCiclo ?? ((feed, ejecutor) => ejecutarCicloParaFeed(feed, ejecutor, trazador, deps.metricas));

    try {
      const resultado = await ejecutarCronSyncIcal({
        proveedorSesion,
        ejecutarCiclo,
        presupuestoMs: deps.presupuestoMs,
        ahoraMs: deps.ahoraMs,
      });
      return c.json(resultado, 200);
    } catch (error) {
      console.error(
        JSON.stringify({
          error: "cron_sync_ical_no_disponible",
          mensaje: redactarPiiEnTexto(error instanceof Error ? error.message : String(error)),
        }),
      );
      return c.json(
        {
          error: {
            codigo: "cron_sync_no_disponible",
            mensaje: "El cron de sincronización no pudo ejecutarse — ver logs del servidor.",
          },
        },
        500,
      );
    }
  });

  return app;
}

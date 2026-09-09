import type { EjecutorSql, FilaSql } from "@atiende-rv/db";
import type { PayloadWebhookNotificacion } from "@atiende-rv/domain/notificaciones";
import { descifrarSecretoWebhook } from "./cifradoSecreto.js";
import { enviarWebhookFirmado, type OpcionesEnviarWebhook } from "./webhookSaliente.js";

/**
 * A3-NOTIF-03 (docs/auditoria-3/calidad.md, BAJO — decisión de producto:
 * cerrar el hallazgo, no dejarlo pendiente): el envío de webhooks
 * salientes de `dispatcher.ts` era "best-effort" de UN solo intento — un
 * fallo transitorio del endpoint del tenant descartaba la notificación
 * para siempre. Este módulo añade una cola de reintento con backoff
 * exponencial ACOTADO, siguiendo el mismo patrón de diseño que
 * `apps/api/src/workers/observabilidad/outboxWorker.ts` (tabla de cola
 * persistida + worker periódico que procesa en su propia transacción por
 * fila) — sin reutilizar literalmente ese código porque modela un ciclo
 * de vida distinto: un evento del outbox se aplica UNA vez y punto; una
 * entrega de webhook puede reintentarse VARIAS veces con retardo
 * creciente hasta agotar un tope, y solo entonces se marca fallida para
 * siempre.
 *
 * ## Ciclo de vida de una fila de `webhook_saliente_reintento`
 *
 * 1. `dispatcher.ts` intenta la entrega SÍNCRONA como siempre (best-effort,
 *    sin bloquear la operación que disparó la notificación). Si falla,
 *    llama a `encolarReintentoWebhook`: nace una fila con `intentos = 1`
 *    (el intento síncrono YA cuenta) y `proximo_intento_en` al primer
 *    escalón de `BACKOFF_REINTENTO_WEBHOOK_MS`.
 * 2. El worker periódico (`procesarReintentosWebhookPendientes`, disparado
 *    por `GET /internal/cron/webhooks-retry`, ver
 *    `apps/api/src/rutas/internas/cronWebhooksReintento.ts`) toma las
 *    filas `pendiente` cuya hora ya llegó y reintenta la entrega.
 * 3. Entrega exitosa → la fila se BORRA (idempotencia hacia adelante: una
 *    vez entregado, nada vuelve a intentar reenviarlo — nunca queda una
 *    fila "entregada" acumulándose sin límite).
 * 4. Entrega fallida y `intentos` alcanza `maxIntentos` → la fila pasa a
 *    `estado = 'agotado'` (fallo permanente) y se CONSERVA (nunca se
 *    borra) para revisión humana — un operador puede auditar
 *    `SELECT * FROM webhook_saliente_reintento WHERE estado = 'agotado'`.
 *    Nunca hay reintento infinito.
 * 5. Entrega fallida y `intentos` no alcanza el tope → se incrementa
 *    `intentos`, se agenda `proximo_intento_en` al siguiente escalón de
 *    backoff, y la fila sigue `pendiente`.
 *
 * Límite conocido, documentado a propósito (mismo criterio que
 * `outboxWorker.ts`): esto asume UN solo worker activo a la vez — sin
 * `SELECT ... FOR UPDATE SKIP LOCKED` no hay protección contra dos
 * invocaciones concurrentes del cron tomando la misma fila. El cron real
 * (Vercel Cron, un solo disparo por horario) no produce ese escenario en
 * producción; escalar a múltiples workers concurrentes necesitaría
 * añadir `SKIP LOCKED`, fuera del alcance de este cierre.
 */

/** 1 min / 5 min / 30 min / 2 h — backoff exponencial ACOTADO. Cada
 * elemento es el retardo, en ms, ANTES del intento número `índice + 2`
 * (el intento nº1 es el síncrono de `dispatcher.ts`, que no pasa por este
 * arreglo). */
export const BACKOFF_REINTENTO_WEBHOOK_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

/** Intento síncrono inicial (1) + los 4 reintentos programados de
 * `BACKOFF_REINTENTO_WEBHOOK_MS` = 5 intentos totales antes de agotar. */
export const MAX_INTENTOS_REINTENTO_WEBHOOK_DEFECTO = BACKOFF_REINTENTO_WEBHOOK_MS.length + 1;

/** Retardo en ms antes del intento número `numeroIntento` (1-based, el
 * intento nº1 nunca pasa por aquí). Si `maxIntentos` configurado es mayor
 * que el largo del arreglo de backoff, el último escalón (2h) se repite
 * en vez de lanzar — un backoff "acotado" nunca deja de tener un
 * siguiente retardo definido. */
function retardoParaIntento(numeroIntento: number, backoffMs: number[]): number {
  const indice = Math.min(numeroIntento - 2, backoffMs.length - 1);
  return backoffMs[Math.max(0, indice)]!;
}

// --- Encolar (llamado desde dispatcher.ts) -----------------------------

export interface EjecutorConsultaMinimo {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface OpcionesEncolarReintentoWebhook {
  tenantId: string;
  payload: PayloadWebhookNotificacion;
  motivoRechazo: string | null;
  backoffMs?: number[];
}

/** Encola UN envío fallido para reintento. Nunca lanza por sí sola hacia
 * el llamador feliz (el `INSERT` puede fallar por una BD caída, pero eso
 * es responsabilidad del llamador de decidir cómo degradar — ver
 * `dispatcher.ts`, que la envuelve en su propio `try/catch` para no
 * romper jamás su contrato best-effort). */
export async function encolarReintentoWebhook(
  ejecutor: EjecutorConsultaMinimo,
  opciones: OpcionesEncolarReintentoWebhook,
): Promise<void> {
  const backoffMs = opciones.backoffMs ?? BACKOFF_REINTENTO_WEBHOOK_MS;
  await ejecutor.query(
    `INSERT INTO webhook_saliente_reintento
       (tenant_id, payload, intentos, proximo_intento_en, estado, ultimo_motivo_rechazo)
     VALUES ($1, $2::jsonb, 1, now() + ($3 || ' milliseconds')::interval, 'pendiente', $4)`,
    [opciones.tenantId, JSON.stringify(opciones.payload), String(backoffMs[0]), opciones.motivoRechazo],
  );
}

// --- Worker periódico ----------------------------------------------------

interface FilaWebhookReintentoPendiente extends FilaSql {
  id: string;
  tenant_id: string;
  payload: unknown;
  intentos: number;
}

interface FilaConfigWebhookTenant extends FilaSql {
  url: string;
  secreto_cifrado: Buffer;
  secreto_iv: Buffer;
  secreto_tag: Buffer;
  activo: boolean;
}

export interface ConfigWebhookTenant {
  url: string;
  secretoHmac: string;
}

/** Carga la config VIGENTE del webhook del tenant en el momento del
 * reintento (nunca una copia guardada al encolar — si el tenant cambió la
 * URL o desactivó el webhook entre el fallo original y el reintento, el
 * reintento debe reflejar el estado actual, no uno obsoleto). `null` si
 * no hay webhook configurado o está inactivo. */
export async function cargarConfigWebhookTenant(ejecutor: EjecutorSql, tenantId: string): Promise<ConfigWebhookTenant | null> {
  const { rows } = await ejecutor.query<FilaConfigWebhookTenant>(
    "SELECT url, secreto_cifrado, secreto_iv, secreto_tag, activo FROM webhook_tenant WHERE tenant_id = $1",
    [tenantId],
  );
  const config = rows[0];
  if (!config || !config.activo) return null;
  return {
    url: config.url,
    secretoHmac: descifrarSecretoWebhook({
      secretoCifrado: config.secreto_cifrado,
      secretoIv: config.secreto_iv,
      secretoTag: config.secreto_tag,
    }),
  };
}

export interface OpcionesProcesarReintentosWebhook {
  ejecutor: EjecutorSql;
  /** Inyectable para pruebas — por defecto `cargarConfigWebhookTenant`
   * real contra `webhook_tenant`. */
  cargarConfig?: (ejecutor: EjecutorSql, tenantId: string) => Promise<ConfigWebhookTenant | null>;
  /** Inyectable para pruebas — nunca se hace una petición HTTP real en la
   * suite de este módulo. */
  enviarWebhook?: typeof enviarWebhookFirmado;
  opcionesWebhook?: OpcionesEnviarWebhook;
  maxIntentos?: number;
  backoffMs?: number[];
  limite?: number;
  ahoraMs?: () => number;
}

export interface ResultadoFilaReintento {
  id: string;
  resultado: "entregado" | "reintentara" | "agotado";
}

export interface ResultadoProcesarReintentosWebhook {
  procesadas: ResultadoFilaReintento[];
}

async function listarPendientesListos(ejecutor: EjecutorSql, limite: number): Promise<FilaWebhookReintentoPendiente[]> {
  const resultado = await ejecutor.query<FilaWebhookReintentoPendiente>(
    `SELECT id, tenant_id, payload, intentos
     FROM webhook_saliente_reintento
     WHERE estado = 'pendiente' AND proximo_intento_en <= now()
     ORDER BY proximo_intento_en, id
     LIMIT $1`,
    [limite],
  );
  return resultado.rows;
}

/**
 * Procesa hasta `limite` filas pendientes cuya hora de reintento ya
 * llegó, una transacción por fila (mismo aislamiento que
 * `procesarPendientesOutbox`: un fallo de BD en una fila nunca corrompe
 * el estado de las demás). Un error al procesar UNA fila (p. ej. un fallo
 * de conexión a mitad de su transacción) se aísla y se registra — NUNCA
 * aborta el resto del lote (mismo criterio D-DSD-06 que
 * `ejecutarCronSyncIcal`: un elemento roto no debe tumbar el lote
 * completo de un cron periódico).
 */
export async function procesarReintentosWebhookPendientes(
  opciones: OpcionesProcesarReintentosWebhook,
): Promise<ResultadoProcesarReintentosWebhook> {
  const { ejecutor } = opciones;
  const cargarConfig = opciones.cargarConfig ?? cargarConfigWebhookTenant;
  const enviarWebhook = opciones.enviarWebhook ?? enviarWebhookFirmado;
  const backoffMs = opciones.backoffMs ?? BACKOFF_REINTENTO_WEBHOOK_MS;
  const maxIntentos = opciones.maxIntentos ?? MAX_INTENTOS_REINTENTO_WEBHOOK_DEFECTO;
  const limite = opciones.limite ?? 50;
  const ahoraMs = opciones.ahoraMs ?? (() => Date.now());

  const pendientes = await listarPendientesListos(ejecutor, limite);
  const procesadas: ResultadoFilaReintento[] = [];

  for (const fila of pendientes) {
    await ejecutor.exec("BEGIN");
    try {
      // Re-chequeo DENTRO de la transacción (mismo patrón que
      // `outboxWorker.ts`): si otra corrida ya resolvió esta fila entre el
      // SELECT de arriba y este punto, se omite sin reintentar de más.
      const actual = await ejecutor.query<{ estado: string; intentos: number }>(
        `SELECT estado, intentos FROM webhook_saliente_reintento WHERE id = $1 FOR UPDATE`,
        [fila.id],
      );
      const filaActual = actual.rows[0];
      if (!filaActual || filaActual.estado !== "pendiente") {
        await ejecutor.exec("COMMIT");
        continue;
      }

      const payload = fila.payload as PayloadWebhookNotificacion;
      const config = await cargarConfig(ejecutor, fila.tenant_id);

      const resultado = config
        ? await enviarWebhook(config.url, config.secretoHmac, payload, opciones.opcionesWebhook)
        : { entregado: false, statusHttp: null, motivoRechazo: "webhook_tenant_inactivo_o_ausente" as const };

      if (resultado.entregado) {
        // Idempotencia hacia adelante: entregado = fuera de la cola para
        // siempre, nunca se reenvía una tercera vez tras recuperarse.
        await ejecutor.query(`DELETE FROM webhook_saliente_reintento WHERE id = $1`, [fila.id]);
        await ejecutor.exec("COMMIT");
        procesadas.push({ id: fila.id, resultado: "entregado" });
        continue;
      }

      const intentosNuevos = filaActual.intentos + 1;
      if (intentosNuevos >= maxIntentos) {
        await ejecutor.query(
          `UPDATE webhook_saliente_reintento
             SET estado = 'agotado', intentos = $2, ultimo_motivo_rechazo = $3, actualizado_en = now()
           WHERE id = $1`,
          [fila.id, intentosNuevos, resultado.motivoRechazo],
        );
        await ejecutor.exec("COMMIT");
        // Nunca reintentos infinitos: fallo permanente logueado para
        // revisión humana (nunca la URL completa del tenant ni el cuerpo
        // de la respuesta — solo IDs y el motivo de rechazo ya saneado de
        // `enviarWebhookFirmado`).
        console.error(
          JSON.stringify({
            evento: "webhook_reintento_agotado",
            webhookReintentoId: fila.id,
            tenantId: fila.tenant_id,
            intentos: intentosNuevos,
            motivoRechazo: resultado.motivoRechazo,
          }),
        );
        procesadas.push({ id: fila.id, resultado: "agotado" });
        continue;
      }

      const retardoMs = retardoParaIntento(intentosNuevos, backoffMs);
      await ejecutor.query(
        `UPDATE webhook_saliente_reintento
           SET intentos = $2,
               proximo_intento_en = to_timestamp($3 / 1000.0) + ($4 || ' milliseconds')::interval,
               ultimo_motivo_rechazo = $5,
               actualizado_en = now()
         WHERE id = $1`,
        [fila.id, intentosNuevos, ahoraMs(), String(retardoMs), resultado.motivoRechazo],
      );
      await ejecutor.exec("COMMIT");
      procesadas.push({ id: fila.id, resultado: "reintentara" });
    } catch (error) {
      await ejecutor.exec("ROLLBACK");
      console.error(
        JSON.stringify({
          evento: "webhook_reintento_fila_error",
          webhookReintentoId: fila.id,
          mensaje: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return { procesadas };
}

/** Tamaño actual de la cola pendiente y de la agotada — insumo directo
 * para `/health/detallado` (mismo criterio que `contarPendientesOutbox`
 * en `outboxWorker.ts`). */
export async function contarWebhookReintentoPorEstado(ejecutor: EjecutorSql): Promise<{ pendiente: number; agotado: number }> {
  const resultado = await ejecutor.query<{ estado: string; n: string }>(
    `SELECT estado, count(*)::text AS n FROM webhook_saliente_reintento GROUP BY estado`,
  );
  const porEstado: { pendiente: number; agotado: number } = { pendiente: 0, agotado: 0 };
  for (const fila of resultado.rows) {
    if (fila.estado === "pendiente") porEstado.pendiente = Number(fila.n);
    else if (fila.estado === "agotado") porEstado.agotado = Number(fila.n);
  }
  return porEstado;
}

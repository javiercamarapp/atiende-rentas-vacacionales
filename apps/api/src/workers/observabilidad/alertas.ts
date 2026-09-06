import type { EjecutorSql, FilaSql } from "@atiende-rv/db";
import { FLAG_SYNC_CANAL_PAUSADO_POR_ALERTA, type RegistroFlags } from "@atiende-rv/domain";

/**
 * Motor de reglas de alerta (Lote 10, H-037/H-090, §Operación-1). Las 6
 * reglas tienen runbook en `docs/runbooks/*.md`. Regla de oro, verificada
 * en pruebas (`test/observabilidad/alertas.test.ts`): el ÚNICO efecto
 * automatizable que cualquier regla puede producir es (a) una notificación
 * interna (la fila en `alerta`) o (b) apagar
 * `sync.canal_pausado_por_alerta` — una pausa REVERSIBLE del push hacia un
 * canal. Ninguna regla cancela una reserva ni contacta a un huésped, y
 * ninguna acción es irreversible: reactivar el flag siempre está a un
 * `establecer({valor:false, ...})` de distancia.
 */

export type TipoAlerta =
  | "sync_sin_exito"
  | "feed_en_cuarentena"
  | "conflicto_pendiente"
  | "outbox_atascada"
  | "drift"
  | "token_canal_revocado";

export type SeveridadAlerta = "baja" | "media" | "alta";

export interface UmbralesAlerta {
  /** Segundos sin una sync exitosa antes de disparar `sync_sin_exito`,
   * configurable POR CANAL (H-037: "umbral configurable por canal"). */
  edadSyncSinExitoSegundosPorCanal: Record<string, number>;
  edadSyncSinExitoSegundosPorDefecto: number;
  /** Milisegundos de antigüedad del pendiente más viejo del outbox antes
   * de considerar la cola "atascada". */
  outboxAtascadaMs: number;
  /** Intentos fallidos consecutivos de token/autenticación de canal antes
   * de pausar el push de ese canal. */
  intentosTokenRevocado: number;
}

export const UMBRALES_POR_DEFECTO: UmbralesAlerta = {
  edadSyncSinExitoSegundosPorCanal: {},
  edadSyncSinExitoSegundosPorDefecto: 6 * 60 * 60, // 6 horas.
  outboxAtascadaMs: 30 * 60 * 1000, // 30 minutos.
  intentosTokenRevocado: 3,
};

export interface SenalSyncCanal {
  canalNombre: string;
  canalId: string;
  unidadId?: string;
  edadUltimaSyncExitosaSegundos: number | null;
  errorClaseUltimoIntento: string | null;
  intentosFallidosConsecutivos: number;
}

export interface SenalFeedCuarentena {
  canalId: string;
  unidadId: string;
  canalNombre: string;
  motivoCuarentena: string;
}

export interface SenalConflictoPendiente {
  conflictoId: string;
  unidadId: string;
  tipoConflicto: string;
}

export interface SenalOutbox {
  edadPendienteMasViejoMs: number | null;
  tamanoCola: number;
}

export interface SenalDrift {
  canalId: string;
  unidadId: string;
  canalNombre: string;
  uidsSoloEnFeed: number;
  uidsSoloEnBd: number;
}

export interface EntradaAlerta {
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  canalId?: string;
  unidadId?: string;
  mensaje: string;
  metadata: Record<string, unknown>;
  /** Descripción de la acción reversible tomada (o `null` si la regla solo
   * notifica). NUNCA "reserva_cancelada" ni "mensaje_enviado_a_huesped". */
  accionReversible: string | null;
}

function evaluarSyncSinExito(senal: SenalSyncCanal, umbrales: UmbralesAlerta): EntradaAlerta | null {
  if (senal.edadUltimaSyncExitosaSegundos === null) return null;
  const umbral = umbrales.edadSyncSinExitoSegundosPorCanal[senal.canalNombre] ?? umbrales.edadSyncSinExitoSegundosPorDefecto;
  if (senal.edadUltimaSyncExitosaSegundos < umbral) return null;
  return {
    tipo: "sync_sin_exito",
    severidad: "alta",
    canalId: senal.canalId,
    unidadId: senal.unidadId,
    mensaje: `Sin sincronización exitosa en ${senal.canalNombre} hace ${Math.round(senal.edadUltimaSyncExitosaSegundos)}s (umbral ${umbral}s)`,
    metadata: { edadSegundos: senal.edadUltimaSyncExitosaSegundos, umbralSegundos: umbral, errorClase: senal.errorClaseUltimoIntento },
    accionReversible: null, // notificación — la pausa real la decide token_canal_revocado si aplica.
  };
}

function evaluarFeedCuarentena(senal: SenalFeedCuarentena): EntradaAlerta {
  return {
    tipo: "feed_en_cuarentena",
    severidad: "alta",
    canalId: senal.canalId,
    unidadId: senal.unidadId,
    mensaje: `Feed de ${senal.canalNombre} en cuarentena: ${senal.motivoCuarentena}`,
    metadata: { motivo: senal.motivoCuarentena },
    accionReversible: null, // la cuarentena YA es la acción reversible del motor de sync (Lote 2) — esto solo notifica.
  };
}

function evaluarConflictoPendiente(senal: SenalConflictoPendiente): EntradaAlerta {
  return {
    tipo: "conflicto_pendiente",
    severidad: "media",
    unidadId: senal.unidadId,
    mensaje: `Conflicto de calendario pendiente de revisión humana (${senal.tipoConflicto})`,
    metadata: { conflictoId: senal.conflictoId, tipoConflicto: senal.tipoConflicto },
    accionReversible: null, // revisión humana explícita — nunca se resuelve solo.
  };
}

function evaluarOutboxAtascada(senal: SenalOutbox, umbrales: UmbralesAlerta): EntradaAlerta | null {
  if (senal.edadPendienteMasViejoMs === null || senal.edadPendienteMasViejoMs < umbrales.outboxAtascadaMs) return null;
  return {
    tipo: "outbox_atascada",
    severidad: "alta",
    mensaje: `Outbox atascado: evento pendiente más viejo tiene ${Math.round(senal.edadPendienteMasViejoMs / 1000)}s (umbral ${Math.round(umbrales.outboxAtascadaMs / 1000)}s), cola=${senal.tamanoCola}`,
    metadata: { edadMs: senal.edadPendienteMasViejoMs, tamanoCola: senal.tamanoCola },
    accionReversible: null,
  };
}

function evaluarDrift(senal: SenalDrift): EntradaAlerta | null {
  if (senal.uidsSoloEnFeed === 0 && senal.uidsSoloEnBd === 0) return null;
  return {
    tipo: "drift",
    severidad: "media",
    canalId: senal.canalId,
    unidadId: senal.unidadId,
    mensaje: `Drift detectado en ${senal.canalNombre}: ${senal.uidsSoloEnFeed} UID solo en feed, ${senal.uidsSoloEnBd} solo en BD`,
    metadata: { uidsSoloEnFeed: senal.uidsSoloEnFeed, uidsSoloEnBd: senal.uidsSoloEnBd },
    accionReversible: null, // la reconciliación de drift (packages/db/backup, packages/adapters) es un flujo aparte, no una acción de esta alerta.
  };
}

/** H-090: pausa REVERSIBLE del push de un canal ante token revocado/
 * expirado — el ÚNICO efecto automático de todo el motor de alertas que
 * toca un flag (nunca cancela reservas ni contacta huéspedes). */
function evaluarTokenCanalRevocado(senal: SenalSyncCanal, umbrales: UmbralesAlerta): EntradaAlerta | null {
  const esErrorDeAuth = senal.errorClaseUltimoIntento === "token_invalido" || senal.errorClaseUltimoIntento === "credenciales_revocadas";
  if (!esErrorDeAuth || senal.intentosFallidosConsecutivos < umbrales.intentosTokenRevocado) return null;
  return {
    tipo: "token_canal_revocado",
    severidad: "alta",
    canalId: senal.canalId,
    unidadId: senal.unidadId,
    mensaje: `Token de ${senal.canalNombre} revocado/expirado tras ${senal.intentosFallidosConsecutivos} intentos — push pausado (reversible)`,
    metadata: { intentosFallidosConsecutivos: senal.intentosFallidosConsecutivos },
    accionReversible: "sync.canal_pausado_por_alerta=true",
  };
}

export interface OpcionesEvaluarAlertas {
  umbrales?: UmbralesAlerta;
  syncPorCanal?: SenalSyncCanal[];
  feedsEnCuarentena?: SenalFeedCuarentena[];
  conflictosPendientes?: SenalConflictoPendiente[];
  outbox?: SenalOutbox;
  drifts?: SenalDrift[];
}

/** Evalúa TODAS las señales disponibles y devuelve las alertas a disparar
 * — función pura, no toca BD ni flags (eso lo hace `dispararAlertas`). */
export function evaluarAlertas(opciones: OpcionesEvaluarAlertas): EntradaAlerta[] {
  const umbrales = opciones.umbrales ?? UMBRALES_POR_DEFECTO;
  const entradas: EntradaAlerta[] = [];

  for (const senal of opciones.syncPorCanal ?? []) {
    const sinExito = evaluarSyncSinExito(senal, umbrales);
    if (sinExito) entradas.push(sinExito);
    const tokenRevocado = evaluarTokenCanalRevocado(senal, umbrales);
    if (tokenRevocado) entradas.push(tokenRevocado);
  }
  for (const senal of opciones.feedsEnCuarentena ?? []) entradas.push(evaluarFeedCuarentena(senal));
  for (const senal of opciones.conflictosPendientes ?? []) entradas.push(evaluarConflictoPendiente(senal));
  if (opciones.outbox) {
    const atascada = evaluarOutboxAtascada(opciones.outbox, umbrales);
    if (atascada) entradas.push(atascada);
  }
  for (const senal of opciones.drifts ?? []) {
    const drift = evaluarDrift(senal);
    if (drift) entradas.push(drift);
  }

  return entradas;
}

interface FilaAlertaInsertada extends FilaSql {
  id: string;
}

/**
 * Persiste las alertas evaluadas (tabla `alerta`, migración 0081) y aplica
 * la ÚNICA acción reversible soportada (pausar push de un canal vía flag)
 * cuando `accionReversible` la pide. `registroFlags` es opcional para que
 * las pruebas puedan evaluar sin BD/flags si solo les interesa la lógica
 * de reglas.
 */
export async function dispararAlertas(
  ejecutor: EjecutorSql,
  entradas: EntradaAlerta[],
  opciones: { registroFlags?: RegistroFlags; actor?: string } = {},
): Promise<string[]> {
  const ids: string[] = [];
  for (const entrada of entradas) {
    const resultado = await ejecutor.query<FilaAlertaInsertada>(
      `INSERT INTO alerta (tipo, severidad, canal_id, unidad_id, mensaje, metadata, accion_reversible)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        entrada.tipo,
        entrada.severidad,
        entrada.canalId ?? null,
        entrada.unidadId ?? null,
        entrada.mensaje,
        JSON.stringify(entrada.metadata),
        entrada.accionReversible,
      ],
    );
    ids.push(resultado.rows[0]!.id);

    if (entrada.accionReversible && opciones.registroFlags) {
      opciones.registroFlags.establecer({
        flagId: FLAG_SYNC_CANAL_PAUSADO_POR_ALERTA,
        valor: true,
        tenantId: undefined,
        actor: opciones.actor ?? "motor-alertas",
        motivo: `${entrada.tipo}: ${entrada.mensaje}`,
      });
    }
  }
  return ids;
}

export async function reconocerAlerta(ejecutor: EjecutorSql, alertaId: string, usuarioId: string): Promise<void> {
  await ejecutor.query(
    `UPDATE alerta SET estado = 'reconocida', reconocida_por = $2, reconocida_en = now()
     WHERE id = $1 AND estado = 'activa'`,
    [alertaId, usuarioId],
  );
}

export async function resolverAlerta(ejecutor: EjecutorSql, alertaId: string): Promise<void> {
  await ejecutor.query(`UPDATE alerta SET estado = 'resuelta', resuelta_en = now() WHERE id = $1`, [alertaId]);
}

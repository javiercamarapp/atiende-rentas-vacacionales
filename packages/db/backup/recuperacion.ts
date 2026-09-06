import { FLAG_SYNC_PUSH_AUTOMATICO, type RegistroFlags } from "@atiende-rv/domain";
import type { EjecutorSql } from "../src/runner/ejecutorSql.js";
import { restaurarBackupLogico, type ReporteRestauracion } from "./restaurar.js";
import { verificarIntegridad, type OpcionesVerificarIntegridad, type ReporteIntegridad } from "./integridad.js";
import type { BackupLogico } from "./tiposBackup.js";

/**
 * Orquesta el flujo completo de recuperación (H-086/H-087, §Operación-3):
 *
 *   1. Restaura el backup lógico en el destino AISLADO.
 *   2. Verifica integridad mínima (conteos, EXCLUDE, reserva de prueba).
 *   3. Si la integridad falla, NO toca el flag — la restauración se
 *      considera fallida y requiere intervención humana antes de nada.
 *   4. Si la integridad pasa, apaga `sync.push_automatico` (si no estaba
 *      ya apagado) — el push automático queda bloqueado hasta que
 *      `confirmarReconciliacionYReactivarPush` se llame explícitamente.
 *   5. Ejecuta la reconciliación de drift que el llamador inyecta como
 *      `reconciliarFeed` (mantiene `packages/db` sin depender en tiempo de
 *      compilación de `@atiende-rv/adapters`).
 *
 * D-DSD-09: a la fecha de este comentario, `apps/api` NO invoca
 * `recuperarDesdeBackup` desde ninguna ruta ni script real — este
 * orquestador solo se ejercita desde pruebas
 * (`packages/db/test/integration/backup.test.ts`,
 * `packages/db/test/backup/exportarRestaurar.test.ts`). El comentario
 * anterior afirmaba que "el llamador real, `apps/api`, sí importa ambos y
 * pasa `reconciliarCompleto`" — verificado FALSO por auditoría (no existe
 * tal importación en `apps/api/src`). `reconciliarFeed` sigue siendo el
 * punto de inyección correcto para cuando exista un runbook/endpoint real
 * de recuperación de desastre; hasta entonces, no hay ningún camino de
 * ejecución en producción que llegue a esta función.
 *
 * El flag NUNCA se reactiva automáticamente dentro de este flujo — eso es
 * una decisión explícita separada (`confirmarReconciliacionYReactivarPush`)
 * que exige que TODOS los feeds reconciliados reporten `sinDrift: true`.
 */
export interface FeedAReconciliar {
  canalId: string;
  unidadId: string;
}

export interface ResultadoReconciliacionFeed extends FeedAReconciliar {
  sinDrift: boolean;
  detalle?: string;
}

export interface OpcionesRecuperarDesdeBackup extends OpcionesVerificarIntegridad {
  registroFlags: RegistroFlags;
  actor: string;
  feeds?: FeedAReconciliar[];
  reconciliarFeed?: (feed: FeedAReconciliar) => Promise<ResultadoReconciliacionFeed>;
}

export interface ReporteRecuperacion {
  restauracion: ReporteRestauracion;
  integridad: ReporteIntegridad;
  pushAutomaticoDesactivado: boolean;
  reconciliacion: ResultadoReconciliacionFeed[];
  /** `false` mientras no se llame a `confirmarReconciliacionYReactivarPush`
   * — incluso si toda la reconciliación salió sin drift. */
  pushAutomaticoReactivado: boolean;
}

export async function recuperarDesdeBackup(
  ejecutorDestino: EjecutorSql,
  backup: BackupLogico,
  opciones: OpcionesRecuperarDesdeBackup,
): Promise<ReporteRecuperacion> {
  const restauracion = await restaurarBackupLogico(ejecutorDestino, backup);
  const integridad = await verificarIntegridad(ejecutorDestino, backup, {
    idsOcupacionAVerificar: opciones.idsOcupacionAVerificar,
  });

  if (!integridad.ok) {
    return {
      restauracion,
      integridad,
      pushAutomaticoDesactivado: false,
      reconciliacion: [],
      pushAutomaticoReactivado: false,
    };
  }

  opciones.registroFlags.establecer({
    flagId: FLAG_SYNC_PUSH_AUTOMATICO,
    valor: false,
    actor: opciones.actor,
    motivo: "restauracion_backup: push automático bloqueado hasta reconciliar drift (§Operación-3)",
  });

  const reconciliacion: ResultadoReconciliacionFeed[] = [];
  if (opciones.reconciliarFeed) {
    for (const feed of opciones.feeds ?? []) {
      reconciliacion.push(await opciones.reconciliarFeed(feed));
    }
  }

  return {
    restauracion,
    integridad,
    pushAutomaticoDesactivado: true,
    reconciliacion,
    pushAutomaticoReactivado: false,
  };
}

export class ReconciliacionIncompletaError extends Error {
  constructor(pendientes: FeedAReconciliar[]) {
    super(
      `No se puede reactivar sync.push_automatico: ${pendientes.length} feed(s) sin reconciliar o con drift detectado ` +
        `(${pendientes.map((f) => `${f.canalId}/${f.unidadId}`).join(", ")}).`,
    );
    this.name = "ReconciliacionIncompletaError";
  }
}

/**
 * Reactiva `sync.push_automatico` — SOLO si `reporte.reconciliacion` no
 * está vacío y TODOS sus elementos reportan `sinDrift: true`. Lanza
 * `ReconciliacionIncompletaError` en cualquier otro caso (incluida la
 * lista vacía: sin evidencia de reconciliación, no se reactiva nada).
 */
export function confirmarReconciliacionYReactivarPush(
  registroFlags: RegistroFlags,
  reporte: ReporteRecuperacion,
  actor: string,
): void {
  const pendientes = reporte.reconciliacion.filter((r) => !r.sinDrift);
  if (reporte.reconciliacion.length === 0 || pendientes.length > 0) {
    throw new ReconciliacionIncompletaError(pendientes.length > 0 ? pendientes : reporte.reconciliacion);
  }
  registroFlags.establecer({
    flagId: FLAG_SYNC_PUSH_AUTOMATICO,
    valor: true,
    actor,
    motivo: `reconciliacion_confirmada: ${reporte.reconciliacion.length} feed(s) sin drift`,
  });
  reporte.pushAutomaticoReactivado = true;
}

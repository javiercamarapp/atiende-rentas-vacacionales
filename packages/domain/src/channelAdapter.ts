/**
 * Contrato `ChannelAdapter`/`ChannelCapabilities` (H-013, REQ-086). Solo la
 * interfaz y el estado de conexión honesto (H-014, D-017) — sin
 * implementación real de ningún canal ni simulador (eso es Lote 2,
 * `packages/adapters` y `packages/sim`).
 */

/**
 * Estado de conexión honesto, tipo cerrado (D-017): `getConnectionState()`
 * nunca puede devolver `"produccion"` sin evidencia verificable de una
 * sincronización real exitosa reciente. `simulador` e `ical` se distinguen
 * explícitamente de la matriz más gruesa de BLUEPRINT §2.3
 * (`no_conectado | bloqueado_por_partner | sandbox | producción`): un
 * simulador (D-019) nunca debe poder disfrazarse de ningún otro estado, y
 * una conexión iCal activa es un estado propio (latencia de horas, D-003),
 * distinto de una integración API en `sandbox`/`producción`.
 * `partner_pendiente` es el nombre usado aquí para el
 * `bloqueado_por_partner` de BLUEPRINT (mismo significado: aprobación de
 * partner externa, PENDIENTE-EXTERNO, D-011).
 */
export type EstadoConexionCanal =
  | "no_conectado"
  | "simulador"
  | "ical"
  | "partner_pendiente"
  | "sandbox"
  | "produccion";

export interface ChannelCapabilities {
  /** Puede recibir push de disponibilidad (cierre/apertura) desde Atiende. */
  availabilityPush: boolean;
  /** Puede recibir push de tarifas desde Atiende. */
  ratesPush: boolean;
  /** Puede entregar reservas confirmadas del canal hacia Atiende. */
  reservationsPull: boolean;
  /** Soporta import/export iCal como vía de disponibilidad. */
  icalImportExport: boolean;
  /** Soporta mensajería con el huésped a través del canal. */
  messaging: boolean;
}

/** Evidencia mínima necesaria para evaluar honestamente el estado de
 * conexión (D-017) — nunca basta con "hay credenciales guardadas". */
export interface EvidenciaConexionCanal {
  credencialesPresentes: boolean;
  esSimulador: boolean;
  /** ISO 8601 del último sync real exitoso, o `null` si nunca hubo uno. */
  ultimaSincronizacionExitosaEn: string | null;
  /** Ventana máxima (ms) para considerar "reciente" una sincronización
   * exitosa; pasado este umbral, nunca se reporta `produccion` aunque haya
   * habido éxito en el pasado (D-017: "evidencia verificable RECIENTE"). */
  ventanaMaximaMs: number;
  /** El canal ya confirmó el acceso de partner (aprobación externa,
   * D-011); sin esto, el máximo estado alcanzable es `partner_pendiente` o
   * `sandbox`, nunca `produccion`. */
  partnerAprobado: boolean;
  /** El acceso confirmado es contra el entorno de pruebas del partner, no
   * el real. */
  esSandbox: boolean;
}

/**
 * Evalúa el estado de conexión honesto (H-014) a partir de evidencia
 * explícita — función pura, sin llamadas de red. El valor por defecto ante
 * ambigüedad es siempre el más conservador (D-017).
 */
export function evaluarEstadoConexion(evidencia: EvidenciaConexionCanal): EstadoConexionCanal {
  if (evidencia.esSimulador) return "simulador";
  if (!evidencia.credencialesPresentes) return "no_conectado";
  if (!evidencia.partnerAprobado) return "partner_pendiente";

  const huboSincronizacionReciente =
    evidencia.ultimaSincronizacionExitosaEn !== null &&
    Date.now() - Date.parse(evidencia.ultimaSincronizacionExitosaEn) <= evidencia.ventanaMaximaMs;

  if (evidencia.esSandbox) return "sandbox";
  // Nunca "produccion" sin sync real exitoso y reciente, aunque el partner
  // ya haya aprobado el acceso (D-017): credenciales+aprobación no son
  // evidencia de que la integración esté funcionando ahora mismo.
  if (!huboSincronizacionReciente) return "partner_pendiente";
  return "produccion";
}

export interface ChannelAdapter {
  readonly nombreCanal: string;
  readonly capacidades: ChannelCapabilities;
  obtenerEstadoConexion(): EstadoConexionCanal | Promise<EstadoConexionCanal>;
}

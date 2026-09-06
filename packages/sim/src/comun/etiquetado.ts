/**
 * Etiquetado inequívoco de simuladores (D-019, H-... §Operación-4). Cada
 * simulador de canal debe: (1) llevar el prefijo `SIMULADOR — desarrollo/
 * pruebas` en nombre/logs/estado de conexión, (2) usar `simulador.local`
 * como host base, (3) rechazar el arranque si las credenciales
 * configuradas PARECEN de producción.
 */

export const ETIQUETA_SIMULADOR = "SIMULADOR — desarrollo/pruebas";
export const HOST_BASE_SIMULADOR = "simulador.local";

export class CredencialesSospechosasDeProduccionError extends Error {
  constructor(motivo: string) {
    super(`Arranque de simulador rechazado: ${motivo} (D-019, nunca confundir simulador con producción)`);
    this.name = "CredencialesSospechosasDeProduccionError";
  }
}

export interface OpcionesArranqueSimulador {
  entorno?: string;
  credenciales?: string | null;
}

/** Patrones heurísticos de "esto parece un secreto real, no de prueba":
 * prefijos de token reales conocidos de los propios canales objetivo, o el
 * entorno declarado explícitamente como producción. No pretende ser
 * exhaustivo — es defensa en profundidad, no el único control (D-019). */
const PATRONES_CREDENCIAL_PRODUCCION = [/^live_/i, /^prod_/i, /^sk_live_/i, /^AIRBNB_PROD_/i, /^BOOKING_PROD_/i];

export function assertNoParecerProduccion(opciones: OpcionesArranqueSimulador): void {
  const entorno = (opciones.entorno ?? process.env.NODE_ENV ?? "").toLowerCase();
  if (entorno === "production" || entorno === "produccion") {
    throw new CredencialesSospechosasDeProduccionError(
      `entorno declarado como "${entorno}" — los simuladores no existen en producción (D-019)`,
    );
  }
  const credenciales = opciones.credenciales ?? "";
  for (const patron of PATRONES_CREDENCIAL_PRODUCCION) {
    if (patron.test(credenciales)) {
      throw new CredencialesSospechosasDeProduccionError(
        `credenciales configuradas coinciden con el patrón "${patron}", típico de un secreto real`,
      );
    }
  }
}

/** Prefija cualquier mensaje de log del simulador con la etiqueta
 * inequívoca — nunca se loguea "Airbnb" a secas. */
export function logSimulador(nombreCanal: string, mensaje: string): string {
  return `[${ETIQUETA_SIMULADOR} · ${nombreCanal}] ${mensaje}`;
}

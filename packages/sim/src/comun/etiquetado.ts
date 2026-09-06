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

/** Quita diacríticos y normaliza mayúsculas/espacios (S-04): el bug
 * original solo hacía `.toLowerCase()`, que NO normaliza acentos —
 * `"producción"` (con tilde, el error tipográfico más plausible en un
 * repo 100% en español) nunca coincidía con `"produccion"`. */
function normalizarEntornoTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Allow-list explícita (S-04, más estricta que la deny-list heredada):
 * únicamente estos valores, declarados EXPLÍCITAMENTE vía `ATIENDE_ENTORNO`
 * o el parámetro `entorno`, permiten arrancar un simulador. Cualquier otro
 * valor explícito (incluida cualquier variante de "producción" mal
 * escrita, con acentos o mayúsculas) bloquea — fail-closed por
 * construcción, no por enumerar formas de escribir "producción". */
const ENTORNOS_SIMULADOR_PERMITIDOS = new Set(["desarrollo", "pruebas", "development", "test", "dev"]);

export function assertNoParecerProduccion(opciones: OpcionesArranqueSimulador): void {
  const entornoExplicito = opciones.entorno ?? process.env.ATIENDE_ENTORNO;

  if (entornoExplicito !== undefined) {
    // Modo allow-list (recomendado, D-019): con `ATIENDE_ENTORNO` (o el
    // parámetro `entorno`) declarado explícitamente, SOLO se acepta si
    // está en la allow-list — independiente de `NODE_ENV` y sin depender
    // de reconocer todas las formas posibles de escribir "producción".
    if (!ENTORNOS_SIMULADOR_PERMITIDOS.has(normalizarEntornoTexto(entornoExplicito))) {
      throw new CredencialesSospechosasDeProduccionError(
        `entorno declarado "${entornoExplicito}" no está en la allow-list de desarrollo/pruebas ` +
          `(ATIENDE_ENTORNO=desarrollo|pruebas) — D-019 exige allow-list explícita`,
      );
    }
  } else {
    // Compatibilidad heredada: sin ATIENDE_ENTORNO/`entorno` explícitos,
    // se infiere de NODE_ENV con una deny-list normalizada (cierra el
    // bypass original de S-04: "producción" con tilde, "PRODUCTION", etc.
    // ya se detectan porque se normalizan diacríticos antes de comparar).
    const normalizado = normalizarEntornoTexto(process.env.NODE_ENV ?? "");
    if (normalizado === "production" || normalizado === "produccion") {
      throw new CredencialesSospechosasDeProduccionError(
        `entorno declarado como "${process.env.NODE_ENV}" — los simuladores no existen en producción (D-019)`,
      );
    }
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

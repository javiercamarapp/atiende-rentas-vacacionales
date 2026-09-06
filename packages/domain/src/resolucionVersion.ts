import { createHash } from "node:crypto";

/**
 * Motor de resolución de versión `UID → SEQUENCE → DTSTAMP` + hash de
 * contenido como respaldo (H-006, REQ-028/167/179). Función pura: no
 * parsea ICS (eso es Lote 2), solo decide qué hacer dado un evento
 * "actual" (o ausente) y uno "entrante" ya normalizados por el llamador.
 *
 * Justificación del orden (RV06 §3, RV07): `SEQUENCE` es la señal de
 * versión recomendada por RFC 5545, pero NO hay evidencia primaria de que
 * los canales la incrementen de forma fiable en feeds `PUBLISH` (sin
 * `METHOD` iTIP) — se trata como señal oportunista, nunca como única
 * fuente de verdad. `DTSTAMP` desempata cuando `SEQUENCE` no decide. El
 * hash de contenido `(unidad, DTSTART, DTEND, razón inferida)` detecta
 * reimportaciones sin cambio real (no-op, anti-eco D-004) y UID reciclado
 * (caso adversarial 13).
 */

export interface VersionEvento {
  uid: string;
  /** `null` cuando el feed de origen no expone SEQUENCE de forma confiable
   * (RV06 §3, laguna documentada). */
  sequence: number | null;
  /** Instante UTC en formato ISO 8601. */
  dtstamp: string;
  /** Hash de `(unidad, DTSTART, DTEND, razón inferida)` — ver
   * `calcularHashContenido`. */
  hash: string;
}

export type AccionResolucion =
  | "aplicar"
  | "descartar"
  | "sin_cambio"
  | "revisar_uid_reciclado";

export interface ResultadoResolucion {
  accion: AccionResolucion;
  /** Explicación legible para auditoría/logs (nunca PII, D-021). */
  motivo: string;
}

/** Hash determinista de contenido, usado como respaldo cuando SEQUENCE y
 * DTSTAMP no alcanzan a decidir, y como detector de eco/no-op (D-004). */
export function calcularHashContenido(campos: {
  unidadId: string;
  dtstart: string;
  dtend: string;
  razon: string;
}): string {
  const canonico = `${campos.unidadId}|${campos.dtstart}|${campos.dtend}|${campos.razon}`;
  return createHash("sha256").update(canonico).digest("hex");
}

export function resolverVersion(
  actual: VersionEvento | null,
  entrante: VersionEvento,
): ResultadoResolucion {
  if (actual === null) {
    return { accion: "aplicar", motivo: "no existe versión previa para este UID" };
  }
  if (actual.uid !== entrante.uid) {
    throw new Error(
      `resolverVersion recibió UIDs distintos ("${actual.uid}" vs "${entrante.uid}"); ` +
        "el llamador debe agrupar por UID antes de invocar esta función",
    );
  }

  // Reimportación exacta (mismo contenido) → no-op explícito, nunca crea
  // un segundo bloqueo (caso adversarial 7, anti-eco D-004).
  if (actual.hash === entrante.hash) {
    return { accion: "sin_cambio", motivo: "hash de contenido idéntico al almacenado" };
  }

  const secuenciaComparable = actual.sequence !== null && entrante.sequence !== null;

  if (secuenciaComparable && entrante.sequence !== actual.sequence) {
    // SEQUENCE mayor gana, sin importar el orden de llegada real (caso
    // adversarial 3: un CANCEL con SEQUENCE menor que un CREATE/UPDATE
    // posterior nunca se aplica como estado final, aunque llegue después).
    if (entrante.sequence! > actual.sequence!) {
      // Heurística de UID reciclado (caso adversarial 13): un SEQUENCE
      // mayor pero un DTSTAMP anterior al almacenado, con contenido
      // completamente distinto, es más consistente con "este UID se
      // reutilizó para una reserva nueva y no relacionada" que con "esta es
      // una revisión legítima más nueva de la misma reserva" — nunca se
      // fusiona en silencio, se marca para revisión humana.
      if (entrante.dtstamp < actual.dtstamp) {
        return {
          accion: "revisar_uid_reciclado",
          motivo:
            "SEQUENCE entrante mayor pero DTSTAMP anterior al almacenado, con contenido distinto",
        };
      }
      return { accion: "aplicar", motivo: "SEQUENCE entrante mayor" };
    }
    return { accion: "descartar", motivo: "SEQUENCE entrante menor o igual, evento desordenado" };
  }

  // SEQUENCE no comparable (ausente en uno de los dos, o feed sin
  // garantía) o SEQUENCE igual: DTSTAMP decide (caso adversarial 1: mismo
  // UID+SEQUENCE, contenido distinto → DTSTAMP desempata).
  if (entrante.dtstamp > actual.dtstamp) {
    return { accion: "aplicar", motivo: "DTSTAMP entrante más reciente" };
  }
  if (entrante.dtstamp < actual.dtstamp) {
    return { accion: "descartar", motivo: "DTSTAMP entrante más antiguo" };
  }

  // SEQUENCE igual (o no comparable) y DTSTAMP igual, pero hash distinto:
  // dos eventos afirman ser exactamente la misma versión con contenido
  // distinto — ambigüedad genuina, nunca se resuelve por inferencia
  // silenciosa (mismo espíritu que "UID reciclado", pero sin la señal de
  // SEQUENCE/DTSTAMP invertidos).
  return {
    accion: "revisar_uid_reciclado",
    motivo: "SEQUENCE y DTSTAMP idénticos con hash de contenido distinto",
  };
}

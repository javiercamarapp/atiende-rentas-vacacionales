import { rangoCubreNoche } from "./fechas.js";
import { PRECEDENCIA_RAZON } from "./tipos.js";
import type { FechaLocal, Ocupacion } from "./tipos.js";

/**
 * `ocupado(unidad, noche) = ∃ bloqueo activo b : noche ∈ [DTSTART(b), DTEND(b))`
 * (D-002, BLUEPRINT §2.4). "Activo" es `estado <> 'cancelado'`. Una fila
 * `capa='bloqueo'` (propietario/mantenimiento/buffer) SIEMPRE cuenta como
 * ocupación en lectura, sin importar `bloqueante` — ese campo solo decide
 * si la fila participa del EXCLUDE de base de datos (D-002, corrección
 * BC1). Una fila `capa='reserva'` cuenta como ocupación en lectura
 * únicamente si `bloqueante=true`: una solicitud pendiente que el canal de
 * origen NO bloquea (Booking `INQUIRY`, REQ-068, `bloqueante=false`) queda
 * registrada pero nunca hace que la noche se lea como ocupada.
 */
function filaCuentaComoOcupacion(o: Ocupacion): boolean {
  if (o.estado === "cancelado") return false;
  if (o.capa === "bloqueo") return true;
  return o.bloqueante;
}

export function estaOcupada(ocupaciones: readonly Ocupacion[], noche: FechaLocal): boolean {
  return ocupaciones.some((o) => filaCuentaComoOcupacion(o) && rangoCubreNoche(o.rango, noche));
}

/** Ocupaciones que cuentan como ocupación real para `noche` (mismo filtro
 * que `estaOcupada`), útil para exponer "por qué está cerrada esta fecha"
 * en la UI (RV09-R-01, §UX-1). */
export function ocupacionesActivasEnNoche(
  ocupaciones: readonly Ocupacion[],
  noche: FechaLocal,
): Ocupacion[] {
  return ocupaciones.filter((o) => filaCuentaComoOcupacion(o) && rangoCubreNoche(o.rango, noche));
}

/** La razón de mayor precedencia entre las ocupaciones activas que cubren
 * `noche`, o `null` si la noche está libre. Cancelar la razón dominante
 * nunca reabre la noche si otra razón de igual/menor precedencia todavía
 * la cubre (H-018, caso adversarial 5) — esto se cumple por construcción:
 * `razonDominante` simplemente recalcula sobre las filas restantes. */
export function razonDominante(
  ocupaciones: readonly Ocupacion[],
  noche: FechaLocal,
): Ocupacion | null {
  const activas = ocupacionesActivasEnNoche(ocupaciones, noche);
  if (activas.length === 0) return null;
  return activas.reduce((mayor, actual) =>
    PRECEDENCIA_RAZON[actual.razon] > PRECEDENCIA_RAZON[mayor.razon] ? actual : mayor,
  );
}

/** `true` si insertar `nueva` requeriría pasar por el EXCLUDE de base de
 * datos (D-012): solo filas `capa='reserva'`, `estado<>'cancelado'` y
 * `bloqueante=true` participan. Todo lo demás (bloqueos, provisionales no
 * bloqueantes) se acepta siempre a nivel de BD y su posible conflicto se
 * detecta en la capa de aplicación (ver aplicacion/conflictos.ts). */
export function participaDelExclude(o: Pick<Ocupacion, "capa" | "estado" | "bloqueante">): boolean {
  return o.capa === "reserva" && o.estado !== "cancelado" && o.bloqueante;
}

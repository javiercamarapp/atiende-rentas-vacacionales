import type { LineaPayoutEntrada, ReservaConciliable, ResultadoConciliacionLinea } from "./tipos.js";

/**
 * Conciliación payout ↔ reservas (H-064, RV12 §4, Finanzas-2). Por diseño
 * (adaptador por canal, no un formato único — RV12-R-04): esta función solo
 * recibe datos ya normalizados a un esquema interno común
 * (`ReservaConciliable`/`LineaPayoutEntrada`); el parseo del CSV/XLS oficial
 * de cada canal (Vrbo primero, caso de referencia confirmado con fuente
 * primaria) es responsabilidad de la capa de adaptador en apps/api, no de
 * este motor puro.
 *
 * Reglas de emparejamiento, en orden:
 * 1. `referenciaExternaReserva` de la línea coincide con `externalId` de una
 *    reserva → emparejamiento directo por referencia.
 * 2. Sin referencia (o sin coincidencia), se intenta por monto exacto contra
 *    una reserva sin emparejar todavía (mismo `montoEsperadoCentavos`).
 * 3. Si no hay ninguna coincidencia, la línea queda `pendiente`
 *    (sin reserva asociada, requiere revisión manual).
 * 4. Si hay una reserva candidata pero el monto no coincide exactamente, el
 *    estado es `discrepancia` (nunca se concilia "a ojo" por cercanía).
 */
export function conciliarPayout(
  lineasPayout: LineaPayoutEntrada[],
  reservas: ReservaConciliable[],
): ResultadoConciliacionLinea[] {
  const reservasPorExternalId = new Map<string, ReservaConciliable>();
  const reservasSinAsignar = new Set<ReservaConciliable>();
  for (const r of reservas) {
    if (r.externalId) reservasPorExternalId.set(r.externalId, r);
    reservasSinAsignar.add(r);
  }

  const resultados: ResultadoConciliacionLinea[] = [];

  for (const linea of lineasPayout) {
    let candidata: ReservaConciliable | null = null;

    if (linea.referenciaExternaReserva) {
      const porReferencia = reservasPorExternalId.get(linea.referenciaExternaReserva);
      if (porReferencia && reservasSinAsignar.has(porReferencia)) {
        candidata = porReferencia;
      }
    }

    if (!candidata) {
      for (const r of reservasSinAsignar) {
        if (r.montoEsperadoCentavos === linea.montoCentavos) {
          candidata = r;
          break;
        }
      }
    }

    if (!candidata) {
      resultados.push({
        referenciaExternaReserva: linea.referenciaExternaReserva ?? null,
        ocupacionUnidadId: null,
        montoCentavos: linea.montoCentavos,
        montoEsperadoCentavos: null,
        estado: "pendiente",
        nota: "Sin reserva candidata (ni por referencia ni por monto exacto) — requiere asociación manual",
      });
      continue;
    }

    reservasSinAsignar.delete(candidata);
    const coincide = candidata.montoEsperadoCentavos === linea.montoCentavos;
    resultados.push({
      referenciaExternaReserva: linea.referenciaExternaReserva ?? candidata.externalId,
      ocupacionUnidadId: candidata.ocupacionUnidadId,
      montoCentavos: linea.montoCentavos,
      montoEsperadoCentavos: candidata.montoEsperadoCentavos,
      estado: coincide ? "conciliado" : "discrepancia",
      nota: coincide
        ? "Monto del payout coincide exactamente con el esperado"
        : `Discrepancia: payout ${linea.montoCentavos} centavos vs. esperado ${candidata.montoEsperadoCentavos} centavos`,
    });
  }

  return resultados;
}

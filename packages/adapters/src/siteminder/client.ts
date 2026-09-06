/**
 * Cliente contra SiteMinder pmsXchange (Nivel B, "puente" — RV22 F24-F25):
 * un solo contrato/integración con SiteMinder cubre Booking.com, Expedia,
 * Vrbo, Despegar y PriceTravel (4-5 de 5 canales objetivo, según la tabla
 * de "Booking Agent Codes" de `developer.siteminder.com`) sin certificarse
 * directamente con cada uno.
 *
 * Honestidad de esquema: RV22 (F25) confirma que pmsXchange documenta
 * públicamente push de "real-time rates, availability, and restrictions" y
 * recuperación de reservas incluyendo modificaciones/cancelaciones, pero
 * NO cita los nombres exactos de elemento/atributo de su variante de OTA
 * XML (a diferencia de Booking.com/B.XML, RV04, donde sí se citaron
 * `roomstosell`/`closedonarrival`/etc.). Este cliente modela la SEMÁNTICA
 * documentada con una forma JSON propia — nunca inventa un esquema XML no
 * confirmado por la fuente (regla de esta construcción: "cada capacidad
 * declarada cita el ID de fuente F-xxx"). Cuando SiteMinder entregue la
 * documentación real de payload (tras firmar el contrato comercial,
 * RV22-R-04), este cliente debe reemplazar la serialización JSON por el
 * formato XML real sin cambiar la interfaz pública.
 */
export interface ActualizacionInventarioPmsXchange {
  /** Código de canal downstream al que SiteMinder reenvía esta
   * actualización — BDC (Booking.com), EXP (Expedia), VRB (Vrbo), DDC
   * (Despegar), PRC/PTL (PriceTravel) — tabla de códigos F24. */
  canalDestino: "BDC" | "EXP" | "VRB" | "DDC" | "PRC";
  unidadExternaId: string;
  fecha: string; // ISO AAAA-MM-DD
  disponible: number;
  cerrado: boolean;
  tarifa?: number;
  restricciones?: {
    estanciaMinima?: number;
    estanciaMaxima?: number;
    cerradoLlegada?: boolean;
    cerradoSalida?: boolean;
  };
}

export type EstadoReservaPmsXchange = "nueva" | "modificada" | "cancelada";

export interface ReservaPmsXchange {
  id: string;
  canalOrigen: "BDC" | "EXP" | "VRB" | "DDC" | "PRC";
  unidadExternaId: string;
  checkIn: string;
  checkOut: string;
  estado: EstadoReservaPmsXchange;
}

export interface OpcionesClientePmsXchange {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class ErrorClientePmsXchange extends Error {}

export class SiteMinderPmsXchangeClient {
  constructor(private readonly opciones: OpcionesClientePmsXchange) {}

  private get fetchFn(): typeof fetch {
    return this.opciones.fetchImpl ?? fetch;
  }

  /** Push de disponibilidad/tarifas/restricciones hacia el canal
   * downstream indicado en cada actualización (F25). */
  async empujarInventario(
    apiKey: string,
    actualizaciones: readonly ActualizacionInventarioPmsXchange[],
  ): Promise<{ aceptadas: number }> {
    const resp = await this.fetchFn(`${this.opciones.baseUrl}/pmsxchange/inventario`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({ actualizaciones }),
    });
    if (!resp.ok) throw new ErrorClientePmsXchange(`push de inventario pmsXchange falló: HTTP ${resp.status}`);
    return (await resp.json()) as { aceptadas: number };
  }

  /** Pull de reservas — incluye modificaciones y cancelaciones (F25); sin
   * mecanismo de `ack` documentado por la fuente (a diferencia de Booking/
   * Expedia), así que la deduplicación aquí es por `(id, estado)` en vez
   * de por confirmación explícita. */
  async recuperarReservas(apiKey: string): Promise<ReservaPmsXchange[]> {
    const resp = await this.fetchFn(`${this.opciones.baseUrl}/pmsxchange/reservas`, {
      headers: { "X-Api-Key": apiKey },
    });
    if (!resp.ok) throw new ErrorClientePmsXchange(`pull de reservas pmsXchange falló: HTTP ${resp.status}`);
    const cuerpo = (await resp.json()) as { reservas: ReservaPmsXchange[] };
    return cuerpo.reservas;
  }
}

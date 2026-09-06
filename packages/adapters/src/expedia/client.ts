/**
 * Cliente HTTP contra el sandbox de Expedia Group Lodging Connectivity
 * (Nivel B, RV22 F04-F13): OAuth2 client_credentials + push de
 * disponibilidad/tarifas (Availability & Rates) + pull de reservas
 * (Booking Retrieval) + confirmación separada (Booking Confirmation).
 * Apunta por defecto a `api.sandbox.expediagroup.com` (F12) — nunca a
 * producción sin credenciales reales de partner aprobadas
 * (`partnerAprobado`, D-017). En pruebas/contrato, `baseUrl` apunta al
 * simulador local `ExpediaApiSimulator` (D-019), nunca a un host real.
 */
export const HOST_SANDBOX_EXPEDIA = "https://api.sandbox.expediagroup.com";

/** F06: Availability & Rates admite un máximo de 5,000 actualizaciones por
 * mensaje — este cliente NUNCA envía un lote mayor, dividiendo en varias
 * llamadas si hace falta. */
export const LIMITE_ACTUALIZACIONES_POR_MENSAJE_EXPEDIA = 5000;

/** F09: Booking Retrieval (legado SOAP/XML "EQC") limita a 125 registros
 * por llamada — el reemplazo GraphQL declarado "en mantenimiento" permite
 * hasta 10,000 paginados, pero este cliente modela la vía legacy vigente
 * documentada en RV22, la única con spec pública leída con detalle. */
export const LIMITE_REGISTROS_POR_LLAMADA_BOOKING_RETRIEVAL = 125;

export interface CredencialesExpedia {
  clientId: string;
  clientSecret: string;
}

export interface ActualizacionDisponibilidadExpedia {
  expediaPropertyId: string;
  expediaRoomTypeId: string;
  fecha: string; // ISO AAAA-MM-DD
  disponible: number;
  cerrado: boolean;
}

export interface LoteActualizacionDisponibilidad {
  actualizaciones: ActualizacionDisponibilidadExpedia[];
}

/** Divide una lista de actualizaciones en lotes de máximo
 * `LIMITE_ACTUALIZACIONES_POR_MENSAJE_EXPEDIA` (F06) — función pura, sin
 * red, para poder probarla sin el simulador. */
export function dividirEnLotesDisponibilidad(
  actualizaciones: readonly ActualizacionDisponibilidadExpedia[],
): LoteActualizacionDisponibilidad[] {
  const lotes: LoteActualizacionDisponibilidad[] = [];
  for (let i = 0; i < actualizaciones.length; i += LIMITE_ACTUALIZACIONES_POR_MENSAJE_EXPEDIA) {
    lotes.push({ actualizaciones: actualizaciones.slice(i, i + LIMITE_ACTUALIZACIONES_POR_MENSAJE_EXPEDIA) });
  }
  return lotes.length > 0 ? lotes : [{ actualizaciones: [] }];
}

export type EstadoReservaExpedia = "nueva" | "modificada" | "cancelada";

export interface ReservaExpedia {
  hotelReservationId: string;
  expediaPropertyId: string;
  checkIn: string;
  checkOut: string;
  estado: EstadoReservaExpedia;
}

export interface OpcionesClienteExpedia {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class ErrorClienteExpedia extends Error {}

/**
 * Cliente delgado: construye las peticiones exactas contra la spec
 * documentada (RV22 F04-F13), respetando los límites de la API. Sin
 * credenciales de partner reales (D-017/D-011), su único uso hasta ahora
 * es contra `ExpediaApiSimulator` en pruebas de contrato.
 */
export class ExpediaApiClient {
  constructor(private readonly opciones: OpcionesClienteExpedia) {}

  private get fetchFn(): typeof fetch {
    return this.opciones.fetchImpl ?? fetch;
  }

  /** OAuth2 client_credentials (F11) — sin "NDA" explícito documentado,
   * pero sí PCI/TLS/license agreement como requisito de partner. */
  async autenticar(credenciales: CredencialesExpedia): Promise<{ accessToken: string; expiraEnSegundos: number }> {
    const resp = await this.fetchFn(`${this.opciones.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credenciales.clientId,
        client_secret: credenciales.clientSecret,
      }).toString(),
    });
    if (!resp.ok) throw new ErrorClienteExpedia(`autenticación Expedia falló: HTTP ${resp.status}`);
    return (await resp.json()) as { accessToken: string; expiraEnSegundos: number };
  }

  /** Push de disponibilidad/tarifas (Availability & Rates, F04-F07) —
   * divide en lotes de máximo 5,000 (F06) antes de enviar. */
  async empujarDisponibilidad(
    accessToken: string,
    actualizaciones: readonly ActualizacionDisponibilidadExpedia[],
  ): Promise<{ lotesEnviados: number }> {
    const lotes = dividirEnLotesDisponibilidad(actualizaciones);
    for (const lote of lotes) {
      const resp = await this.fetchFn(`${this.opciones.baseUrl}/supply/lodging/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(lote),
      });
      if (!resp.ok) throw new ErrorClienteExpedia(`push de disponibilidad Expedia falló: HTTP ${resp.status}`);
    }
    return { lotesEnviados: lotes.length };
  }

  /** Pull de reservas (Booking Retrieval, F09) — máximo 125 por llamada;
   * Expedia REENVÍA reservas no confirmadas en cada llamada hasta recibir
   * `confirmarReserva` (BookingConfirmRQ), igual patrón que Booking.com
   * (RV04) aunque con nombre de operación distinto. */
  async recuperarReservas(accessToken: string, opciones: { limite?: number } = {}): Promise<ReservaExpedia[]> {
    const limite = Math.min(opciones.limite ?? LIMITE_REGISTROS_POR_LLAMADA_BOOKING_RETRIEVAL, LIMITE_REGISTROS_POR_LLAMADA_BOOKING_RETRIEVAL);
    const resp = await this.fetchFn(`${this.opciones.baseUrl}/supply/lodging/booking-retrieval?limit=${limite}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new ErrorClienteExpedia(`booking retrieval Expedia falló: HTTP ${resp.status}`);
    const cuerpo = (await resp.json()) as { reservas: ReservaExpedia[] };
    return cuerpo.reservas;
  }

  /** Confirmación separada (BookingConfirmRQ, F09) — sin esta llamada,
   * Expedia sigue reenviando la misma reserva en cada `recuperarReservas`
   * (mismo riesgo de "ack perdido" que Booking.com, RV04 F07). */
  async confirmarReserva(accessToken: string, hotelReservationId: string): Promise<void> {
    const resp = await this.fetchFn(`${this.opciones.baseUrl}/supply/lodging/booking-confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ hotelReservationId }),
    });
    if (!resp.ok) throw new ErrorClienteExpedia(`confirmación de reserva Expedia falló: HTTP ${resp.status}`);
  }
}

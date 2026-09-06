import {
  evaluarEstadoConexion,
  type ChannelAdapter,
  type ChannelCapabilities,
  type EstadoConexionCanal,
  type EvidenciaConexionCanal,
} from "@atiende-rv/domain";

/**
 * Adaptador "puente" de SiteMinder pmsXchange (Nivel B, RV22 §3, F24-F25):
 * un solo contrato/integración con SiteMinder actúa de intermediario ya
 * certificado hacia Booking.com, Expedia, Vrbo, Despegar y PriceTravel —
 * en vez de certificarse por separado con cada uno. RV22-R-04: evaluar
 * esta vía comercial ANTES de comprometer ingeniería en certificación
 * directa con Despegar/PriceTravel (que no tienen spec pública propia,
 * F16-F23).
 *
 * `canalesCubiertos` documenta exactamente los códigos de "Booking Agent"
 * confirmados por la tabla técnica pública de `developer.siteminder.com`
 * (F24) — Best Day NO aparece en esa tabla, así que nunca se lista aquí
 * sin nueva evidencia (RV22-R-04, RV22-R-09).
 */
export const CANALES_CUBIERTOS_SITEMINDER = ["booking", "expedia", "vrbo", "despegar", "pricetravel"] as const;

export const LATENCIA_SITEMINDER_PMSXCHANGE = {
  descripcion: 'push "real-time" declarado por SiteMinder, sin cifra numérica de latencia publicada',
  confianza: "media" as const,
  minutosEstimados: null,
  fuente: "docs/investigacion/RV22-canales-mexico.md F25",
};

export const CAPACIDADES_SITEMINDER: ChannelCapabilities = {
  availabilityPush: true,
  ratesPush: true,
  reservationsPull: true,
  icalImportExport: false,
  messaging: false,
};

export const MOTIVO_PARTNER_PENDIENTE_SITEMINDER =
  "Requiere contrato comercial con SiteMinder (no autoservicio abierto); pmsXchange documentado públicamente en " +
  "developer.siteminder.com pero el alta es negociación directa con el proveedor (RV22 F24-F25)";

export class SiteMinderPmsXchangeAdapter implements ChannelAdapter {
  readonly nombreCanal = "siteminder";
  readonly capacidades = CAPACIDADES_SITEMINDER;
  readonly latenciaDeclarada = LATENCIA_SITEMINDER_PMSXCHANGE;
  readonly motivoPartnerPendiente = MOTIVO_PARTNER_PENDIENTE_SITEMINDER;
  readonly canalesCubiertos = CANALES_CUBIERTOS_SITEMINDER;

  constructor(private readonly evidencia: EvidenciaConexionCanal) {}

  obtenerEstadoConexion(): EstadoConexionCanal {
    return evaluarEstadoConexion(this.evidencia);
  }
}

export {
  SiteMinderPmsXchangeClient,
  ErrorClientePmsXchange,
} from "./client.js";
export type {
  ActualizacionInventarioPmsXchange,
  ReservaPmsXchange,
  EstadoReservaPmsXchange,
  OpcionesClientePmsXchange,
} from "./client.js";

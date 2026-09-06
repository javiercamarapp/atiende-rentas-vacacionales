import {
  evaluarEstadoConexion,
  type ChannelAdapter,
  type ChannelCapabilities,
  type EstadoConexionCanal,
  type EvidenciaConexionCanal,
} from "@atiende-rv/domain";

/**
 * ESQUELETO — Vrbo API propia (stack heredado de HomeAway), Nivel B, RV22
 * F13. DELIBERADAMENTE separado de `VrboChannelAdapter` (iCal, Nivel A,
 * `./adapter.ts`) y de `ExpediaChannelAdapter` (`../expedia/adapter.ts`):
 * RV22 cerró una laguna abierta desde RV05 confirmando que **Vrbo NO
 * comparte la misma superficie técnica de disponibilidad/reservas que
 * Expedia** (RV22-R-02/R-05) — hay una capa GraphQL compartida solo para
 * contenido/compliance, pero Vrbo tiene su propio "Lodging Rate update
 * service", "Unit Availability update service", "Booking service" y
 * "Booking update service (BUS)" heredados de HomeAway (evidencia de
 * `assignedSystemId="FAUX_PMS_HAXML_1_2"` en la documentación de Expedia
 * Group), con credenciales/tokens NO intercambiables con los de Expedia.
 *
 * Este archivo es un ESQUELETO sin cliente HTTP real: la documentación de
 * Expedia Group declara explícitamente "Retrieving reservations for Vrbo
 * properties is not supported at this time" para la vía moderna, y el
 * detalle de payload del stack legacy heredado de HomeAway no se pudo
 * verificar con el mismo nivel de detalle que Booking.com/Expedia en esta
 * investigación (RV22 F13) — construir un cliente con un esquema inventado
 * violaría la regla de esta construcción ("no inventes capacidades que la
 * fuente no documente"). Por eso, a diferencia de Expedia/Booking/
 * SiteMinder, este adaptador NO tiene simulador — solo existe cuando hay
 * spec verificable para ejercitarlo con honestidad (RV22 NIVEL B, ítem
 * "Vrbo API (stack propio)": "sin simulador si la spec no es pública").
 */
export const LATENCIA_VRBO_API = {
  descripcion: "Sin SLA propio confirmado (no compartido con Expedia)",
  confianza: "baja" as const,
  minutosEstimados: null,
  fuente: "docs/investigacion/RV22-canales-mexico.md F13",
};

export const CAPACIDADES_VRBO_API: ChannelCapabilities = {
  availabilityPush: true,
  ratesPush: true,
  reservationsPull: true,
  icalImportExport: false,
  messaging: false,
};

export const MOTIVO_PARTNER_PENDIENTE_VRBO_API =
  "Onboarding vía un Integration Engagement Manager de Vrbo (sin portal self-service) con whitelisting de IP de " +
  "hasta ~3 semanas; Connectivity Partner Program de 3 niveles (Elite/Preferred/Integrated), requisitos exactos " +
  "por nivel no confirmados (RV22 F13, D-011)";

export class VrboApiChannelAdapter implements ChannelAdapter {
  readonly nombreCanal = "vrbo";
  readonly capacidades = CAPACIDADES_VRBO_API;
  readonly latenciaDeclarada = LATENCIA_VRBO_API;
  readonly motivoPartnerPendiente = MOTIVO_PARTNER_PENDIENTE_VRBO_API;

  constructor(private readonly evidencia: EvidenciaConexionCanal) {}

  obtenerEstadoConexion(): EstadoConexionCanal {
    return evaluarEstadoConexion(this.evidencia);
  }
}

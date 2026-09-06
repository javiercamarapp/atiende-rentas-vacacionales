import {
  evaluarEstadoConexion,
  type ChannelAdapter,
  type ChannelCapabilities,
  type EstadoConexionCanal,
  type EvidenciaConexionCanal,
} from "@atiende-rv/domain";

/**
 * Adaptador real de Vrbo vía iCal (import/export), H-023/H-026. Latencia
 * documentada (D-003, RV05): "Calendars sync every 30 minutes" + hasta 20
 * minutos adicionales de propagación al dashboard web — cifra oficial de
 * mayor confianza que la de Airbnb (Vrbo la publica en su propia app,
 * sin la extrapolación de S1 de RV03).
 */
export const LATENCIA_VRBO_ICAL = {
  descripcion: "~30 minutos nominal + hasta 20 minutos de propagación adicional (documentado por Vrbo)",
  confianza: "media-alta" as const,
  minutosEstimados: 50,
  fuente: "docs/investigacion/RV05-vrbo-extensibilidad.md, D-003",
};

export const CAPACIDADES_VRBO: ChannelCapabilities = {
  availabilityPush: true,
  ratesPush: false,
  reservationsPull: false,
  icalImportExport: true,
  messaging: false,
};

export class VrboChannelAdapter implements ChannelAdapter {
  readonly nombreCanal = "vrbo";
  readonly capacidades = CAPACIDADES_VRBO;
  readonly latenciaDeclarada = LATENCIA_VRBO_ICAL;

  constructor(private readonly evidencia: EvidenciaConexionCanal) {}

  obtenerEstadoConexion(): EstadoConexionCanal {
    return evaluarEstadoConexion(this.evidencia);
  }
}

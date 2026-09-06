import {
  evaluarEstadoConexion,
  type ChannelAdapter,
  type ChannelCapabilities,
  type EstadoConexionCanal,
  type EvidenciaConexionCanal,
} from "@atiende-rv/domain";

/**
 * Adaptador real de Airbnb vía iCal (import/export), H-023/H-026. Latencia
 * externa documentada (D-003): Airbnb sincroniza calendarios importados
 * "cada 3 horas" — cifra confirmada verbatim para sync entre calendarios
 * de terceros, con CONFIANZA BAJA/MEDIA para su extrapolación general
 * (RV03 §Supuestos S1). Nunca se presenta como "tiempo real".
 */
export const LATENCIA_AIRBNB_ICAL = {
  descripcion: "~3 horas (ciclo de sincronización documentado por Airbnb para calendarios importados)",
  confianza: "baja-media" as const,
  minutosEstimados: 180,
  fuente: "docs/investigacion/RV03-airbnb-capacidades.md, D-003",
};

export const CAPACIDADES_AIRBNB: ChannelCapabilities = {
  availabilityPush: true,
  ratesPush: false,
  reservationsPull: false,
  icalImportExport: true,
  messaging: false,
};

export class AirbnbChannelAdapter implements ChannelAdapter {
  readonly nombreCanal = "airbnb";
  readonly capacidades = CAPACIDADES_AIRBNB;
  readonly latenciaDeclarada = LATENCIA_AIRBNB_ICAL;

  constructor(private readonly evidencia: EvidenciaConexionCanal) {}

  obtenerEstadoConexion(): EstadoConexionCanal {
    return evaluarEstadoConexion(this.evidencia);
  }
}

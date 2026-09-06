import {
  evaluarEstadoConexion,
  type ChannelAdapter,
  type ChannelCapabilities,
  type EstadoConexionCanal,
  type EvidenciaConexionCanal,
} from "@atiende-rv/domain";

/**
 * Adaptador real de Agoda vía "calendar link" (Nivel A, RV22 §2.8/§4).
 * Reutiliza el MISMO motor iCal que Airbnb/Vrbo
 * (`packages/adapters/src/sync/motor.ts`) — Agoda expone en su
 * extranet/YCS un enlace de calendario funcionalmente equivalente a un
 * feed iCal (RFC 5545), aunque sin la marca "iCal" explícita en su propia
 * documentación [R, RV05].
 *
 * A diferencia de Airbnb/Vrbo, este vínculo transporta SOLO
 * disponibilidad (sin tarifas ni restricciones): `icalImportExport` se
 * declara `true` pero `ratesPush` permanece `false`, igual que en los
 * otros dos canales Nivel A.
 *
 * Latencia [R, no confirmado con cifra exacta por el propio canal]:
 * RV05 reporta "varias veces al día" sin cifra oficial — se declara con
 * CONFIANZA BAJA, nunca se presenta como un ciclo fijo en minutos/horas
 * (a diferencia de Airbnb ~3h o Vrbo ~30min, ambos con cita numérica
 * directa del canal). La cobertura Content Push API / YCS (posible vía
 * partner para homes/vacation rentals) quedó como laguna sin verificar
 * por bloqueo de SPA en esta investigación (RV22 F31) — no se construye
 * ningún adaptador de API partner para Agoda hasta cerrar esa laguna.
 */
export const LATENCIA_AGODA_ICAL = {
  descripcion: '"varias veces al día" (RV05, sin cifra oficial exacta — no confirmado directamente por Agoda)',
  confianza: "baja" as const,
  minutosEstimados: null,
  fuente: "docs/investigacion/RV22-canales-mexico.md F31, RV05 [R]",
};

export const CAPACIDADES_AGODA: ChannelCapabilities = {
  availabilityPush: true,
  ratesPush: false,
  reservationsPull: false,
  icalImportExport: true,
  messaging: false,
};

export class AgodaChannelAdapter implements ChannelAdapter {
  readonly nombreCanal = "agoda";
  readonly capacidades = CAPACIDADES_AGODA;
  readonly latenciaDeclarada = LATENCIA_AGODA_ICAL;

  constructor(private readonly evidencia: EvidenciaConexionCanal) {}

  obtenerEstadoConexion(): EstadoConexionCanal {
    return evaluarEstadoConexion(this.evidencia);
  }
}

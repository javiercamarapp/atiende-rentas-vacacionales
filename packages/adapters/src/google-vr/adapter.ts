import {
  evaluarEstadoConexion,
  type ChannelAdapter,
  type ChannelCapabilities,
  type EstadoConexionCanal,
  type EvidenciaConexionCanal,
} from "@atiende-rv/domain";

/**
 * ESQUELETO — Google Vacation Rentals (Nivel B, RV22 F29-F30): programa de
 * feeds XML (Property Listings + Pricing + Landing Pages) vigente en 2026,
 * pero EXCLUSIVAMENTE por invitación de un Technical Account Manager de
 * Google, sin autoservicio (RV22-R-08). El feed de "Pricing" (disponibilidad
 * y tarifa) es específico y separado del de contenido — dato más granular
 * que el conocido hasta RV05 — pero su referencia técnica exacta de campos
 * no se localizó (URLs candidatas dieron 404 por slug incorrecto, laguna
 * honesta, RV22 §8).
 *
 * Sin cliente/builder de feed XML: sin el esquema exacto de campos del
 * feed "Pricing" confirmado por fuente primaria, construir un generador
 * de XML sería inventar una capacidad no documentada. Cuando Google
 * otorgue la invitación (Technical Account Manager) y comparta la
 * referencia técnica real, este adaptador debe ganar un cliente real sin
 * cambiar su interfaz pública.
 */
export const LATENCIA_GOOGLE_VR = {
  descripcion: "Sin SLA publicado",
  confianza: "baja" as const,
  minutosEstimados: null,
  fuente: "docs/investigacion/RV22-canales-mexico.md F29-F30",
};

export const CAPACIDADES_GOOGLE_VR: ChannelCapabilities = {
  availabilityPush: true,
  ratesPush: true,
  reservationsPull: false,
  icalImportExport: false,
  messaging: false,
};

export const MOTIVO_PARTNER_PENDIENTE_GOOGLE_VR =
  "Programa exclusivamente por invitación de un Technical Account Manager de Google, sin autoservicio " +
  "(RV22-R-08); no debe aparecer en el roadmap salvo que el cliente ancla ya tenga invitación vigente";

export class GoogleVacationRentalsAdapter implements ChannelAdapter {
  readonly nombreCanal = "google_vr";
  readonly capacidades = CAPACIDADES_GOOGLE_VR;
  readonly latenciaDeclarada = LATENCIA_GOOGLE_VR;
  readonly motivoPartnerPendiente = MOTIVO_PARTNER_PENDIENTE_GOOGLE_VR;

  constructor(private readonly evidencia: EvidenciaConexionCanal) {}

  obtenerEstadoConexion(): EstadoConexionCanal {
    return evaluarEstadoConexion(this.evidencia);
  }
}

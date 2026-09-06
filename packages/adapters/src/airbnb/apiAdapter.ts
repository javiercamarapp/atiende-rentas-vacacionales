import {
  evaluarEstadoConexion,
  type ChannelAdapter,
  type ChannelCapabilities,
  type EstadoConexionCanal,
  type EvidenciaConexionCanal,
} from "@atiende-rv/domain";

/**
 * ESQUELETO — Airbnb API partner (Homes API/Activities API), Nivel B,
 * RV22 §2.1/RV03. DELIBERADAMENTE separado de `AirbnbChannelAdapter`
 * (iCal, Nivel A, `./adapter.ts`): la API de partner exige NDA firmado,
 * revisión de seguridad de datos y certificación (RV03 §5), con Sandbox
 * V2 vigente pero sin scopes/campos exactos confirmados (RV22 F01 —
 * verificación de continuidad 2026-09-06, sin cambios respecto a RV03).
 *
 * Esqueleto sin cliente HTTP real: el acceso al programa está bloqueado
 * tras NDA (no hay documentación pública equivalente a la de Expedia
 * Group o Booking.com para construir un cliente contra endpoints/payloads
 * reales sin haber pasado la revisión de partner) — construir un esquema
 * de peticiones inventado violaría la regla de esta construcción ("no
 * inventes capacidades que la fuente no documente"). Sin simulador por la
 * misma razón (RV22 NIVEL B, ítem "Airbnb API partner: esqueleto...sin
 * simulador si la spec no es pública").
 */
export const LATENCIA_AIRBNB_API = {
  descripcion: "Sin SLA documentado",
  confianza: "baja" as const,
  minutosEstimados: null,
  fuente: "docs/investigacion/RV03-airbnb-capacidades.md, RV22 F01",
};

export const CAPACIDADES_AIRBNB_API: ChannelCapabilities = {
  availabilityPush: true,
  ratesPush: false,
  reservationsPull: true,
  icalImportExport: false,
  messaging: true,
};

export const MOTIVO_PARTNER_PENDIENTE_AIRBNB_API =
  "NDA firmado + revisión de seguridad de datos + certificación de partner; 6 meses post-aprobación para " +
  "implementar features obligatorias (RV03 §5, F06); sin fecha estimada de aprobación";

export class AirbnbApiChannelAdapter implements ChannelAdapter {
  readonly nombreCanal = "airbnb";
  readonly capacidades = CAPACIDADES_AIRBNB_API;
  readonly latenciaDeclarada = LATENCIA_AIRBNB_API;
  readonly motivoPartnerPendiente = MOTIVO_PARTNER_PENDIENTE_AIRBNB_API;

  constructor(private readonly evidencia: EvidenciaConexionCanal) {}

  obtenerEstadoConexion(): EstadoConexionCanal {
    return evaluarEstadoConexion(this.evidencia);
  }
}

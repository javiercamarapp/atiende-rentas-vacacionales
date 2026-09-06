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

/**
 * RV22-R-01 (verificación de continuidad 2026-09-06, F02): cuando un
 * anfitrión agrega la URL de exportación de Atiende como calendario
 * "importado" dentro de Airbnb, Airbnb solo trae hacia adelante hasta 2
 * AÑOS de eventos de ese feed — un evento con `DTSTART` más allá de esa
 * ventana no se reflejará del lado de Airbnb aunque el feed exportado por
 * `exportarFeedIcs` (`packages/adapters/src/ical/exportador.ts`) sí lo
 * incluya. Esto es un límite documentado del IMPORTADOR de Airbnb, no de
 * nuestro exportador: Atiende sigue exportando el feed completo sin
 * truncar (un evento fuera de ventana simplemente no lo consume Airbnb, lo
 * mismo que le pasaría a cualquier otro consumidor de iCal con el mismo
 * límite) — no se filtra aquí para no ocultar reservas legítimas de larga
 * duración a otros consumidores del mismo feed exportado (p. ej. una
 * herramienta de reporting interna). Se expone como constante declarada
 * únicamente para que la UI (matriz de conectividad, RV22 transversal)
 * pueda mostrar la advertencia sin necesitar cambios en el motor de sync.
 */
export const VENTANA_IMPORTACION_AIRBNB_ANIOS = 2;

/** `true` si el inicio de un rango (ISO `AAAA-MM-DD`) cae fuera de la
 * ventana de importación de 2 años que Airbnb documenta para calendarios
 * importados (RV22-R-01, F02) — uso informativo únicamente (advertencia de
 * UI), nunca para rechazar ni truncar el export real. */
export function fueraDeVentanaImportacionAirbnb(inicioIso: string, ahora: Date = new Date()): boolean {
  const limite = new Date(ahora);
  limite.setUTCFullYear(limite.getUTCFullYear() + VENTANA_IMPORTACION_AIRBNB_ANIOS);
  return new Date(`${inicioIso}T00:00:00Z`).getTime() > limite.getTime();
}

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

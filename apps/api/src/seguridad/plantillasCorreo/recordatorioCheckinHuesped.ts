import { escaparHtml } from "./escape.js";
import { layoutCorreoHtml } from "./layout.js";

/**
 * Plantilla HTML de recordatorio de check-in al huésped (correo-huesped-02).
 * Mismo criterio de escape que `confirmacionReservaHuesped.ts` — todo dato
 * dinámico (`nombreHuesped`, `nombreUnidad`, `nombrePropiedad`) pasa por
 * `escaparHtml` aquí, nunca se confía en el llamador.
 *
 * `diasAntes` es informativo únicamente ("te escribimos porque tu check-in
 * es en N días") — el propio disparo del correo (cuándo se envía) lo decide
 * el cron que arma `DatosRecordatorioCheckinHuesped`, no esta plantilla.
 */
export interface DatosRecordatorioCheckinHuesped {
  nombreHuesped: string | null;
  nombreUnidad: string;
  nombrePropiedad: string;
  /** Fecha de check-in, `YYYY-MM-DD`. */
  checkIn: string;
  /** Días de anticipación con los que se envía este recordatorio (entero
   * >= 0) — solo para el texto ("tu check-in es en N días"/"es mañana"/"es
   * hoy"), la plantilla no decide la fecha de envío. */
  diasAntes: number;
}

function saludo(nombreHuesped: string | null): string {
  const nombre = nombreHuesped?.trim();
  return nombre ? `Hola ${escaparHtml(nombre)},` : "Hola,";
}

function fraseAnticipacion(diasAntes: number): string {
  if (diasAntes <= 0) return "¡tu check-in es hoy!";
  if (diasAntes === 1) return "tu check-in es mañana.";
  return `tu check-in es en ${diasAntes} días.`;
}

export function correoRecordatorioCheckinHuespedHtml(
  datos: DatosRecordatorioCheckinHuesped,
  urlPublica: string,
): string {
  const unidad = escaparHtml(datos.nombreUnidad);
  const propiedad = escaparHtml(datos.nombrePropiedad);
  const checkIn = escaparHtml(datos.checkIn);

  return layoutCorreoHtml({
    titulo: "Tu check-in se acerca",
    parrafosHtml: [
      `${saludo(datos.nombreHuesped)} ${escaparHtml(fraseAnticipacion(datos.diasAntes))}`,
      `Tu reserva es en <strong>${unidad}</strong> (${propiedad}), con check-in el <strong>${checkIn}</strong>.`,
      "Si tienes dudas sobre horarios de llegada o instrucciones de acceso, contacta directamente a tu anfitrión.",
    ],
    urlPublica,
  });
}

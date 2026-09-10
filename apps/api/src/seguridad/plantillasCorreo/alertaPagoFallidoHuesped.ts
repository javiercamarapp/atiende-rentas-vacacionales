import { escaparHtml } from "./escape.js";
import { layoutCorreoHtml } from "./layout.js";

/**
 * Plantilla HTML de alerta de pago fallido al huésped (correo-huesped-03).
 * Mismo criterio de escape que el resto de `plantillasCorreo/` — todo dato
 * dinámico se escapa aquí, nunca se confía en el llamador.
 *
 * `montoFormateado` llega YA formateado por el llamador (p. ej. "1,250.00
 * MXN") — esta plantilla nunca hace aritmética de centavos ni asume una
 * moneda; solo escapa e inserta el texto que recibe, igual que hace con
 * cualquier otro campo dinámico.
 *
 * IMPORTANTE (ver comentario de cabecera en
 * `apps/api/src/seguridad/correoHuesped.ts`): al momento de escribir esta
 * plantilla, este repositorio NO tiene ningún flujo real de cobro al
 * huésped (Stripe aquí solo cobra la suscripción SaaS del tenant,
 * `apps/api/src/routes/facturacion.ts`) — esta plantilla queda lista para
 * cuando exista, sin ningún disparador automático conectado todavía.
 */
export interface DatosAlertaPagoFallidoHuesped {
  nombreHuesped: string | null;
  nombreUnidad: string;
  nombrePropiedad: string;
  /** Monto ya formateado con su moneda, p. ej. "1,250.00 MXN". */
  montoFormateado: string;
  /** Fecha de check-in de la reserva asociada, `YYYY-MM-DD`, para que el
   * huésped identifique a qué estancia corresponde el cobro. */
  checkIn: string;
}

function saludo(nombreHuesped: string | null): string {
  const nombre = nombreHuesped?.trim();
  return nombre ? `Hola ${escaparHtml(nombre)},` : "Hola,";
}

export function correoAlertaPagoFallidoHuespedHtml(
  datos: DatosAlertaPagoFallidoHuesped,
  urlPublica: string,
): string {
  const unidad = escaparHtml(datos.nombreUnidad);
  const propiedad = escaparHtml(datos.nombrePropiedad);
  const monto = escaparHtml(datos.montoFormateado);
  const checkIn = escaparHtml(datos.checkIn);

  return layoutCorreoHtml({
    titulo: "No pudimos procesar tu pago",
    parrafosHtml: [
      saludo(datos.nombreHuesped),
      `Intentamos cobrar <strong>${monto}</strong> por tu reserva en <strong>${unidad}</strong> (${propiedad}, check-in ${checkIn}) y el cargo fue rechazado.`,
      "Por favor contacta directamente a tu anfitrión para resolverlo — tu reserva podría verse afectada si el pago no se completa.",
    ],
    urlPublica,
  });
}

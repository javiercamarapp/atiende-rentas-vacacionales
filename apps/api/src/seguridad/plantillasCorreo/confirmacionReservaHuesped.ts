import { escaparHtml } from "./escape.js";
import { layoutCorreoHtml } from "./layout.js";

/**
 * Plantilla HTML de confirmación de reserva al huésped (correo-huesped-01).
 * Reutiliza el mismo `layoutCorreoHtml`/`escaparHtml` que las plantillas de
 * autenticación (`verificacion.ts`, `restablecerPassword.ts`) — este correo
 * SÍ contiene datos que el propio huésped (o quien crea la reserva en su
 * nombre) escribió libremente (`nombreHuesped`, `nombreUnidad`,
 * `nombrePropiedad` vienen de `huesped_minimo`/`unidad`/`propiedad`, texto
 * libre sin validar más allá de "no vacío"), así que CADA campo dinámico se
 * escapa aquí antes de insertarse — nunca se confía en que ya viene limpio
 * desde la capa de aplicación.
 *
 * Sin botón CTA a propósito: el huésped de este producto no tiene cuenta ni
 * portal propio (huesped_minimo es un registro mínimo, D-014 — "nunca un
 * CRM de huéspedes"), así que no existe ninguna URL real hacia la que
 * apuntar un botón "ver mi reserva".
 */
export interface DatosConfirmacionReservaHuesped {
  /** Nombre del huésped tal como se capturó en `huesped_minimo.nombre` —
   * `null`/vacío cuando la reserva se creó sin ese dato (el saludo cae a
   * uno genérico, nunca "Hola null"). */
  nombreHuesped: string | null;
  nombreUnidad: string;
  nombrePropiedad: string;
  /** Fecha de check-in, `YYYY-MM-DD` (borde inferior de `ocupacion_unidad.rango`). */
  checkIn: string;
  /** Fecha de check-out, `YYYY-MM-DD` (borde superior, exclusivo). */
  checkOut: string;
}

function saludo(nombreHuesped: string | null): string {
  const nombre = nombreHuesped?.trim();
  return nombre ? `Hola ${escaparHtml(nombre)},` : "Hola,";
}

export function correoConfirmacionReservaHuespedHtml(
  datos: DatosConfirmacionReservaHuesped,
  urlPublica: string,
): string {
  const unidad = escaparHtml(datos.nombreUnidad);
  const propiedad = escaparHtml(datos.nombrePropiedad);
  const checkIn = escaparHtml(datos.checkIn);
  const checkOut = escaparHtml(datos.checkOut);

  return layoutCorreoHtml({
    titulo: "Tu reserva está confirmada",
    parrafosHtml: [
      saludo(datos.nombreHuesped),
      `Confirmamos tu reserva en <strong>${unidad}</strong> (${propiedad}).`,
      `<strong>Check-in:</strong> ${checkIn} &nbsp;·&nbsp; <strong>Check-out:</strong> ${checkOut}`,
      "Si algo de esto no es correcto, contacta directamente a tu anfitrión lo antes posible.",
    ],
    urlPublica,
  });
}

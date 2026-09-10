import { urlPublicaDelEntorno } from "./correo.js";
import {
  correoAlertaPagoFallidoHuespedHtml,
  correoConfirmacionReservaHuespedHtml,
  correoRecordatorioCheckinHuespedHtml,
  type DatosAlertaPagoFallidoHuesped,
  type DatosConfirmacionReservaHuesped,
  type DatosRecordatorioCheckinHuesped,
} from "./plantillasCorreo/index.js";

/**
 * Correos huésped-facing (confirmación de reserva, recordatorio de
 * check-in, alerta de pago fallido) — construidos sobre la MISMA
 * infraestructura ya probada por el correo de autenticación
 * (`InterfazCorreo`/`construirAdaptadorCorreo` de `./correo.ts`,
 * `layoutCorreoHtml`/`escaparHtml` de `./plantillasCorreo/`).
 *
 * Deliberadamente en un archivo APARTE de `./correo.ts` en vez de agregar
 * estas funciones ahí: el comentario de cabecera de `./correo.ts` declara
 * su alcance explícitamente pequeño ("verificación de correo,
 * restablecimiento de contraseña y avisos de seguridad... sin acoplarse a
 * ningún detalle de mensajería a huéspedes") — este archivo respeta esa
 * frontera en vez de romperla, mientras reutiliza el mismo adaptador y el
 * mismo paquete de plantillas.
 *
 * Los disparadores reales (quién llama a estas funciones y cuándo) viven
 * fuera de este archivo:
 *   - Confirmación de reserva: `apps/api/src/routes/reservas.ts`
 *     (`enviarConfirmacionReservaHuesped`), llamado desde `POST /reservas`.
 *   - Recordatorio de check-in: `apps/api/src/workers/notificacionesHuesped/
 *     recordatorioCheckin.ts`, corrido por
 *     `GET /internal/cron/recordatorio-checkin`.
 *   - Alerta de pago fallido: construida aquí y probada, pero SIN
 *     disparador automático conectado todavía — ver el comentario de
 *     cabecera de `plantillasCorreo/alertaPagoFallidoHuesped.ts` para por
 *     qué (no existe hoy ningún cobro real al huésped en este
 *     repositorio; el único webhook de Stripe existente es de
 *     facturación SaaS del tenant, `routes/facturacion.ts` — conectar
 *     esta función a ESE webhook alertaría al tenant equivocadamente
 *     haciéndolo pasar por "el huésped", que es peor que no conectarla).
 */

/** Regex deliberadamente simple (no RFC 5322 completo, mismo criterio que
 * cualquier validación "suficientemente buena" del resto del repo, p. ej.
 * `zona_horaria <> ''`): basta para distinguir "esto parece un correo" de
 * "esto es un teléfono u otro texto libre" en `huesped_minimo.contacto`
 * (campo de texto libre sin tipo, D-014) — nunca se usa para validar un
 * formulario de usuario final, solo para decidir si vale la pena intentar
 * enviar un correo a ese valor. */
const REGEX_PARECE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function pareceCorreo(valor: string | null | undefined): valor is string {
  return typeof valor === "string" && REGEX_PARECE_CORREO.test(valor.trim());
}

export function correoConfirmacionReservaHuesped(
  datos: DatosConfirmacionReservaHuesped,
  urlPublica: string = urlPublicaDelEntorno(),
): { asunto: string; textoPlano: string; html: string } {
  const nombre = datos.nombreHuesped?.trim();
  const saludo = nombre ? `Hola ${nombre},` : "Hola,";
  return {
    asunto: `Reserva confirmada — ${datos.nombreUnidad}`,
    textoPlano:
      `${saludo}\n\nConfirmamos tu reserva en ${datos.nombreUnidad} (${datos.nombrePropiedad}).\n\n` +
      `Check-in: ${datos.checkIn}\nCheck-out: ${datos.checkOut}\n\n` +
      "Si algo de esto no es correcto, contacta directamente a tu anfitrión lo antes posible.",
    html: correoConfirmacionReservaHuespedHtml(datos, urlPublica),
  };
}

export function correoRecordatorioCheckinHuesped(
  datos: DatosRecordatorioCheckinHuesped,
  urlPublica: string = urlPublicaDelEntorno(),
): { asunto: string; textoPlano: string; html: string } {
  const nombre = datos.nombreHuesped?.trim();
  const saludo = nombre ? `Hola ${nombre},` : "Hola,";
  return {
    asunto: `Tu check-in en ${datos.nombreUnidad} se acerca`,
    textoPlano:
      `${saludo}\n\nTu reserva es en ${datos.nombreUnidad} (${datos.nombrePropiedad}), con check-in el ${datos.checkIn}.\n\n` +
      "Si tienes dudas sobre horarios de llegada o instrucciones de acceso, contacta directamente a tu anfitrión.",
    html: correoRecordatorioCheckinHuespedHtml(datos, urlPublica),
  };
}

export function correoAlertaPagoFallidoHuesped(
  datos: DatosAlertaPagoFallidoHuesped,
  urlPublica: string = urlPublicaDelEntorno(),
): { asunto: string; textoPlano: string; html: string } {
  const nombre = datos.nombreHuesped?.trim();
  const saludo = nombre ? `Hola ${nombre},` : "Hola,";
  return {
    asunto: `No pudimos procesar tu pago — ${datos.nombreUnidad}`,
    textoPlano:
      `${saludo}\n\nIntentamos cobrar ${datos.montoFormateado} por tu reserva en ${datos.nombreUnidad} ` +
      `(${datos.nombrePropiedad}, check-in ${datos.checkIn}) y el cargo fue rechazado.\n\n` +
      "Por favor contacta directamente a tu anfitrión para resolverlo — tu reserva podría verse afectada si el pago no se completa.",
    html: correoAlertaPagoFallidoHuespedHtml(datos, urlPublica),
  };
}

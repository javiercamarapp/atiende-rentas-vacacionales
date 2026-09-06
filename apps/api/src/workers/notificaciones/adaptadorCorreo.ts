import type { AdaptadorCorreo } from "@atiende-rv/domain/notificaciones";
import { AdaptadorCorreoSimulado } from "@atiende-rv/sim";

/**
 * H-054: punto de extensión ÚNICO para el canal de correo. Por defecto
 * (y siempre en desarrollo/pruebas) devuelve el adaptador SIMULADO de
 * `packages/sim` — nunca se envía un correo real desde este repo hoy.
 *
 * Activar SMTP real es una decisión explícita de despliegue, no un
 * comportamiento por defecto (D-019): requiere
 * `NOTIFICACIONES_CORREO_SMTP_HABILITADO=true` Y una implementación real
 * de `AdaptadorCorreo` sobre un cliente SMTP (p. ej. `nodemailer`, ya
 * presente como dependencia de `apps/api` por el Lote 3.2 para correos de
 * autenticación) — deliberadamente NO IMPLEMENTADA en este lote: activar
 * la variable sin implementar `AdaptadorCorreoSmtp` falla explícito en
 * vez de fingir un envío real (nunca "simulado como productivo").
 */
export function crearAdaptadorCorreo(): AdaptadorCorreo {
  const smtpHabilitado = process.env.NOTIFICACIONES_CORREO_SMTP_HABILITADO === "true";
  if (!smtpHabilitado) {
    return new AdaptadorCorreoSimulado({ entorno: process.env.ATIENDE_ENTORNO ?? process.env.NODE_ENV });
  }
  throw new Error(
    "NOTIFICACIONES_CORREO_SMTP_HABILITADO=true pero no hay ninguna implementación real de AdaptadorCorreo " +
      "conectada en este entorno de construcción — punto de extensión documentado (H-054), no implementado. " +
      "Nunca se envía un correo simulándolo como real: corrige la variable de entorno o implementa un " +
      "AdaptadorCorreoSmtp real antes de habilitarla.",
  );
}

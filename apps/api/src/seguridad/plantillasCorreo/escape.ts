/**
 * Escape mínimo de HTML para datos dinámicos insertados en plantillas de
 * correo (Lote correo-resend). Todo valor que no sea un literal de la
 * propia plantilla — URLs, nombres, cualquier texto que venga de un
 * usuario o de la base de datos — DEBE pasar por aquí antes de
 * interpolarse en el HTML del correo. Nunca se envían correos con HTML
 * generado a partir de una plantilla (`Handlebars`, `Mustache`, etc.) que
 * interprete el propio valor dinámico como marcado: esto es escape de
 * caracteres, no una plantilla con lógica.
 */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

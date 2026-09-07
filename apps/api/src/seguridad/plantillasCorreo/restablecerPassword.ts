import { layoutCorreoHtml } from "./layout.js";

/** Versión HTML de `correoRestablecerPassword` (ver `../correo.ts`) —
 * mismo contenido y misma validez de 1h que la versión de texto plano.
 * `urlRestablecer` se escapa dentro de `layoutCorreoHtml` (va como `href`
 * de un enlace). */
export function correoRestablecerPasswordHtml(urlRestablecer: string, urlPublica: string): string {
  return layoutCorreoHtml({
    titulo: "Restablece tu contraseña",
    parrafosHtml: [
      "Recibimos una solicitud para restablecer tu contraseña. El enlace es válido por 1 hora.",
      "Si no pediste este cambio, ignora este mensaje — tu contraseña actual sigue siendo válida.",
    ],
    textoBoton: "Restablecer contraseña",
    urlBoton: urlRestablecer,
    urlPublica,
  });
}

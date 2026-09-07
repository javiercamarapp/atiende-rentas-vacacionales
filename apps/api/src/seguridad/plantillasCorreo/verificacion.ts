import { layoutCorreoHtml } from "./layout.js";

/** Versión HTML de `correoVerificacion` (ver `../correo.ts`) — mismo
 * contenido y misma validez de 24h que la versión de texto plano, con el
 * logo y un botón CTA en vez de un enlace pelón. `urlVerificacion` se
 * escapa dentro de `layoutCorreoHtml` (va como `href` de un enlace). */
export function correoVerificacionHtml(urlVerificacion: string, urlPublica: string): string {
  return layoutCorreoHtml({
    titulo: "Confirma tu correo",
    parrafosHtml: [
      "Gracias por crear tu cuenta en Atiende. Confirma tu correo para activarla — el enlace es válido por 24 horas.",
      "Si no creaste esta cuenta, ignora este mensaje.",
    ],
    textoBoton: "Confirmar mi correo",
    urlBoton: urlVerificacion,
    urlPublica,
  });
}

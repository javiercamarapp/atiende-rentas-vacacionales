import { escaparHtml } from "./escape.js";
import { layoutCorreoHtml } from "./layout.js";

/**
 * Plantilla genérica de notificación por correo (título + cuerpo + CTA
 * opcional). No hay hoy ningún flujo del dominio (`apps/api/src/workers/
 * notificaciones/**`, `packages/domain`) que envíe correo a través de la
 * `InterfazCorreo` de este archivo — ese subsistema define su propio
 * `AdaptadorCorreo` (`@atiende-rv/domain/notificaciones`,
 * `packages/sim`), deliberadamente desacoplado de este módulo (ver el
 * comentario de cabecera en `../correo.ts`). Esta plantilla queda lista
 * para el día en que ese subsistema (u otro nuevo) necesite una
 * notificación genérica sobre `InterfazCorreo` — o para que ese día la
 * unificación entre ambos sea mecánica.
 *
 * `datos.cuerpo` y `datos.titulo` se tratan como texto plano dinámico:
 * se escapan aquí (nunca se interpreta como HTML) y los saltos de línea
 * se convierten a `<br />` después de escapar.
 */
export interface DatosNotificacionCorreo {
  titulo: string;
  cuerpo: string;
  textoBoton?: string;
  urlBoton?: string;
}

export function correoNotificacionHtml(datos: DatosNotificacionCorreo, urlPublica: string): string {
  const cuerpoHtml = escaparHtml(datos.cuerpo)
    .split("\n")
    .join("<br />");
  return layoutCorreoHtml({
    titulo: datos.titulo,
    parrafosHtml: [cuerpoHtml],
    textoBoton: datos.textoBoton,
    urlBoton: datos.urlBoton,
    urlPublica,
  });
}

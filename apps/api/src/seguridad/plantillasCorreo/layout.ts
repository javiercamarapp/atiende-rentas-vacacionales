import { escaparHtml } from "./escape.js";

/**
 * Layout HTML común de todos los correos transaccionales (Lote
 * correo-resend). Tabla-based (no flexbox/grid) a propósito: es el patrón
 * que de verdad renderiza igual en Outlook/Gmail/Apple Mail. El logo se
 * referencia como URL pública absoluta (`APP_PUBLIC_URL` +
 * `/correo/logo-atiende.png`) — los clientes de correo no cargan
 * `data:` URIs grandes de forma confiable ni ejecutan React/SVG inline,
 * así que el logo se sirve como PNG estático desde `apps/web/public/correo/`
 * (ver `apps/web/public/correo/logo-atiende.svg` como fuente/fallback).
 *
 * Todo texto dinámico que llega aquí (`titulo`, `parrafosHtml`,
 * `textoBoton`, `urlBoton`, `urlPublica`) se re-escapa con `escaparHtml`
 * en este módulo antes de insertarse en atributos o en texto — los
 * llamadores de este archivo (`verificacion.ts`, `restablecerPassword.ts`,
 * `notificacion.ts`) son responsables de escapar cualquier dato dinámico
 * que compongan dentro de `parrafosHtml` (los tres helpers de este
 * paquete ya lo hacen).
 */
export interface OpcionesLayoutCorreo {
  /** Título breve mostrado como encabezado principal del cuerpo. */
  titulo: string;
  /** Párrafos de cuerpo, ya como HTML — escapar cualquier dato dinámico
   * (con `escaparHtml`) antes de pasarlo aquí. */
  parrafosHtml: string[];
  textoBoton?: string;
  urlBoton?: string;
  /** URL pública base del sitio (sin barra final), p. ej.
   * "https://atiende-rentas-vacacionales.vercel.app". */
  urlPublica: string;
}

const COLOR_MARCA = "#1D4ED8";
const COLOR_FONDO = "#F1F5F9";
const COLOR_TEXTO = "#334155";
const COLOR_TEXTO_PIE = "#94A3B8";

function normalizarUrlPublica(urlPublica: string): string {
  return urlPublica.replace(/\/+$/, "");
}

export function layoutCorreoHtml(opciones: OpcionesLayoutCorreo): string {
  const { titulo, parrafosHtml, textoBoton, urlBoton, urlPublica } = opciones;
  const base = normalizarUrlPublica(urlPublica);
  const tituloEscapado = escaparHtml(titulo);

  const filaBoton =
    textoBoton && urlBoton
      ? `<tr>
          <td align="center" style="padding:24px 32px 8px 32px;">
            <a href="${escaparHtml(urlBoton)}" target="_blank" rel="noopener noreferrer"
               style="background-color:${COLOR_MARCA};color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;padding:14px 28px;border-radius:8px;display:inline-block;">
              ${escaparHtml(textoBoton)}
            </a>
          </td>
        </tr>`
      : "";

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${tituloEscapado}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${COLOR_FONDO};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR_FONDO};padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0"
                 style="background-color:#ffffff;border-radius:12px;overflow:hidden;max-width:480px;width:100%;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <img src="${escaparHtml(base)}/correo/logo-atiende.png" width="150" height="44"
                     alt="Atiende" style="display:block;border:0;outline:none;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;">
                <h1 style="font-size:20px;line-height:28px;margin:0 0 12px 0;color:#0F172A;">${tituloEscapado}</h1>
                ${parrafosHtml.map((parrafo) => `<p style="font-size:15px;line-height:22px;margin:0 0 12px 0;color:${COLOR_TEXTO};">${parrafo}</p>`).join("\n")}
              </td>
            </tr>
            ${filaBoton}
            <tr>
              <td style="padding:24px 32px 28px 32px;border-top:1px solid #E2E8F0;">
                <p style="font-size:12px;line-height:18px;color:${COLOR_TEXTO_PIE};margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;">
                  Atiende Rentas Vacacionales · Este es un mensaje automático, no respondas a este correo.<br />
                  <a href="${escaparHtml(base)}" target="_blank" rel="noopener noreferrer" style="color:${COLOR_TEXTO_PIE};">${escaparHtml(base)}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

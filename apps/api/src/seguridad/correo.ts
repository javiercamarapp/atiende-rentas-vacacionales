import nodemailer, { type Transporter } from "nodemailer";
import { AdaptadorCorreoResend } from "./correoResend.js";
import { correoRestablecerPasswordHtml, correoVerificacionHtml } from "./plantillasCorreo/index.js";

export { AdaptadorCorreoResend, ErrorCorreoResend, type ConfiguracionResend } from "./correoResend.js";

/**
 * Interfaz de envío de correo (Lote 3.2, H-096+): verificación de correo,
 * restablecimiento de contraseña y avisos de seguridad (login nuevo
 * dispositivo, MFA habilitado/deshabilitado) la necesitan y, al momento de
 * construir este lote, ningún otro lote en curso (Lote 3.0 —
 * notificaciones/pricing/paridad/métricas/réplica) había publicado todavía
 * una interfaz de "notificaciones" reutilizable en
 * apps/api/src/seguridad/ ni en packages/adapters/src — se define aquí,
 * deliberadamente pequeña y sin acoplarse a ningún detalle de mensajería a
 * huéspedes (Lote 6), para que:
 *   1. Este lote no bloquee esperando esa interfaz.
 *   2. Si Lote 3.0 publica una interfaz de notificaciones genérica más
 *      adelante, unificar sea un cambio mecánico (misma forma: destinatario/
 *      asunto/cuerpo, sin estado oculto) — documentado aquí explícitamente
 *      para quien haga esa unificación después.
 *
 * Tres implementaciones (`construirAdaptadorCorreo` elige una a partir
 * del entorno, en este orden — ver su docstring para el detalle):
 *   - `AdaptadorCorreoResend` (Lote correo-resend): API HTTP de Resend
 *     (`fetch` crudo, sin SDK) — la usa `construirAdaptadorCorreo` cuando
 *     hay `RESEND_API_KEY`. `RESEND_FROM` es obligatoria en ese caso
 *     (fail-closed: sin ella, `construirAdaptadorCorreo` lanza en vez de
 *     inventar un remitente). Ver `./correoResend.ts`.
 *   - `AdaptadorCorreoSmtp`: SMTP real vía `nodemailer`, configurado por
 *     entorno (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/
 *     `SMTP_FROM`/`SMTP_SECURE`) — nunca con credenciales embebidas en el
 *     repositorio. Se usa cuando no hay `RESEND_API_KEY` pero sí
 *     `SMTP_HOST`.
 *   - `AdaptadorCorreoSimulado`: escribe el correo a un log estructurado
 *     (nunca lo envía) — SIEMPRE la que se usa en pruebas/E2E, y también
 *     el valor por defecto en desarrollo si no hay Resend ni SMTP
 *     configurados (nunca se envía correo real por accidente desde un
 *     entorno de desarrollo). Guarda los últimos correos en memoria para
 *     que las pruebas de integración puedan leer el token de
 *     verificación/reset sin necesidad de un servidor SMTP de prueba.
 *
 * Las plantillas HTML (logo + CTA, `apps/api/src/seguridad/plantillasCorreo/`)
 * son opcionales en `CorreoAEnviar.html` — todo llamador que sólo use
 * `textoPlano` sigue funcionando exactamente igual que antes de este lote.
 */

export interface CorreoAEnviar {
  para: string;
  asunto: string;
  textoPlano: string;
  html?: string;
}

export interface InterfazCorreo {
  enviar(correo: CorreoAEnviar): Promise<void>;
}

export interface CorreoRegistrado extends CorreoAEnviar {
  enviadoEn: string;
}

const LIMITE_HISTORIAL = 200;

/** Etiquetado explícito (D-019, mismo criterio que cualquier otro
 * simulador de este repo): un correo "enviado" por este adaptador NUNCA
 * sale de este proceso — solo queda en `historial` (para pruebas) y en un
 * `console.log` con el prefijo `[correo-simulado]`. */
export class AdaptadorCorreoSimulado implements InterfazCorreo {
  readonly historial: CorreoRegistrado[] = [];

  async enviar(correo: CorreoAEnviar): Promise<void> {
    const registrado: CorreoRegistrado = { ...correo, enviadoEn: new Date().toISOString() };
    this.historial.push(registrado);
    if (this.historial.length > LIMITE_HISTORIAL) this.historial.shift();
    console.log(
      JSON.stringify({
        evento: "correo-simulado",
        para: correo.para,
        asunto: correo.asunto,
        // Nunca se loggea el cuerpo completo (podría llevar un token de un
        // solo uso) — solo su longitud, suficiente para depurar sin crear
        // un canal de fuga de secretos en los logs.
        longitudTexto: correo.textoPlano.length,
      }),
    );
  }

  /** Último correo enviado a `para` — utilidad de pruebas para extraer el
   * link/token de verificación o restablecimiento sin parsear logs. */
  ultimoPara(para: string): CorreoRegistrado | undefined {
    return [...this.historial].reverse().find((c) => c.para.toLowerCase() === para.toLowerCase());
  }
}

export interface ConfiguracionSmtp {
  host: string;
  puerto: number;
  seguro: boolean;
  usuario?: string;
  password?: string;
  remitente: string;
}

export class AdaptadorCorreoSmtp implements InterfazCorreo {
  private readonly transportador: Transporter;
  private readonly remitente: string;

  constructor(config: ConfiguracionSmtp) {
    this.remitente = config.remitente;
    this.transportador = nodemailer.createTransport({
      host: config.host,
      port: config.puerto,
      secure: config.seguro,
      auth: config.usuario && config.password ? { user: config.usuario, pass: config.password } : undefined,
    });
  }

  async enviar(correo: CorreoAEnviar): Promise<void> {
    await this.transportador.sendMail({
      from: this.remitente,
      to: correo.para,
      subject: correo.asunto,
      text: correo.textoPlano,
      html: correo.html,
    });
  }
}

/** URL pública por defecto usada en el HTML de los correos (logo, pie,
 * botones) cuando no hay `APP_PUBLIC_URL` en el entorno — nunca bloquea
 * el envío por faltar esta variable, a diferencia de `RESEND_FROM`
 * (donde sí es fail-closed porque inventar un remitente sería peor que
 * inventar un dominio de referencia en el pie del correo). */
const URL_PUBLICA_POR_DEFECTO = "https://atiende-rentas-vacacionales.vercel.app";

/** Exportada (no solo interna) para que otros módulos que arman correo con
 * esta misma infraestructura pero que están fuera del alcance documentado
 * de este archivo (avisos de seguridad de auth) — p. ej.
 * `./correoHuesped.ts`, correos al huésped final — reutilicen el mismo
 * criterio de URL de marca en vez de duplicar `APP_PUBLIC_URL || <default>`. */
export function urlPublicaDelEntorno(): string {
  return process.env.APP_PUBLIC_URL || URL_PUBLICA_POR_DEFECTO;
}

/** Construye el adaptador correcto a partir del entorno (fail-safe): sin
 * `RESEND_API_KEY` ni `SMTP_HOST`, siempre el simulado — nunca se intenta
 * un adaptador real con configuración incompleta.
 *
 * Orden de selección:
 *   1. `RESEND_API_KEY` presente → `AdaptadorCorreoResend`. `RESEND_FROM`
 *      es OBLIGATORIA en este caso (fail-closed, D-019): sin ella, esta
 *      función lanza en vez de enviar con un remitente inventado — nunca
 *      cae en silencio a SMTP/simulado cuando la intención explícita era
 *      usar Resend.
 *   2. Si no, `SMTP_HOST` presente → `AdaptadorCorreoSmtp` (comportamiento
 *      preexistente, intacto).
 *   3. Si no, `AdaptadorCorreoSimulado` (comportamiento preexistente,
 *      intacto — nunca se envía correo real por accidente).
 */
export function construirAdaptadorCorreo(env: NodeJS.ProcessEnv): InterfazCorreo {
  if (env.RESEND_API_KEY) {
    if (!env.RESEND_FROM) {
      throw new Error(
        "RESEND_API_KEY está definida pero falta RESEND_FROM — fail-closed: nunca se envía un correo " +
          "real con un remitente inventado. Define RESEND_FROM (p. ej. 'Atiende <no-responder@useatiende.ai>') " +
          "o quita RESEND_API_KEY para usar SMTP/el adaptador simulado.",
      );
    }
    return new AdaptadorCorreoResend({ apiKey: env.RESEND_API_KEY, remitente: env.RESEND_FROM });
  }
  if (!env.SMTP_HOST) {
    return new AdaptadorCorreoSimulado();
  }
  return new AdaptadorCorreoSmtp({
    host: env.SMTP_HOST,
    puerto: Number.parseInt(env.SMTP_PORT ?? "587", 10),
    seguro: env.SMTP_SECURE === "true",
    usuario: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    remitente: env.SMTP_FROM ?? "no-responder@atiende.example",
  });
}

// --- Plantillas de texto plano + HTML (sin PII más allá del propio
// email del destinatario, que ya conoce el propio destinatario) ---

export function correoVerificacion(
  urlVerificacion: string,
  urlPublica: string = urlPublicaDelEntorno(),
): { asunto: string; textoPlano: string; html: string } {
  return {
    asunto: "Confirma tu correo — Atiende Rentas Vacacionales",
    textoPlano: `Confirma tu correo entrando a este enlace (válido por 24 horas):\n\n${urlVerificacion}\n\nSi no creaste esta cuenta, ignora este mensaje.`,
    html: correoVerificacionHtml(urlVerificacion, urlPublica),
  };
}

export function correoRestablecerPassword(
  urlRestablecer: string,
  urlPublica: string = urlPublicaDelEntorno(),
): { asunto: string; textoPlano: string; html: string } {
  return {
    asunto: "Restablecer tu contraseña — Atiende Rentas Vacacionales",
    textoPlano: `Restablece tu contraseña entrando a este enlace (válido por 1 hora):\n\n${urlRestablecer}\n\nSi no pediste este cambio, ignora este mensaje — tu contraseña actual sigue siendo válida.`,
    html: correoRestablecerPasswordHtml(urlRestablecer, urlPublica),
  };
}

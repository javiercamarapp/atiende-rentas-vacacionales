import nodemailer, { type Transporter } from "nodemailer";

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
 * Dos implementaciones:
 *   - `AdaptadorCorreoSimulado`: escribe el correo a un log estructurado
 *     (nunca lo envía) — SIEMPRE la que se usa en pruebas/E2E, y también
 *     el valor por defecto en desarrollo si no hay SMTP configurado
 *     (nunca se envía correo real por accidente desde un entorno de
 *     desarrollo). Guarda los últimos correos en memoria para que las
 *     pruebas de integración puedan leer el token de verificación/reset
 *     sin necesidad de un servidor SMTP de prueba.
 *   - `AdaptadorCorreoSmtp`: SMTP real vía `nodemailer`, configurado por
 *     entorno (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/
 *     `SMTP_FROM`/`SMTP_SECURE`) — nunca con credenciales embebidas en el
 *     repositorio.
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

/** Construye el adaptador correcto a partir de `SMTP_HOST` (fail-safe: sin
 * esa variable, siempre el simulado — nunca se intenta SMTP real con
 * configuración incompleta). */
export function construirAdaptadorCorreo(env: NodeJS.ProcessEnv): InterfazCorreo {
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

// --- Plantillas mínimas de texto (sin PII más allá del propio email del
// destinatario, que ya conoce el propio destinatario) ---

export function correoVerificacion(urlVerificacion: string): { asunto: string; textoPlano: string } {
  return {
    asunto: "Confirma tu correo — Atiende Rentas Vacacionales",
    textoPlano: `Confirma tu correo entrando a este enlace (válido por 24 horas):\n\n${urlVerificacion}\n\nSi no creaste esta cuenta, ignora este mensaje.`,
  };
}

export function correoRestablecerPassword(urlRestablecer: string): { asunto: string; textoPlano: string } {
  return {
    asunto: "Restablecer tu contraseña — Atiende Rentas Vacacionales",
    textoPlano: `Restablece tu contraseña entrando a este enlace (válido por 1 hora):\n\n${urlRestablecer}\n\nSi no pediste este cambio, ignora este mensaje — tu contraseña actual sigue siendo válida.`,
  };
}

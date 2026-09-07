import { describe, expect, it } from "vitest";
import {
  AdaptadorCorreoResend,
  AdaptadorCorreoSimulado,
  AdaptadorCorreoSmtp,
  construirAdaptadorCorreo,
  correoRestablecerPassword,
  correoVerificacion,
} from "../../src/seguridad/correo.js";

function entornoBase(extra: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { ...extra } as NodeJS.ProcessEnv;
}

describe("construirAdaptadorCorreo — selección por entorno (Lote correo-resend)", () => {
  it("sin RESEND_API_KEY ni SMTP_HOST -> AdaptadorCorreoSimulado (comportamiento preexistente intacto)", () => {
    const adaptador = construirAdaptadorCorreo(entornoBase());
    expect(adaptador).toBeInstanceOf(AdaptadorCorreoSimulado);
  });

  it("sin RESEND_API_KEY, con SMTP_HOST -> AdaptadorCorreoSmtp (comportamiento preexistente intacto)", () => {
    const adaptador = construirAdaptadorCorreo(entornoBase({ SMTP_HOST: "smtp.ejemplo.com" }));
    expect(adaptador).toBeInstanceOf(AdaptadorCorreoSmtp);
  });

  it("con RESEND_API_KEY y RESEND_FROM -> AdaptadorCorreoResend, incluso si también hay SMTP_HOST (Resend gana)", () => {
    const adaptador = construirAdaptadorCorreo(
      entornoBase({
        RESEND_API_KEY: "re_test_123",
        RESEND_FROM: "Atiende <no-responder@useatiende.ai>",
        SMTP_HOST: "smtp.ejemplo.com",
      }),
    );
    expect(adaptador).toBeInstanceOf(AdaptadorCorreoResend);
  });

  it("fail-closed: RESEND_API_KEY sin RESEND_FROM lanza en vez de enviar con un remitente inventado", () => {
    expect(() => construirAdaptadorCorreo(entornoBase({ RESEND_API_KEY: "re_test_123" }))).toThrow(/RESEND_FROM/);
  });

  it("fail-closed: nunca cae en silencio a SMTP/simulado cuando falta RESEND_FROM (no ignora el error)", () => {
    expect(() =>
      construirAdaptadorCorreo(entornoBase({ RESEND_API_KEY: "re_test_123", SMTP_HOST: "smtp.ejemplo.com" })),
    ).toThrow(/RESEND_FROM/);
  });
});

describe("correoVerificacion / correoRestablecerPassword — texto plano sin cambios + html nuevo", () => {
  it("correoVerificacion mantiene exactamente el mismo asunto y textoPlano que antes del lote correo-resend", () => {
    const url = "https://app.ejemplo.com/verificar?token=abc123";
    const { asunto, textoPlano } = correoVerificacion(url);
    expect(asunto).toBe("Confirma tu correo — Atiende Rentas Vacacionales");
    expect(textoPlano).toBe(
      `Confirma tu correo entrando a este enlace (válido por 24 horas):\n\n${url}\n\nSi no creaste esta cuenta, ignora este mensaje.`,
    );
  });

  it("correoRestablecerPassword mantiene exactamente el mismo asunto y textoPlano que antes del lote correo-resend", () => {
    const url = "https://app.ejemplo.com/restablecer?token=xyz789";
    const { asunto, textoPlano } = correoRestablecerPassword(url);
    expect(asunto).toBe("Restablecer tu contraseña — Atiende Rentas Vacacionales");
    expect(textoPlano).toBe(
      `Restablece tu contraseña entrando a este enlace (válido por 1 hora):\n\n${url}\n\nSi no pediste este cambio, ignora este mensaje — tu contraseña actual sigue siendo válida.`,
    );
  });

  it("correoVerificacion agrega un campo html con el logo y un botón hacia la URL de verificación", () => {
    const url = "https://app.ejemplo.com/verificar?token=abc123";
    const { html } = correoVerificacion(url, "https://midominio.example");
    expect(html).toContain("https://midominio.example/correo/logo-atiende.png");
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("Confirmar mi correo");
  });

  it("correoRestablecerPassword agrega un campo html con el logo y un botón hacia la URL de restablecimiento", () => {
    const url = "https://app.ejemplo.com/restablecer?token=xyz789";
    const { html } = correoRestablecerPassword(url, "https://midominio.example");
    expect(html).toContain("https://midominio.example/correo/logo-atiende.png");
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("Restablecer contraseña");
  });

  it("usa APP_PUBLIC_URL del entorno cuando no se pasa urlPublica explícita (para no romper llamadores actuales)", () => {
    const original = process.env.APP_PUBLIC_URL;
    process.env.APP_PUBLIC_URL = "https://env.example.test";
    try {
      const { html } = correoVerificacion("https://app.ejemplo.com/verificar?token=abc123");
      expect(html).toContain("https://env.example.test/correo/logo-atiende.png");
    } finally {
      if (original === undefined) delete process.env.APP_PUBLIC_URL;
      else process.env.APP_PUBLIC_URL = original;
    }
  });
});

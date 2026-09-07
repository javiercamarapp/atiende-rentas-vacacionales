import { describe, expect, it, vi } from "vitest";
import { AdaptadorCorreoResend, ErrorCorreoResend } from "../../src/seguridad/correoResend.js";

const CORREO = {
  para: "destinatario@ejemplo.com",
  asunto: "Asunto de prueba",
  textoPlano: "Cuerpo de prueba",
  html: "<p>Cuerpo de prueba</p>",
};

describe("AdaptadorCorreoResend — llamadas HTTP vía fetch inyectado (nunca red real en pruebas)", () => {
  it("envía el correo con Authorization Bearer, from/to/subject/text/html correctos en un 200", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.resend.com/emails");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer re_test_clave_123");
      expect(headers["Content-Type"]).toBe("application/json");
      const cuerpo = JSON.parse(init?.body as string);
      expect(cuerpo).toEqual({
        from: "Atiende <no-responder@useatiende.ai>",
        to: [CORREO.para],
        subject: CORREO.asunto,
        text: CORREO.textoPlano,
        html: CORREO.html,
      });
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    });

    const adaptador = new AdaptadorCorreoResend({
      apiKey: "re_test_clave_123",
      remitente: "Atiende <no-responder@useatiende.ai>",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(adaptador.enviar(CORREO)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("no incluye 'html' en el body cuando el correo no trae html", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const cuerpo = JSON.parse(init?.body as string);
      expect(cuerpo.html).toBeUndefined();
      return new Response("{}", { status: 200 });
    });
    const adaptador = new AdaptadorCorreoResend({
      apiKey: "re_test_clave_123",
      remitente: "Atiende <no-responder@useatiende.ai>",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await adaptador.enviar({ para: CORREO.para, asunto: CORREO.asunto, textoPlano: CORREO.textoPlano });
  });

  it("un 401 lanza ErrorCorreoResend con el status y el cuerpo de Resend, SIN filtrar la API key", async () => {
    const CLAVE_SECRETA = "re_super_secreta_no_debe_aparecer";
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ statusCode: 401, message: "API key is invalid" }), { status: 401 }),
    );
    const adaptador = new AdaptadorCorreoResend({
      apiKey: CLAVE_SECRETA,
      remitente: "Atiende <no-responder@useatiende.ai>",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    let errorCapturado: unknown;
    try {
      await adaptador.enviar(CORREO);
    } catch (error) {
      errorCapturado = error;
    }

    expect(errorCapturado).toBeInstanceOf(ErrorCorreoResend);
    expect((errorCapturado as ErrorCorreoResend).status).toBe(401);
    expect((errorCapturado as ErrorCorreoResend).message).not.toContain(CLAVE_SECRETA);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 401 no es reintentable
  });

  it("un 429 con Retry-After reintenta UNA vez respetando la espera, y no una segunda vez si vuelve a fallar", async () => {
    vi.useFakeTimers();
    try {
      let llamada = 0;
      const fetchMock = vi.fn(async () => {
        llamada += 1;
        return new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "2" },
        });
      });
      const adaptador = new AdaptadorCorreoResend({
        apiKey: "re_test_clave_123",
        remitente: "Atiende <no-responder@useatiende.ai>",
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      const promesa = adaptador.enviar(CORREO);
      // se adjunta el handler de rechazo ANTES de avanzar los timers, para
      // no disparar una advertencia de unhandled rejection entre medias.
      const expectativaRechazo = expect(promesa).rejects.toThrow(ErrorCorreoResend);

      // deja correr las micro-tareas hasta el punto donde se agenda el setTimeout de espera
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // avanza los 2s del Retry-After -> dispara el segundo (y último) intento
      await vi.advanceTimersByTimeAsync(2000);

      await expectativaRechazo;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(llamada).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("un 500 sin Retry-After reintenta una vez con una espera por defecto y, si el reintento sale bien, resuelve", async () => {
    vi.useFakeTimers();
    try {
      let llamada = 0;
      const fetchMock = vi.fn(async () => {
        llamada += 1;
        if (llamada === 1) return new Response("boom", { status: 500 });
        return new Response("{}", { status: 200 });
      });
      const adaptador = new AdaptadorCorreoResend({
        apiKey: "re_test_clave_123",
        remitente: "Atiende <no-responder@useatiende.ai>",
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      const promesa = adaptador.enviar(CORREO);
      await vi.runAllTimersAsync();
      await expect(promesa).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("agota el timeout configurado y lanza ErrorCorreoResend sin colgarse", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      });
      const adaptador = new AdaptadorCorreoResend({
        apiKey: "re_test_clave_123",
        remitente: "Atiende <no-responder@useatiende.ai>",
        fetchImpl: fetchMock as unknown as typeof fetch,
        timeoutMs: 1000,
      });

      const promesa = adaptador.enviar(CORREO);
      const aserto = expect(promesa).rejects.toThrow(/tiempo de espera agotado/);
      await vi.advanceTimersByTimeAsync(1000);
      await aserto;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("constructor exige apiKey y remitente", () => {
    expect(() => new AdaptadorCorreoResend({ apiKey: "", remitente: "Atiende <a@b.com>" })).toThrow();
    expect(() => new AdaptadorCorreoResend({ apiKey: "re_x", remitente: "" })).toThrow();
  });

  it("constructor rechaza un timeoutMs mayor al contrato (10s)", () => {
    expect(
      () => new AdaptadorCorreoResend({ apiKey: "re_x", remitente: "Atiende <a@b.com>", timeoutMs: 20_000 }),
    ).toThrow();
  });
});

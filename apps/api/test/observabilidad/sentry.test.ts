import { beforeEach, describe, expect, it, vi } from "vitest";

// `@sentry/node` mockeado por completo: ningún test de este archivo debe
// llamar de verdad al SDK real (nada de red, nada de proceso Sentry en
// segundo plano) — mismo criterio del programa ("nada finge producción").
vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

import * as Sentry from "@sentry/node";
import {
  capturarErrorNoManejado,
  capturarExcepcionWorker,
  crearRutaPruebaSentry,
  esperarEnvioSentry,
  iniciarSentry,
  redactarEventoSentry,
  sentryEstaHabilitado,
} from "../../src/observabilidad/sentry.js";

describe("iniciarSentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin SENTRY_DSN no llama Sentry.init y queda deshabilitado (no-op total)", () => {
    const resultado = iniciarSentry({});
    expect(resultado).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(sentryEstaHabilitado()).toBe(false);
  });

  it("con SENTRY_DSN vacío/solo espacios tampoco inicializa", () => {
    iniciarSentry({ SENTRY_DSN: "   " });
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(sentryEstaHabilitado()).toBe(false);
  });

  it("con SENTRY_DSN inicializa con environment/release/tracesSampleRate/beforeSend", () => {
    const resultado = iniciarSentry({
      SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1",
      APP_ENV_LABEL: "produccion-prueba",
      VERCEL_GIT_COMMIT_SHA: "abc123",
      SENTRY_TRACES_SAMPLE_RATE: "0.25",
    });

    expect(resultado).toBe(true);
    expect(sentryEstaHabilitado()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const opciones = vi.mocked(Sentry.init).mock.calls[0]![0] as Record<string, unknown>;
    expect(opciones.dsn).toBe("https://clave@o0.ingest.sentry.io/1");
    expect(opciones.environment).toBe("produccion-prueba");
    expect(opciones.release).toBe("abc123");
    expect(opciones.tracesSampleRate).toBe(0.25);
    expect(typeof opciones.beforeSend).toBe("function");
  });

  it("usa NODE_ENV si falta APP_ENV_LABEL, y omite release sin VERCEL_GIT_COMMIT_SHA", () => {
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1", NODE_ENV: "test" });
    const opciones = vi.mocked(Sentry.init).mock.calls[0]![0] as Record<string, unknown>;
    expect(opciones.environment).toBe("test");
    expect(opciones.release).toBeUndefined();
  });

  it("una tasa de muestreo inválida/fuera de rango cae al 0.1 por defecto", () => {
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1", SENTRY_TRACES_SAMPLE_RATE: "no-numero" });
    expect((vi.mocked(Sentry.init).mock.calls[0]![0] as Record<string, unknown>).tracesSampleRate).toBe(0.1);

    vi.mocked(Sentry.init).mockClear();
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1", SENTRY_TRACES_SAMPLE_RATE: "5" });
    expect((vi.mocked(Sentry.init).mock.calls[0]![0] as Record<string, unknown>).tracesSampleRate).toBe(0.1);
  });
});

describe("redactarEventoSentry (beforeSend)", () => {
  it("redacta cabeceras authorization y cookie, deja el resto intacto", () => {
    const evento = {
      request: {
        headers: { Authorization: "Bearer secreto-real", Cookie: "sesion=xyz", "User-Agent": "vitest" },
      },
    } as unknown as Sentry.ErrorEvent;

    const resultado = redactarEventoSentry(evento, false);

    expect(resultado.request?.headers?.Authorization).toBe("[REDACTADO]");
    expect(resultado.request?.headers?.Cookie).toBe("[REDACTADO]");
    expect(resultado.request?.headers?.["User-Agent"]).toBe("vitest");
  });

  it("redacta campos con forma de secreto en el cuerpo de la request, anidados", () => {
    const evento = {
      request: {
        data: {
          email: "huesped@example.com",
          password: "hunter2",
          anidado: { refreshToken: "abc", DATABASE_URL: "postgres://x", inocuo: "ok" },
        },
      },
    } as unknown as Sentry.ErrorEvent;

    const resultado = redactarEventoSentry(evento, false);
    const data = resultado.request?.data as Record<string, unknown>;

    expect(data.password).toBe("[REDACTADO]");
    expect(data.email).toBe("huesped@example.com");
    const anidado = data.anidado as Record<string, unknown>;
    expect(anidado.refreshToken).toBe("[REDACTADO]");
    expect(anidado.DATABASE_URL).toBe("[REDACTADO]");
    expect(anidado.inocuo).toBe("ok");
  });

  it("redacta campos sensibles dentro de extra/contexts", () => {
    const evento = {
      extra: { clienteSecret: "abc", nota: "sin problema" },
      contexts: { app: { CANAL_CIFRADO_CLAVES: "v1:xxx" } },
    } as unknown as Sentry.ErrorEvent;

    const resultado = redactarEventoSentry(evento, false);
    expect((resultado.extra as Record<string, unknown>).clienteSecret).toBe("[REDACTADO]");
    expect((resultado.extra as Record<string, unknown>).nota).toBe("sin problema");
    expect(((resultado.contexts as Record<string, Record<string, unknown>>).app as Record<string, unknown>).CANAL_CIFRADO_CLAVES).toBe(
      "[REDACTADO]",
    );
  });

  it("elimina el correo del usuario salvo enviarPii=true", () => {
    const evento = { user: { id: "u1", email: "huesped@example.com" } } as unknown as Sentry.ErrorEvent;

    const sinPii = redactarEventoSentry(evento, false);
    expect(sinPii.user?.email).toBeUndefined();
    expect(sinPii.user?.id).toBe("u1");

    const conPii = redactarEventoSentry(evento, true);
    expect(conPii.user?.email).toBe("huesped@example.com");
  });

  it("nunca lanza con un evento sin request/user/extra/contexts", () => {
    expect(() => redactarEventoSentry({} as Sentry.ErrorEvent, false)).not.toThrow();
  });
});

describe("capturarErrorNoManejado / capturarExcepcionWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    iniciarSentry({});
  });

  it("no llama captureException si Sentry no está habilitado", () => {
    capturarErrorNoManejado(new Error("boom"));
    capturarExcepcionWorker(new Error("boom worker"), { worker: "outboxWorker" });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("llama captureException cuando está habilitado", () => {
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1" });
    const error = new Error("boom");
    capturarErrorNoManejado(error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("capturarExcepcionWorker etiqueta con worker/canalId/tenantId (sin PII)", () => {
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1" });
    const error = new Error("fallo de sync");
    capturarExcepcionWorker(error, { worker: "cicloSyncInstrumentado", canalId: "c1", tenantId: "t1" });
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { worker: "cicloSyncInstrumentado", canalId: "c1", tenantId: "t1" },
    });
  });

  it("capturarExcepcionWorker omite tags ausentes (sin canalId/tenantId)", () => {
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1" });
    capturarExcepcionWorker(new Error("x"), { worker: "outboxWorker" });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { worker: "outboxWorker" } });
  });
});

describe("esperarEnvioSentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no llama Sentry.flush si Sentry no está habilitado", async () => {
    iniciarSentry({});
    await esperarEnvioSentry(2000);
    expect(Sentry.flush).not.toHaveBeenCalled();
  });

  it("llama Sentry.flush con el timeout dado si está habilitado", async () => {
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1" });
    await esperarEnvioSentry(2000);
    expect(Sentry.flush).toHaveBeenCalledWith(2000);
  });
});

describe("GET /internal/sentry-test (crearRutaPruebaSentry)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responde 503 sin CRON_SECRET configurado (fail-closed)", async () => {
    iniciarSentry({});
    const app = crearRutaPruebaSentry({});
    const res = await app.request("/sentry-test");
    expect(res.status).toBe(503);
    const cuerpo = await res.json();
    expect(cuerpo.error.codigo).toBe("servicio_no_configurado");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("responde 401 con CRON_SECRET configurado pero secreto ausente/incorrecto", async () => {
    iniciarSentry({});
    const app = crearRutaPruebaSentry({ CRON_SECRET: "secreto-correcto" });

    const sinCabecera = await app.request("/sentry-test");
    expect(sinCabecera.status).toBe(401);

    const conIncorrecta = await app.request("/sentry-test", { headers: { "x-cron-secret": "otro" } });
    expect(conIncorrecta.status).toBe(401);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("responde 200 enviado=false si el secreto es correcto pero Sentry no está habilitado (sin SENTRY_DSN)", async () => {
    iniciarSentry({});
    const app = crearRutaPruebaSentry({ CRON_SECRET: "secreto-correcto" });
    const res = await app.request("/sentry-test", { headers: { "x-cron-secret": "secreto-correcto" } });
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.enviado).toBe(false);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("responde 200 enviado=true y llama captureException con el secreto correcto y Sentry habilitado", async () => {
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1" });
    const app = crearRutaPruebaSentry({ CRON_SECRET: "secreto-correcto" });
    const res = await app.request("/sentry-test", { headers: { "x-cron-secret": "secreto-correcto" } });
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.enviado).toBe(true);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("también acepta el secreto vía Authorization: Bearer", async () => {
    iniciarSentry({ SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1" });
    const app = crearRutaPruebaSentry({ CRON_SECRET: "secreto-correcto" });
    const res = await app.request("/sentry-test", { headers: { authorization: "Bearer secreto-correcto" } });
    expect(res.status).toBe(200);
  });
});

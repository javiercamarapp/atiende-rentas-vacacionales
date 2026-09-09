import { describe, expect, it, vi } from "vitest";
import { enviarWebhookFirmado } from "../../src/workers/notificaciones/webhookSaliente.js";
import {
  serializarPayloadWebhook,
  verificarFirmaWebhook,
  type PayloadWebhookNotificacion,
} from "@atiende-rv/domain/notificaciones";

const PAYLOAD: PayloadWebhookNotificacion = {
  version: 1,
  tipoEvento: "alerta_observabilidad",
  titulo: "Sin sync exitosa",
  cuerpoTexto: "Airbnb sin sync exitosa hace 21600s",
  metadata: { canal: "airbnb" },
  emitidoEn: "2026-09-06T10:00:00.000Z",
};

/**
 * H-054: nunca se hace una petición HTTP real en esta suite — `fetchImpl`
 * y `resolverPersonalizado` se inyectan siempre.
 */
describe("enviarWebhookFirmado — H-054 (SSRF-safe, firmado, best-effort)", () => {
  it("rechaza una URL http:// (solo https:)", async () => {
    const fetchImpl = vi.fn();
    const resultado = await enviarWebhookFirmado("http://ejemplo.com/webhook", "secreto", PAYLOAD, { fetchImpl });
    expect(resultado.entregado).toBe(false);
    expect(resultado.motivoRechazo).toBe("esquema_no_permitido");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rechaza una URL con credenciales embebidas", async () => {
    const fetchImpl = vi.fn();
    const resultado = await enviarWebhookFirmado("https://usuario:clave@ejemplo.com/webhook", "secreto", PAYLOAD, { fetchImpl });
    expect(resultado.entregado).toBe(false);
    expect(resultado.motivoRechazo).toBe("credenciales_en_url");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rechaza un hostname que resuelve a una IP privada (SSRF)", async () => {
    const fetchImpl = vi.fn();
    const resolverPersonalizado = async () => ["10.0.0.5"];
    const resultado = await enviarWebhookFirmado("https://interno.ejemplo.com/webhook", "secreto", PAYLOAD, {
      fetchImpl,
      resolverPersonalizado,
    });
    expect(resultado.entregado).toBe(false);
    expect(resultado.motivoRechazo).toBe("ip_bloqueada");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rechaza un hostname que resuelve a loopback (SSRF)", async () => {
    const fetchImpl = vi.fn();
    const resolverPersonalizado = async () => ["127.0.0.1"];
    const resultado = await enviarWebhookFirmado("https://ejemplo.com/webhook", "secreto", PAYLOAD, { fetchImpl, resolverPersonalizado });
    expect(resultado.entregado).toBe(false);
    expect(resultado.motivoRechazo).toBe("ip_bloqueada");
  });

  it("con una IP pública válida, hace UNA petición POST con los headers de firma y timestamp correctos", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const resolverPersonalizado = async () => ["93.184.216.34"]; // IP pública de ejemplo (example.com).
    const antes = Math.floor(Date.now() / 1000);
    const resultado = await enviarWebhookFirmado("https://ejemplo.com/webhook", "secreto-real", PAYLOAD, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolverPersonalizado,
    });
    const despues = Math.floor(Date.now() / 1000);
    expect(resultado.entregado).toBe(true);
    expect(resultado.statusHttp).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ejemplo.com/webhook");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-atiende-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    // A3-NOTIF-01: timestamp de envío en un header dedicado, componente
    // estructural de la firma (no el `emitidoEn` del payload).
    expect(headers["x-atiende-timestamp"]).toMatch(/^\d+$/);
    const timestampEnviado = Number(headers["x-atiende-timestamp"]);
    expect(timestampEnviado).toBeGreaterThanOrEqual(antes);
    expect(timestampEnviado).toBeLessThanOrEqual(despues);
    expect(init.redirect).toBe("manual");

    // El receptor (tenant), reproduciendo el algoritmo documentado, debe
    // poder verificar esta firma+timestamp reales como válidos AHORA.
    const cuerpoEnviado = init.body as string;
    expect(
      verificarFirmaWebhook("secreto-real", headers["x-atiende-timestamp"], cuerpoEnviado, headers["x-atiende-signature"]),
    ).toBe(true);
    expect(serializarPayloadWebhook(PAYLOAD)).toBe(cuerpoEnviado);
  });

  it("A3-NOTIF-01 (REPLAY): un timestamp+firma real y VÁLIDO en el momento del envío deja de verificar como válido fuera de la ventana de tolerancia", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const resolverPersonalizado = async () => ["93.184.216.34"];
    const resultado = await enviarWebhookFirmado("https://ejemplo.com/webhook", "secreto-real", PAYLOAD, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolverPersonalizado,
    });
    expect(resultado.entregado).toBe(true);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const cuerpoCapturado = init.body as string;
    const firmaCapturada = headers["x-atiende-signature"];
    const timestampCapturado = headers["x-atiende-timestamp"];

    // El "atacante" reproduce EXACTAMENTE los mismos bytes de body +
    // header de firma + header de timestamp capturados del envío real
    // de arriba — sin poder forjar nada nuevo, solo repetirlos — pero
    // 10 minutos después (fuera de la tolerancia de 5 minutos).
    const diezMinutosDespuesMs = Date.now() + 10 * 60 * 1000;
    expect(
      verificarFirmaWebhook("secreto-real", timestampCapturado, cuerpoCapturado, firmaCapturada, {
        ahoraMs: diezMinutosDespuesMs,
      }),
    ).toBe(false);
  });

  it("nunca sigue una redirección (SSRF vía 3xx) — se reporta como no entregado", async () => {
    const fetchImpl = vi.fn(async () => ({ type: "opaqueredirect", ok: false, status: 0 }) as Response);
    const resolverPersonalizado = async () => ["93.184.216.34"];
    const resultado = await enviarWebhookFirmado("https://ejemplo.com/webhook", "secreto", PAYLOAD, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolverPersonalizado,
    });
    expect(resultado.entregado).toBe(false);
    expect(resultado.motivoRechazo).toBe("redireccion_no_seguida");
  });

  it("un status HTTP no-2xx se reporta como no entregado sin lanzar", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    const resolverPersonalizado = async () => ["93.184.216.34"];
    const resultado = await enviarWebhookFirmado("https://ejemplo.com/webhook", "secreto", PAYLOAD, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolverPersonalizado,
    });
    expect(resultado.entregado).toBe(false);
    expect(resultado.statusHttp).toBe(500);
    expect(resultado.motivoRechazo).toBe("status_no_2xx");
  });

  it("un error de red (fetch lanza) nunca se propaga — se traduce a resultado no entregado", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const resolverPersonalizado = async () => ["93.184.216.34"];
    const resultado = await enviarWebhookFirmado("https://ejemplo.com/webhook", "secreto", PAYLOAD, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolverPersonalizado,
    });
    expect(resultado.entregado).toBe(false);
    expect(resultado.motivoRechazo).toBe("error_red_o_timeout");
  });
});

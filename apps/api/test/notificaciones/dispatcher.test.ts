import { describe, expect, it, vi } from "vitest";
import type { AdaptadorCorreo, ContenidoNotificacion } from "@atiende-rv/domain/notificaciones";
import { despacharNotificacion, type EjecutorConsultaMinimo } from "../../src/workers/notificaciones/dispatcher.js";
import { cifrarSecretoWebhook } from "../../src/workers/notificaciones/cifradoSecreto.js";
import type { enviarWebhookFirmado } from "../../src/workers/notificaciones/webhookSaliente.js";

const CONTENIDO: ContenidoNotificacion = {
  tipoEvento: "paridad_precio",
  titulo: "Violación de paridad",
  cuerpoTexto: "airbnb por encima de lo esperado",
};

function ejecutorFalso(opciones: {
  preferencias?: Array<{ usuario_id: string; tipo_evento: string; canal: string; activo: boolean }>;
  webhook?: { url: string; secreto_cifrado: Buffer; secreto_iv: Buffer; secreto_tag: Buffer; activo: boolean } | null;
}): EjecutorConsultaMinimo {
  return {
    async query<T>(sql: string) {
      if (sql.includes("preferencia_notificacion_usuario")) {
        return { rows: (opciones.preferencias ?? []) as unknown as T[] };
      }
      if (sql.includes("webhook_tenant")) {
        return { rows: (opciones.webhook ? [opciones.webhook] : []) as unknown as T[] };
      }
      return { rows: [] as T[] };
    },
  };
}

function adaptadorCorreoFalso(): AdaptadorCorreo & { llamadas: number } {
  return {
    llamadas: 0,
    async enviar() {
      (this as unknown as { llamadas: number }).llamadas++;
      return { enviado: true, simulado: true };
    },
  };
}

describe("despacharNotificacion — H-054 (orquestación multicanal, best-effort)", () => {
  it("sin preferencia de correo guardada, NO envía correo (default seguro, opt-in)", async () => {
    const adaptador = adaptadorCorreoFalso();
    const resultado = await despacharNotificacion(
      { ejecutor: ejecutorFalso({}), adaptadorCorreo: adaptador },
      { usuarioId: "u1", usuarioEmail: "u1@ejemplo.com", tenantId: null, contenido: CONTENIDO },
    );
    expect(resultado.correoEnviado).toBe(false);
    expect(adaptador.llamadas).toBe(0);
    expect(resultado.canalesIntentados).toEqual(["in_app"]);
  });

  it("con la preferencia de correo activa, envía correo vía el adaptador inyectado", async () => {
    const adaptador = adaptadorCorreoFalso();
    const ejecutor = ejecutorFalso({
      preferencias: [{ usuario_id: "u1", tipo_evento: "paridad_precio", canal: "correo", activo: true }],
    });
    const resultado = await despacharNotificacion(
      { ejecutor, adaptadorCorreo: adaptador },
      { usuarioId: "u1", usuarioEmail: "u1@ejemplo.com", tenantId: null, contenido: CONTENIDO },
    );
    expect(resultado.correoEnviado).toBe(true);
    expect(adaptador.llamadas).toBe(1);
  });

  it("sin tenantId, nunca intenta resolver ni enviar webhook (webhookEntregado queda null)", async () => {
    const resultado = await despacharNotificacion(
      { ejecutor: ejecutorFalso({}), adaptadorCorreo: adaptadorCorreoFalso() },
      { usuarioId: "u1", usuarioEmail: "u1@ejemplo.com", tenantId: null, contenido: CONTENIDO },
    );
    expect(resultado.webhookEntregado).toBeNull();
  });

  it("con tenant sin webhook configurado, webhookEntregado queda null (no error)", async () => {
    const resultado = await despacharNotificacion(
      { ejecutor: ejecutorFalso({ webhook: null }), adaptadorCorreo: adaptadorCorreoFalso() },
      { usuarioId: "u1", usuarioEmail: "u1@ejemplo.com", tenantId: "t1", contenido: CONTENIDO },
    );
    expect(resultado.webhookEntregado).toBeNull();
  });

  it("con webhook de tenant activo, descifra el secreto y llama a enviarWebhook con el payload correcto", async () => {
    const cifrado = cifrarSecretoWebhook("secreto-real-del-tenant");
    const ejecutor = ejecutorFalso({
      webhook: { url: "https://ejemplo.com/hook", secreto_cifrado: cifrado.secretoCifrado, secreto_iv: cifrado.secretoIv, secreto_tag: cifrado.secretoTag, activo: true },
    });
    const enviarWebhookMock = vi.fn(async () => ({ entregado: true, statusHttp: 200, motivoRechazo: null })) as unknown as typeof enviarWebhookFirmado;

    const resultado = await despacharNotificacion(
      { ejecutor, adaptadorCorreo: adaptadorCorreoFalso(), enviarWebhook: enviarWebhookMock },
      { usuarioId: "u1", usuarioEmail: "u1@ejemplo.com", tenantId: "t1", contenido: CONTENIDO },
    );

    expect(resultado.webhookEntregado).toBe(true);
    expect(enviarWebhookMock).toHaveBeenCalledTimes(1);
    const [urlLlamada, secretoLlamado, payloadLlamado] = (enviarWebhookMock as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(urlLlamada).toBe("https://ejemplo.com/hook");
    expect(secretoLlamado).toBe("secreto-real-del-tenant");
    expect(payloadLlamado).toMatchObject({ tipoEvento: "paridad_precio", titulo: CONTENIDO.titulo });
  });

  it("con webhook de tenant INACTIVO, no lo intenta (queda null)", async () => {
    const cifrado = cifrarSecretoWebhook("s");
    const ejecutor = ejecutorFalso({
      webhook: { url: "https://ejemplo.com/hook", secreto_cifrado: cifrado.secretoCifrado, secreto_iv: cifrado.secretoIv, secreto_tag: cifrado.secretoTag, activo: false },
    });
    const enviarWebhookMock = vi.fn();
    const resultado = await despacharNotificacion(
      { ejecutor, adaptadorCorreo: adaptadorCorreoFalso(), enviarWebhook: enviarWebhookMock as unknown as typeof enviarWebhookFirmado },
      { usuarioId: "u1", usuarioEmail: "u1@ejemplo.com", tenantId: "t1", contenido: CONTENIDO },
    );
    expect(resultado.webhookEntregado).toBeNull();
    expect(enviarWebhookMock).not.toHaveBeenCalled();
  });

  it("un usuario que desactivó explícitamente 'webhook' para este tipo de evento causa opt-out (aunque el tenant lo tenga activo)", async () => {
    const cifrado = cifrarSecretoWebhook("s");
    const ejecutor = ejecutorFalso({
      preferencias: [{ usuario_id: "u1", tipo_evento: "paridad_precio", canal: "webhook", activo: false }],
      webhook: { url: "https://ejemplo.com/hook", secreto_cifrado: cifrado.secretoCifrado, secreto_iv: cifrado.secretoIv, secreto_tag: cifrado.secretoTag, activo: true },
    });
    const enviarWebhookMock = vi.fn();
    const resultado = await despacharNotificacion(
      { ejecutor, adaptadorCorreo: adaptadorCorreoFalso(), enviarWebhook: enviarWebhookMock as unknown as typeof enviarWebhookFirmado },
      { usuarioId: "u1", usuarioEmail: "u1@ejemplo.com", tenantId: "t1", contenido: CONTENIDO },
    );
    expect(resultado.webhookEntregado).toBeNull();
    expect(enviarWebhookMock).not.toHaveBeenCalled();
  });
});

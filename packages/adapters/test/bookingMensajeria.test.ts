import { describe, expect, it, vi } from "vitest";
import {
  BookingMessagingClient,
  ErrorClienteBookingMensajeria,
  ErrorHostNoPermitidoBooking,
  HOST_AUTENTICACION_BOOKING_MENSAJERIA,
  HOST_MENSAJERIA_BOOKING,
} from "../src/booking/mensajeria.js";

const credenciales = { clientId: "cid", clientSecret: "secret" };

function respuestaJson(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

describe("BookingMessagingClient — unidad (sin red real)", () => {
  it("usa los hosts reales documentados por defecto", () => {
    expect(HOST_AUTENTICACION_BOOKING_MENSAJERIA).toBe("https://connectivity-authentication.booking.com");
    expect(HOST_MENSAJERIA_BOOKING).toBe("https://supply-xml.booking.com");
  });

  it("rechaza un host fuera del allowlist en el constructor, antes de cualquier fetch", () => {
    expect(() => new BookingMessagingClient({ baseUrlAutenticacion: "https://evil.example" })).toThrow(
      ErrorHostNoPermitidoBooking,
    );
    expect(() => new BookingMessagingClient({ baseUrlMensajeria: "http://supply-xml.booking.com" })).toThrow(
      ErrorHostNoPermitidoBooking,
    );
  });

  it("obtenerMensajesPendientes reintenta con backoff ante fallos transitorios y termina por tener éxito", async () => {
    let llamadas = 0;
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("token-based-authentication")) {
        return respuestaJson(200, { jwt: "tok-1", ruid: "r1" });
      }
      llamadas++;
      if (llamadas < 3) return respuestaJson(500, { error: "temporal" });
      return respuestaJson(200, { messages: [], number_of_messages: 0 });
    });

    const cliente = new BookingMessagingClient({ fetchImpl: fetchImpl as unknown as typeof fetch, intentosBackoff: 5 });
    const resultado = await cliente.obtenerMensajesPendientes(credenciales);
    expect(resultado.numeroMensajes).toBe(0);
    expect(llamadas).toBe(3);
  });

  it("obtenerMensajesPendientes agota los intentos de backoff y propaga el error tipado", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("token-based-authentication")) return respuestaJson(200, { jwt: "tok-1", ruid: "r1" });
      return respuestaJson(503, { error: "caído" });
    });
    const cliente = new BookingMessagingClient({ fetchImpl: fetchImpl as unknown as typeof fetch, intentosBackoff: 2 });
    await expect(cliente.obtenerMensajesPendientes(credenciales)).rejects.toThrow(ErrorClienteBookingMensajeria);
  });

  it("enviarMensaje NUNCA reintenta con backoff ante un 500 (no documentado como idempotente) — falla en el primer intento", async () => {
    let llamadasEnvio = 0;
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("token-based-authentication")) return respuestaJson(200, { jwt: "tok-1", ruid: "r1" });
      llamadasEnvio++;
      return respuestaJson(500, { error: "fallo" });
    });
    const cliente = new BookingMessagingClient({ fetchImpl: fetchImpl as unknown as typeof fetch, intentosBackoff: 5 });
    await expect(
      cliente.enviarMensaje(credenciales, { propertyId: "p1", conversationId: "c1", contenido: "hola" }),
    ).rejects.toThrow(ErrorClienteBookingMensajeria);
    expect(llamadasEnvio).toBe(1); // sin reintento automático
  });

  it("enviarMensaje SÍ reintenta exactamente una vez ante un 401 (reautenticación, no reenvío del mensaje)", async () => {
    let tokensEmitidos = 0;
    let intentosEnvio = 0;
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      if (u.includes("token-based-authentication")) {
        tokensEmitidos++;
        return respuestaJson(200, { jwt: `tok-${tokensEmitidos}`, ruid: "r" });
      }
      intentosEnvio++;
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth === "Bearer tok-1") {
        return respuestaJson(401, { error: "expirado" });
      }
      return respuestaJson(200, { message_id: "m1", guest_has_account: false, ok: true });
    });
    const cliente = new BookingMessagingClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const resultado = await cliente.enviarMensaje(credenciales, { propertyId: "p1", conversationId: "c1", contenido: "hola" });
    expect(resultado.messageId).toBe("m1");
    expect(intentosEnvio).toBe(2); // 401 con tok-1, éxito con tok-2
    expect(tokensEmitidos).toBe(2);
  });

  it("cachea el token entre llamadas: no vuelve a autenticar dentro de la ventana de vigencia", async () => {
    let autenticaciones = 0;
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("token-based-authentication")) {
        autenticaciones++;
        return respuestaJson(200, { jwt: "tok-1", ruid: "r" });
      }
      return respuestaJson(200, { messages: [], number_of_messages: 0 });
    });
    const cliente = new BookingMessagingClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await cliente.obtenerMensajesPendientes(credenciales);
    await cliente.obtenerMensajesPendientes(credenciales);
    await cliente.obtenerMensajesPendientes(credenciales);
    expect(autenticaciones).toBe(1);
  });
});

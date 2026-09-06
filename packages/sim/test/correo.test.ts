import { describe, expect, it } from "vitest";
import type { ContenidoNotificacion, DestinatarioCorreo } from "@atiende-rv/domain/notificaciones";
import { AdaptadorCorreoSimulado } from "../src/correo/index.js";
import { CredencialesSospechosasDeProduccionError } from "../src/comun/etiquetado.js";

const DESTINATARIO: DestinatarioCorreo = { usuarioId: "u1", email: "u1@ejemplo.com" };
const CONTENIDO: ContenidoNotificacion = {
  tipoEvento: "alerta_observabilidad",
  titulo: "Sin sincronización exitosa",
  cuerpoTexto: "Airbnb sin sync exitosa hace 21600s",
};

describe("AdaptadorCorreoSimulado — H-054 (SIMULADOR, nunca envío real)", () => {
  it("enviar() devuelve simulado:true SIEMPRE, nunca lo omite", async () => {
    const adaptador = new AdaptadorCorreoSimulado({ entorno: "pruebas" });
    const resultado = await adaptador.enviar(DESTINATARIO, CONTENIDO);
    expect(resultado).toEqual({ enviado: true, simulado: true });
  });

  it("registra el envío en memoria, consultable solo para pruebas", async () => {
    const adaptador = new AdaptadorCorreoSimulado({ entorno: "pruebas" });
    await adaptador.enviar(DESTINATARIO, CONTENIDO);
    const enviados = adaptador.correosEnviados();
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.destinatario).toEqual(DESTINATARIO);
    expect(enviados[0]!.contenido).toEqual(CONTENIDO);
  });

  it("rechaza el arranque si el entorno declarado parece producción (D-019)", () => {
    expect(() => new AdaptadorCorreoSimulado({ entorno: "produccion" })).toThrow(CredencialesSospechosasDeProduccionError);
  });

  it("nunca imprime el email del destinatario en el log — solo longitud/usuarioId (minimización de PII)", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      const adaptador = new AdaptadorCorreoSimulado({ entorno: "pruebas" });
      await adaptador.enviar(DESTINATARIO, CONTENIDO);
    } finally {
      console.log = originalLog;
    }
    expect(logs.join("\n")).not.toContain(DESTINATARIO.email);
    expect(logs.join("\n")).toContain("SIMULADOR");
  });
});

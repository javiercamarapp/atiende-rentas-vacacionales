import { describe, expect, it } from "vitest";
import { detectarSenalesEscalamiento } from "../../src/mensajeria/escalamiento.js";

describe("detectarSenalesEscalamiento (H-060)", () => {
  it("detecta queja/emergencia/reembolso/vip por palabra clave", () => {
    expect(detectarSenalesEscalamiento("Esto es inaceptable, pésimo servicio")).toContain("queja");
    expect(detectarSenalesEscalamiento("Hay una fuga de gas, es una emergencia")).toContain("emergencia");
    expect(detectarSenalesEscalamiento("Quiero un reembolso completo")).toContain("reembolso");
    expect(detectarSenalesEscalamiento("Soy un huésped frecuente, trato preferencial por favor")).toContain("vip");
  });

  it("no marca ninguna señal ante un mensaje neutro", () => {
    expect(detectarSenalesEscalamiento("¿A qué hora puedo hacer el check-out?")).toEqual([]);
  });

  it("es puramente informativo: nunca lanza ni muta nada, solo devuelve etiquetas", () => {
    expect(() => detectarSenalesEscalamiento("cancela todo ya o dejo una reseña de 1 estrella")).not.toThrow();
  });
});

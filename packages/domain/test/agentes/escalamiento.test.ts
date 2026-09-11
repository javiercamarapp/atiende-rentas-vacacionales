import { describe, expect, it } from "vitest";
import { detectarIntencionArco } from "../../src/agentes/escalamiento.js";

describe("detectarIntencionArco — patrón 8 (rescatado de Likida/atiende.ai)", () => {
  it("detecta la mención explícita de 'derechos ARCO'", () => {
    expect(detectarIntencionArco("Quiero ejercer mis derechos ARCO sobre mis datos.")).toBe(true);
  });

  it("detecta 'acceso a mis datos personales'", () => {
    expect(detectarIntencionArco("Solicito el acceso a mis datos personales que tienen registrados.")).toBe(true);
  });

  it("detecta 'cancelación de mis datos personales'", () => {
    expect(detectarIntencionArco("Pido la cancelación de mis datos personales de su sistema.")).toBe(true);
  });

  it("detecta 'eliminen mis datos personales'", () => {
    expect(detectarIntencionArco("Por favor eliminen mis datos personales de su base.")).toBe(true);
  });

  it("detecta 'borren mis datos personales'", () => {
    expect(detectarIntencionArco("Necesito que borren mis datos personales cuanto antes.")).toBe(true);
  });

  it("detecta 'portabilidad de mis datos'", () => {
    expect(detectarIntencionArco("Quiero la portabilidad de mis datos personales a otra plataforma.")).toBe(true);
  });

  it("detecta 'revocar mi consentimiento'", () => {
    expect(detectarIntencionArco("Deseo revocar mi consentimiento para el uso de mis datos.")).toBe(true);
  });

  it("NO se dispara con 'cancela mi reserva' (acción distinta, sin mención de datos personales)", () => {
    expect(detectarIntencionArco("Cancela mi reserva por favor, ya no voy a llegar.")).toBe(false);
  });

  it("NO se dispara con 'no puedo acceder al departamento' (palabra 'acceder' sin 'datos personales')", () => {
    expect(detectarIntencionArco("No puedo acceder al departamento, la clave no funciona.")).toBe(false);
  });

  it("NO se dispara con un mensaje ordinario sin ninguna señal de privacidad", () => {
    expect(detectarIntencionArco("¿A qué hora es el check-in mañana?")).toBe(false);
  });

  it("NO se dispara solo por la palabra suelta 'cancela' o 'acceso' sin 'datos personales'", () => {
    expect(detectarIntencionArco("¿Tengo acceso al estacionamiento del edificio?")).toBe(false);
    expect(detectarIntencionArco("Cancela la limpieza de mañana, no hace falta.")).toBe(false);
  });

  it("es insensible a mayúsculas/acentos", () => {
    expect(detectarIntencionArco("QUIERO EJERCER MIS DERECHOS ARCO")).toBe(true);
    expect(detectarIntencionArco("solicito la RECTIFICACION de mis datos personales")).toBe(true);
  });
});

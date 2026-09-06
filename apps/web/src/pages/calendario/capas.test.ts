import { describe, expect, it } from "vitest";
import { claveCapaDeNoche, infoCapa } from "./capas";

const base = { ocupada: true, estado: "confirmado" as const, esDirecta: false };

describe("claveCapaDeNoche", () => {
  it("noche libre → 'libre'", () => {
    expect(claveCapaDeNoche({ ocupada: false, razon: null, estado: null, esDirecta: false })).toBe("libre");
  });

  it("RESERVA_CANAL + esDirecta=true → 'reserva_directa' (nunca 'reserva_canal')", () => {
    expect(claveCapaDeNoche({ ...base, razon: "RESERVA_CANAL", esDirecta: true })).toBe("reserva_directa");
  });

  it("RESERVA_CANAL + esDirecta=false → 'reserva_canal' (importada, nunca cancelable)", () => {
    const clave = claveCapaDeNoche({ ...base, razon: "RESERVA_CANAL", esDirecta: false });
    expect(clave).toBe("reserva_canal");
    expect(infoCapa(clave).cancelablePorPrincipio).toBe(false);
  });

  it("BLOQUEO_PROPIETARIO → 'bloqueo_propietario'", () => {
    expect(claveCapaDeNoche({ ...base, razon: "BLOQUEO_PROPIETARIO" })).toBe("bloqueo_propietario");
  });

  it("MANTENIMIENTO → 'mantenimiento'", () => {
    expect(claveCapaDeNoche({ ...base, razon: "MANTENIMIENTO" })).toBe("mantenimiento");
  });

  it("BUFFER_LIMPIEZA → 'buffer_limpieza'", () => {
    expect(claveCapaDeNoche({ ...base, razon: "BUFFER_LIMPIEZA" })).toBe("buffer_limpieza");
  });

  it("estado conflicto_pendiente prevalece sobre cualquier razón → 'conflicto_pendiente', nunca cancelable", () => {
    const clave = claveCapaDeNoche({ ...base, razon: "RESERVA_CANAL", estado: "conflicto_pendiente" });
    expect(clave).toBe("conflicto_pendiente");
    expect(infoCapa(clave).cancelablePorPrincipio).toBe(false);
  });

  it("las 4 razones de bloqueo/reserva tienen etiqueta+color propios (nunca colapsadas)", () => {
    const claves = ["reserva_directa", "reserva_canal", "bloqueo_propietario", "mantenimiento", "buffer_limpieza"] as const;
    const etiquetas = new Set(claves.map((c) => infoCapa(c).etiqueta));
    const clases = new Set(claves.map((c) => infoCapa(c).clases));
    expect(etiquetas.size).toBe(claves.length);
    expect(clases.size).toBe(claves.length);
  });
});

import { describe, expect, it } from "vitest";
import { calcularVencimientoSla, tareaVencida } from "../../src/limpieza/sla.js";

const CONFIG = { slaLimpiezaHoras: 4, slaMantenimientoHoras: 24 };

describe("calcularVencimientoSla (H-055)", () => {
  it("limpieza con prioridad media vence a las 4 horas", () => {
    const vence = calcularVencimientoSla("2026-06-10T10:00:00.000Z", "limpieza", "media", CONFIG);
    expect(vence).toBe("2026-06-10T14:00:00.000Z");
  });

  it("mantenimiento urgente reduce el SLA a la mitad (12h en vez de 24h)", () => {
    const vence = calcularVencimientoSla("2026-06-10T00:00:00.000Z", "mantenimiento", "urgente", CONFIG);
    expect(vence).toBe("2026-06-10T12:00:00.000Z");
  });

  it("prioridad baja duplica el SLA base", () => {
    const vence = calcularVencimientoSla("2026-06-10T00:00:00.000Z", "limpieza", "baja", CONFIG);
    expect(vence).toBe("2026-06-10T08:00:00.000Z");
  });
});

describe("tareaVencida", () => {
  it("una tarea sin completar cuyo SLA ya pasó está vencida", () => {
    expect(tareaVencida("2026-06-10T10:00:00.000Z", null, "2026-06-10T11:00:00.000Z")).toBe(true);
  });

  it("una tarea completada nunca se considera vencida, aunque el SLA haya pasado", () => {
    expect(
      tareaVencida("2026-06-10T10:00:00.000Z", "2026-06-10T10:30:00.000Z", "2026-06-10T12:00:00.000Z"),
    ).toBe(false);
  });

  it("sin SLA asignado, nunca está vencida", () => {
    expect(tareaVencida(null, null)).toBe(false);
  });
});

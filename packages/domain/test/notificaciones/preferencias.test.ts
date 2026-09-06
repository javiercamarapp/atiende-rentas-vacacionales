import { describe, expect, it } from "vitest";
import { resolverCanalesActivos, usuarioActivoParaCanal } from "../../src/notificaciones/preferencias.js";
import type { PreferenciaNotificacionUsuario } from "../../src/notificaciones/tipos.js";

describe("resolverCanalesActivos — H-054 (in_app siempre activo, opt-in para el resto)", () => {
  it("sin ninguna preferencia guardada, solo in_app está activo (default seguro, opt-in no opt-out)", () => {
    const canales = resolverCanalesActivos([], "u1", "alerta_observabilidad");
    expect(canales).toEqual(["in_app"]);
  });

  it("con correo activado explícitamente para ese tipo de evento, se agrega a la lista", () => {
    const prefs: PreferenciaNotificacionUsuario[] = [
      { usuarioId: "u1", tipoEvento: "alerta_observabilidad", canal: "correo", activo: true },
    ];
    expect(resolverCanalesActivos(prefs, "u1", "alerta_observabilidad")).toEqual(["in_app", "correo"]);
  });

  it("una preferencia de OTRO usuario nunca afecta la resolución de este usuario", () => {
    const prefs: PreferenciaNotificacionUsuario[] = [
      { usuarioId: "otro", tipoEvento: "alerta_observabilidad", canal: "correo", activo: true },
    ];
    expect(resolverCanalesActivos(prefs, "u1", "alerta_observabilidad")).toEqual(["in_app"]);
  });

  it("una preferencia de OTRO tipo de evento nunca activa correo para este tipo", () => {
    const prefs: PreferenciaNotificacionUsuario[] = [
      { usuarioId: "u1", tipoEvento: "tarea_limpieza", canal: "correo", activo: true },
    ];
    expect(resolverCanalesActivos(prefs, "u1", "paridad_precio")).toEqual(["in_app"]);
  });

  it("una preferencia guardada con activo:false NO activa el canal (desactivación explícita respetada)", () => {
    const prefs: PreferenciaNotificacionUsuario[] = [
      { usuarioId: "u1", tipoEvento: "alerta_observabilidad", canal: "correo", activo: false },
    ];
    expect(resolverCanalesActivos(prefs, "u1", "alerta_observabilidad")).toEqual(["in_app"]);
  });

  it("nunca incluye 'webhook' — es configuración de tenant, no de usuario (ver dispatcher)", () => {
    const prefs: PreferenciaNotificacionUsuario[] = [
      { usuarioId: "u1", tipoEvento: "alerta_observabilidad", canal: "webhook", activo: true },
    ];
    expect(resolverCanalesActivos(prefs, "u1", "alerta_observabilidad")).toEqual(["in_app"]);
  });
});

describe("usuarioActivoParaCanal", () => {
  it("true solo si hay una preferencia activa exacta para usuario+evento+canal", () => {
    const prefs: PreferenciaNotificacionUsuario[] = [
      { usuarioId: "u1", tipoEvento: "paridad_precio", canal: "webhook", activo: true },
    ];
    expect(usuarioActivoParaCanal(prefs, "u1", "paridad_precio", "webhook")).toBe(true);
    expect(usuarioActivoParaCanal(prefs, "u1", "paridad_precio", "correo")).toBe(false);
    expect(usuarioActivoParaCanal(prefs, "u2", "paridad_precio", "webhook")).toBe(false);
  });
});

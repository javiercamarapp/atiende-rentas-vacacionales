import { describe, expect, it } from "vitest";
import {
  CATALOGO_FLAGS_POR_DEFECTO,
  CategoriaRiesgoFlag,
  FLAG_SYNC_PUSH_AUTOMATICO,
  FlagNoRegistradoError,
  FlagRiesgoDefaultActivoError,
  RegistroFlags,
} from "../src/flags/index.js";

describe("RegistroFlags (H-089)", () => {
  it("registra el catálogo por defecto sin lanzar (sync.push_automatico operativo=true permitido)", () => {
    const registro = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    expect(registro.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(true);
  });

  it("rechaza registrar un flag DINERO_CANCELACION_CONTACTO con defaultValor=true", () => {
    expect(
      () =>
        new RegistroFlags([
          {
            id: "finanzas.cobro_automatico",
            descripcion: "cobra automáticamente al huésped",
            categoriaRiesgo: CategoriaRiesgoFlag.DINERO_CANCELACION_CONTACTO,
            defaultValor: true,
          },
        ]),
    ).toThrow(FlagRiesgoDefaultActivoError);
  });

  it("acepta un flag DINERO_CANCELACION_CONTACTO con defaultValor=false", () => {
    const registro = new RegistroFlags([
      {
        id: "finanzas.cobro_automatico",
        descripcion: "cobra automáticamente al huésped",
        categoriaRiesgo: CategoriaRiesgoFlag.DINERO_CANCELACION_CONTACTO,
        defaultValor: false,
      },
    ]);
    expect(registro.valor("finanzas.cobro_automatico")).toBe(false);
  });

  it("lanza FlagNoRegistradoError al consultar un flag inexistente", () => {
    const registro = new RegistroFlags([]);
    expect(() => registro.valor("no.existe")).toThrow(FlagNoRegistradoError);
  });

  it("establecer() sin tenantId cambia el valor global y queda en auditoría con actor/motivo/timestamp", () => {
    const ahoraFija = new Date("2026-09-06T10:00:00.000Z");
    const registro = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO, { ahora: () => ahoraFija });

    const entrada = registro.establecer({
      flagId: FLAG_SYNC_PUSH_AUTOMATICO,
      valor: false,
      actor: "sistema-restore",
      motivo: "restauracion_backup",
    });

    expect(registro.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(false);
    expect(entrada.valorAnterior).toBe(true);
    expect(entrada.actor).toBe("sistema-restore");
    expect(entrada.motivo).toBe("restauracion_backup");
    expect(entrada.en).toBe("2026-09-06T10:00:00.000Z");
    expect(registro.auditoria(FLAG_SYNC_PUSH_AUTOMATICO)).toHaveLength(1);
  });

  it("override por tenant no afecta el valor global ni otros tenants", () => {
    const registro = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);

    registro.establecer({
      flagId: FLAG_SYNC_PUSH_AUTOMATICO,
      valor: false,
      tenantId: "tenant-a",
      actor: "admin-a",
      motivo: "prueba",
    });

    expect(registro.valor(FLAG_SYNC_PUSH_AUTOMATICO, "tenant-a")).toBe(false);
    expect(registro.valor(FLAG_SYNC_PUSH_AUTOMATICO, "tenant-b")).toBe(true);
    expect(registro.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(true);
  });

  it("limpiarOverrideTenant() vuelve a heredar el valor global y queda auditado", () => {
    const registro = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    registro.establecer({
      flagId: FLAG_SYNC_PUSH_AUTOMATICO,
      valor: false,
      tenantId: "tenant-a",
      actor: "admin-a",
      motivo: "prueba",
    });

    registro.limpiarOverrideTenant(FLAG_SYNC_PUSH_AUTOMATICO, "tenant-a", "admin-a", "ya no aplica");

    expect(registro.valor(FLAG_SYNC_PUSH_AUTOMATICO, "tenant-a")).toBe(true);
    expect(registro.auditoria(FLAG_SYNC_PUSH_AUTOMATICO)).toHaveLength(2);
  });

  it("auditoria() sin argumento devuelve el historial de todos los flags", () => {
    const registro = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    registro.establecer({ flagId: FLAG_SYNC_PUSH_AUTOMATICO, valor: false, actor: "a", motivo: "m" });
    registro.establecer({ flagId: FLAG_SYNC_PUSH_AUTOMATICO, valor: true, actor: "a", motivo: "m2" });
    expect(registro.auditoria()).toHaveLength(2);
  });

  it("listar() expone las definiciones registradas (incluye sync.push_automatico)", () => {
    const registro = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    const ids = registro.listar().map((d) => d.id);
    expect(ids).toContain(FLAG_SYNC_PUSH_AUTOMATICO);
  });
});

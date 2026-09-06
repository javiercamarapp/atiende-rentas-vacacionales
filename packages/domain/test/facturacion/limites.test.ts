import { describe, expect, it } from "vitest";
import { evaluarAntesDeIncrementar, evaluarLimitesPlan } from "../../src/facturacion/limites.js";
import type { LimitesPlan, MedicionUsoTenant } from "../../src/facturacion/tipos.js";

const limites: LimitesPlan = { unidadesActivasMax: 15, mensajesIaMesMax: null, cuentasCanalMax: 3 };

function uso(overrides: Partial<MedicionUsoTenant> = {}): MedicionUsoTenant {
  return { tenantId: "t1", periodo: "2026-09", unidadesActivas: 0, mensajesIaMes: 0, cuentasCanal: 0, ...overrides };
}

describe("evaluarLimitesPlan — RV16 (unidades activas, mensajes IA, cuentas de canal)", () => {
  it("permite todo cuando el uso está por debajo de los 3 límites", () => {
    const resultados = evaluarLimitesPlan({ limites, uso: uso({ unidadesActivas: 5, cuentasCanal: 1 }) });
    expect(resultados.every((r) => r.permitido)).toBe(true);
  });

  it("bloquea unidades_activas al alcanzar el límite exacto", () => {
    const [unidades] = evaluarLimitesPlan({ limites, uso: uso({ unidadesActivas: 15 }) });
    expect(unidades!.permitido).toBe(false);
    expect(unidades!.motivo).toMatch(/Límite de unidades activas alcanzado/);
  });

  it("un límite null (mensajes_ia en este caso) nunca bloquea sin importar el uso", () => {
    const resultados = evaluarLimitesPlan({ limites, uso: uso({ mensajesIaMes: 999_999 }) });
    const mensajesIa = resultados.find((r) => r.recurso === "mensajes_ia")!;
    expect(mensajesIa.permitido).toBe(true);
    expect(mensajesIa.limite).toBeNull();
  });

  it("bloquea cuentas_canal por separado de los otros dos recursos", () => {
    const resultados = evaluarLimitesPlan({ limites, uso: uso({ cuentasCanal: 3, unidadesActivas: 1 }) });
    const cuentas = resultados.find((r) => r.recurso === "cuentas_canal")!;
    const unidades = resultados.find((r) => r.recurso === "unidades_activas")!;
    expect(cuentas.permitido).toBe(false);
    expect(unidades.permitido).toBe(true);
  });
});

describe("evaluarAntesDeIncrementar — bloquea ANTES de crear el recurso, nunca después", () => {
  it("con 14/15 unidades, dar de alta la unidad #15 SÍ está permitido (llega exacto al límite)", () => {
    const r = evaluarAntesDeIncrementar({
      recurso: "unidades_activas",
      limites,
      uso: uso({ unidadesActivas: 14 }),
    });
    expect(r.permitido).toBe(true);
  });

  it("con 15/15 unidades, dar de alta una unidad #16 NO está permitido", () => {
    const r = evaluarAntesDeIncrementar({
      recurso: "unidades_activas",
      limites,
      uso: uso({ unidadesActivas: 15 }),
    });
    expect(r.permitido).toBe(false);
    expect(r.motivo).toMatch(/excedería el límite/);
  });

  it("cuentas_canal sin límite (null) siempre permite el incremento", () => {
    const sinLimite: LimitesPlan = { ...limites, cuentasCanalMax: null };
    const r = evaluarAntesDeIncrementar({
      recurso: "cuentas_canal",
      limites: sinLimite,
      uso: uso({ cuentasCanal: 1000 }),
    });
    expect(r.permitido).toBe(true);
  });
});

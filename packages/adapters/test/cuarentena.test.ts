import { describe, expect, it } from "vitest";
import { aplicarResultadoCiclo, ESTADO_FEED_INICIAL } from "../src/sync/cuarentena.js";

const AHORA = "2027-01-01T00:00:00Z";

describe("aplicarResultadoCiclo — cuarentena (D-005, §Calendario-3)", () => {
  it("un fallo de red aislado NO activa cuarentena antes del umbral", () => {
    const { estado, alerta } = aplicarResultadoCiclo(ESTADO_FEED_INICIAL, "fallo_red", AHORA, {
      umbralIntentosFallidos: 3,
      huboEventosActivosPreviamente: false,
    });
    expect(estado.enCuarentenaDesde).toBeNull();
    expect(estado.intentosFallidosConsecutivos).toBe(1);
    expect(alerta).toBeNull();
  });

  it("caso adversarial 11 (feed inaccesible): tras N fallos consecutivos, cuarentena + alerta", () => {
    let estado = ESTADO_FEED_INICIAL;
    let alerta = null;
    for (let i = 0; i < 3; i++) {
      const r = aplicarResultadoCiclo(estado, "fallo_red", AHORA, {
        umbralIntentosFallidos: 3,
        huboEventosActivosPreviamente: false,
      });
      estado = r.estado;
      alerta = r.alerta;
    }
    expect(estado.enCuarentenaDesde).toBe(AHORA);
    expect(alerta).toEqual({ tipo: "cuarentena_activada", motivo: estado.motivoCuarentena });
  });

  it("caso adversarial 9 (feed malformado): fallo_parseo se trata igual que fallo_red, nunca libera disponibilidad", () => {
    const { estado } = aplicarResultadoCiclo(ESTADO_FEED_INICIAL, "fallo_parseo", AHORA, {
      umbralIntentosFallidos: 1,
      huboEventosActivosPreviamente: false,
    });
    expect(estado.enCuarentenaDesde).toBe(AHORA);
  });

  it("caso adversarial 10 (feed vacío): un éxito con 0 eventos sale de cuarentena y no falsea 'todo cancelado'", () => {
    const previo = { ...ESTADO_FEED_INICIAL, enCuarentenaDesde: "2026-12-01T00:00:00Z", intentosFallidosConsecutivos: 3 };
    const { estado, alerta } = aplicarResultadoCiclo(previo, "exito_vacio", AHORA, {
      umbralIntentosFallidos: 3,
      huboEventosActivosPreviamente: true,
    });
    expect(estado.enCuarentenaDesde).toBeNull();
    expect(estado.intentosFallidosConsecutivos).toBe(0);
    // Vacío inesperado (antes había eventos) sigue generando alerta INFORMATIVA,
    // pero sin bloquear ni marcar disponibilidad falsa.
    expect(alerta?.tipo).toBe("vacio_inesperado");
  });

  it("un éxito con eventos resetea completamente el estado de cuarentena", () => {
    const previo = { ...ESTADO_FEED_INICIAL, intentosFallidosConsecutivos: 2 };
    const { estado, alerta } = aplicarResultadoCiclo(previo, "exito_con_eventos", AHORA);
    expect(estado.intentosFallidosConsecutivos).toBe(0);
    expect(estado.enCuarentenaDesde).toBeNull();
    expect(alerta).toBeNull();
  });

  it("una cuarentena ya activa sigue alertando en cada ciclo fallido adicional", () => {
    const previo = {
      ultimaSincronizacionExitosaEn: null,
      enCuarentenaDesde: "2026-12-01T00:00:00Z",
      intentosFallidosConsecutivos: 5,
      motivoCuarentena: "motivo previo",
    };
    const { alerta } = aplicarResultadoCiclo(previo, "fallo_red", AHORA);
    expect(alerta?.tipo).toBe("cuarentena_persistente");
  });
});

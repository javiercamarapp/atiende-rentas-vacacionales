import { describe, expect, it } from "vitest";
import {
  ejecutarLiberacionInstruccionesAcceso,
  HORA_CORTE_DEFECTO,
  HORAS_ANTES_LIBERACION_ACCESO,
  TIPO_EVENTO_LIBERACION_INSTRUCCIONES_ACCESO,
  type EjecutorLiberacionInstruccionesAcceso,
} from "../../src/workers/notificacionesHuesped/liberacionInstruccionesAcceso.js";

/**
 * Orquestación pura (sin Postgres real) — mismo estilo de prueba que
 * `recordatorioCheckin.test.ts`: un `ejecutor` simulado verifica el camino
 * feliz, el aislamiento por fila y los conteos del resultado. La
 * aritmética real de T-48h/zona horaria (la parte que un mock NO puede
 * probar) tiene su propia prueba de integración contra Postgres real:
 * `test/integration/liberacionInstruccionesAccesoSql.test.ts`.
 */

function ejecutorConCandidatos(candidatos: Record<string, unknown>[]): EjecutorLiberacionInstruccionesAcceso & {
  eventosInsertados: unknown[][];
} {
  const eventosInsertados: unknown[][] = [];
  return {
    eventosInsertados,
    async query(sql: string, params?: unknown[]) {
      if (sql.trim().startsWith("WITH candidatos")) return { rows: candidatos };
      // SQL_GENERAR_EVENTO (INSERT+UPDATE combinados en un CTE).
      eventosInsertados.push(params ?? []);
      return { rows: [{ evento_id: "evento-falso" }] };
    },
  };
}

const AHORA_FIJO = () => new Date("2026-09-18T17:00:00Z");

describe("ejecutarLiberacionInstruccionesAcceso", () => {
  it("genera el evento para cada candidato y lo cuenta en eventosGenerados", async () => {
    const ejecutor = ejecutorConCandidatos([
      {
        ocupacion_id: "ocup-1",
        unidad_id: "unidad-1",
        nombre_unidad: "Depa 3B",
        nombre_propiedad: "Torre Sol",
        check_in: "2026-09-20",
        checkin_estimado: "2026-09-20 17:00:00",
      },
    ]);

    const resultado = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: AHORA_FIJO });

    expect(resultado).toEqual({ candidatos: 1, eventosGenerados: 1, errores: 0 });
    expect(ejecutor.eventosInsertados).toHaveLength(1);
    expect(ejecutor.eventosInsertados[0]![0]).toBe("ocup-1");
    const payload = JSON.parse(ejecutor.eventosInsertados[0]![1] as string) as Record<string, unknown>;
    expect(payload.unidadId).toBe("unidad-1");
    expect(payload.checkIn).toBe("2026-09-20");
    expect(payload.horasAnticipacion).toBe(HORAS_ANTES_LIBERACION_ACCESO);
    // El payload nunca incluye nada de marca de cerradura (REQ-095): las
    // únicas claves son las declaradas explícitamente por el worker.
    expect(Object.keys(payload).sort()).toEqual(["checkIn", "checkinEstimado", "horasAnticipacion", "unidadId"].sort());
  });

  it("un fallo al generar el evento de UNA fila no aborta el resto del lote (aislamiento por fila)", async () => {
    const candidatos = [
      { ocupacion_id: "ocup-falla", unidad_id: "u-1", nombre_unidad: "A", nombre_propiedad: "P", check_in: "2026-09-20", checkin_estimado: "x" },
      { ocupacion_id: "ocup-ok", unidad_id: "u-2", nombre_unidad: "B", nombre_propiedad: "P", check_in: "2026-09-21", checkin_estimado: "y" },
    ];
    const eventosInsertados: unknown[][] = [];
    const ejecutor: EjecutorLiberacionInstruccionesAcceso = {
      async query(sql, params) {
        if (sql.trim().startsWith("WITH candidatos")) return { rows: candidatos };
        if ((params as unknown[])[0] === "ocup-falla") throw new Error("fallo simulado de escritura");
        eventosInsertados.push(params ?? []);
        return { rows: [{ evento_id: "e" }] };
      },
    };

    const resultado = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: AHORA_FIJO });

    expect(resultado).toEqual({ candidatos: 2, eventosGenerados: 1, errores: 1 });
    expect(eventosInsertados).toHaveLength(1);
    expect(eventosInsertados[0]![0]).toBe("ocup-ok");
  });

  it("sin candidatos, no genera ningún evento y devuelve conteos en cero", async () => {
    const ejecutor = ejecutorConCandidatos([]);

    const resultado = await ejecutarLiberacionInstruccionesAcceso({ ejecutor, ahora: AHORA_FIJO });

    expect(resultado).toEqual({ candidatos: 0, eventosGenerados: 0, errores: 0 });
    expect(ejecutor.eventosInsertados).toHaveLength(0);
  });

  it("pasa HORA_CORTE_DEFECTO, HORAS_ANTES_LIBERACION_ACCESO y un límite por defecto a la consulta cuando no se pasan opciones", async () => {
    const ejecutor = ejecutorConCandidatos([]);
    let paramsCapturados: unknown[] | undefined;
    const ejecutorEspiado: EjecutorLiberacionInstruccionesAcceso = {
      async query(sql, params) {
        paramsCapturados = params;
        return ejecutor.query(sql, params);
      },
    };

    await ejecutarLiberacionInstruccionesAcceso({ ejecutor: ejecutorEspiado, ahora: AHORA_FIJO });

    expect(paramsCapturados?.[0]).toBe(HORA_CORTE_DEFECTO);
    expect(paramsCapturados?.[1]).toBe(HORAS_ANTES_LIBERACION_ACCESO);
    expect(paramsCapturados?.[2]).toBe("2026-09-18"); // fecha de AHORA_FIJO
    expect(paramsCapturados?.[3]).toBe("2026-09-18T17:00:00.000Z");
    expect(typeof paramsCapturados?.[4]).toBe("number"); // límite por defecto
  });

  it("respeta un horaCorte explícito distinto del default", async () => {
    const ejecutor = ejecutorConCandidatos([]);
    let paramsCapturados: unknown[] | undefined;
    const ejecutorEspiado: EjecutorLiberacionInstruccionesAcceso = {
      async query(sql, params) {
        paramsCapturados = params;
        return ejecutor.query(sql, params);
      },
    };

    await ejecutarLiberacionInstruccionesAcceso({ ejecutor: ejecutorEspiado, horaCorte: 15, ahora: AHORA_FIJO });

    expect(paramsCapturados?.[0]).toBe(15);
  });

  it("el tipo de evento exportado es el mismo que documenta el enunciado de REQ-095", () => {
    expect(TIPO_EVENTO_LIBERACION_INSTRUCCIONES_ACCESO).toBe("liberar_instrucciones_acceso");
  });
});

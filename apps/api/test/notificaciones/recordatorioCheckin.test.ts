import { describe, expect, it } from "vitest";
import {
  DIAS_ANTES_DEFECTO,
  ejecutarRecordatorioCheckin,
  type EjecutorRecordatorioCheckin,
} from "../../src/workers/notificacionesHuesped/recordatorioCheckin.js";
import type { CorreoAEnviar, InterfazCorreo } from "../../src/seguridad/correo.js";

/**
 * Orquestación pura (sin Postgres real) — mismo estilo de prueba que
 * `ejecutarCronSyncIcal` (`test/observabilidad/cronSync.test.ts`): un
 * `ejecutor`/`correo` simulados verifican el camino feliz, el aislamiento
 * por fila y los conteos del resultado.
 */

function correoFalso(opciones?: { fallaPara?: string[] }): InterfazCorreo & { enviados: CorreoAEnviar[] } {
  const enviados: CorreoAEnviar[] = [];
  return {
    enviados,
    async enviar(correo: CorreoAEnviar) {
      if (opciones?.fallaPara?.includes(correo.para)) {
        throw new Error(`fallo simulado para ${correo.para}`);
      }
      enviados.push(correo);
    },
  };
}

function ejecutorConCandidatos(candidatos: Record<string, unknown>[]): EjecutorRecordatorioCheckin & {
  updates: unknown[][];
} {
  const updates: unknown[][] = [];
  return {
    updates,
    async query(sql: string, params?: unknown[]) {
      if (sql.trim().startsWith("SELECT")) return { rows: candidatos };
      updates.push(params ?? []);
      return { rows: [] };
    },
  };
}

const AHORA_FIJO = () => new Date("2026-09-09T12:00:00Z");

describe("ejecutarRecordatorioCheckin", () => {
  it("envía el correo a cada candidato con contacto que parece correo y marca la fila como enviada", async () => {
    const ejecutor = ejecutorConCandidatos([
      {
        ocupacion_id: "ocup-1",
        nombre_unidad: "Depa 3B",
        nombre_propiedad: "Torre Sol",
        check_in: "2026-09-10",
        huesped_nombre: "Ana",
        huesped_contacto: "ana@example.com",
      },
    ]);
    const correo = correoFalso();

    const resultado = await ejecutarRecordatorioCheckin({
      ejecutor,
      correo,
      urlPublicaWeb: "https://web.example",
      ahora: AHORA_FIJO,
    });

    expect(resultado).toEqual({ candidatos: 1, enviados: 1, omitidosSinCorreo: 0, errores: 0 });
    expect(correo.enviados).toHaveLength(1);
    expect(correo.enviados[0]!.para).toBe("ana@example.com");
    expect(correo.enviados[0]!.html).toContain("mañana"); // 2026-09-10 es 1 día después de AHORA_FIJO
    expect(ejecutor.updates).toHaveLength(1);
    expect(ejecutor.updates[0]).toEqual(["ocup-1"]);
  });

  it("omite (sin enviar ni marcar) las filas cuyo contacto no parece un correo", async () => {
    const ejecutor = ejecutorConCandidatos([
      {
        ocupacion_id: "ocup-2",
        nombre_unidad: "Depa 3B",
        nombre_propiedad: "Torre Sol",
        check_in: "2026-09-10",
        huesped_nombre: "Ana",
        huesped_contacto: "+52 55 1234 5678",
      },
    ]);
    const correo = correoFalso();

    const resultado = await ejecutarRecordatorioCheckin({ ejecutor, correo, urlPublicaWeb: "https://web.example" });

    expect(resultado).toEqual({ candidatos: 1, enviados: 0, omitidosSinCorreo: 1, errores: 0 });
    expect(correo.enviados).toHaveLength(0);
    expect(ejecutor.updates).toHaveLength(0);
  });

  it("un fallo de correo en UNA fila no aborta el resto del lote (aislamiento por fila)", async () => {
    const ejecutor = ejecutorConCandidatos([
      {
        ocupacion_id: "ocup-falla",
        nombre_unidad: "Depa 1A",
        nombre_propiedad: "Torre Sol",
        check_in: "2026-09-10",
        huesped_nombre: null,
        huesped_contacto: "falla@example.com",
      },
      {
        ocupacion_id: "ocup-ok",
        nombre_unidad: "Depa 2A",
        nombre_propiedad: "Torre Sol",
        check_in: "2026-09-11",
        huesped_nombre: null,
        huesped_contacto: "ok@example.com",
      },
    ]);
    const correo = correoFalso({ fallaPara: ["falla@example.com"] });

    const resultado = await ejecutarRecordatorioCheckin({ ejecutor, correo, urlPublicaWeb: "https://web.example" });

    expect(resultado).toEqual({ candidatos: 2, enviados: 1, omitidosSinCorreo: 0, errores: 1 });
    expect(correo.enviados).toHaveLength(1);
    expect(correo.enviados[0]!.para).toBe("ok@example.com");
    // La fila que falló NUNCA se marca como enviada (solo la que sí salió).
    expect(ejecutor.updates).toEqual([["ocup-ok"]]);
  });

  it("usa DIAS_ANTES_DEFECTO y un límite por defecto cuando no se pasan opciones", async () => {
    const ejecutor = ejecutorConCandidatos([]);
    let paramsCapturados: unknown[] | undefined;
    const ejecutorEspiado: EjecutorRecordatorioCheckin = {
      async query(sql, params) {
        paramsCapturados = params;
        return ejecutor.query(sql, params);
      },
    };
    const correo = correoFalso();

    await ejecutarRecordatorioCheckin({ ejecutor: ejecutorEspiado, correo, urlPublicaWeb: "https://web.example" });

    expect(paramsCapturados?.[0]).toBe(DIAS_ANTES_DEFECTO);
    expect(typeof paramsCapturados?.[1]).toBe("number");
  });

  it("sin candidatos, no llama a correo.enviar y devuelve conteos en cero", async () => {
    const ejecutor = ejecutorConCandidatos([]);
    const correo = correoFalso();

    const resultado = await ejecutarRecordatorioCheckin({ ejecutor, correo, urlPublicaWeb: "https://web.example" });

    expect(resultado).toEqual({ candidatos: 0, enviados: 0, omitidosSinCorreo: 0, errores: 0 });
  });
});

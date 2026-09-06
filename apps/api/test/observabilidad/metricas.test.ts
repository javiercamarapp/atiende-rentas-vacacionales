import { describe, expect, it } from "vitest";
import {
  Counter,
  Gauge,
  Histogram,
  RegistroMetricas,
  exponerFormatoPrometheus,
  resumenLatenciaEtiquetada,
} from "../../src/workers/observabilidad/metricas.js";
import { MARCADOR_ATRIBUTO_REDACTADO } from "../../src/workers/observabilidad/otel.js";

describe("Gauge / Counter / Histogram", () => {
  it("Gauge.set sobrescribe el valor por serie de labels", () => {
    const g = new Gauge("g", "d");
    g.set(10, { canal: "airbnb" });
    g.set(20, { canal: "airbnb" });
    g.set(5, { canal: "vrbo" });
    expect(g.obtener({ canal: "airbnb" })).toBe(20);
    expect(g.obtener({ canal: "vrbo" })).toBe(5);
  });

  it("Counter.incrementar acumula por serie de labels, delta por defecto 1", () => {
    const c = new Counter("c", "d");
    c.incrementar({ clase: "2xx" });
    c.incrementar({ clase: "2xx" });
    c.incrementar({ clase: "5xx" }, 3);
    expect(c.obtener({ clase: "2xx" })).toBe(2);
    expect(c.obtener({ clase: "5xx" })).toBe(3);
  });

  it("Histogram calcula p50/p95/p99/min/max/cuenta/suma correctamente", () => {
    const h = new Histogram("h", "d");
    for (let i = 1; i <= 100; i++) h.observar(i);
    const [resumen] = h.snapshot();
    expect(resumen!.cuenta).toBe(100);
    expect(resumen!.suma).toBe(5050);
    expect(resumen!.min).toBe(1);
    expect(resumen!.max).toBe(100);
    expect(resumen!.p50).toBeGreaterThanOrEqual(49);
    expect(resumen!.p50).toBeLessThanOrEqual(51);
    expect(resumen!.p99).toBeGreaterThanOrEqual(98);
  });

  it("las métricas nunca aceptan PII en sus labels (redactado igual que los spans)", () => {
    const c = new Counter("c", "d");
    c.incrementar({ email: "javiercamara10porte@gmail.com" });
    const [serie] = c.snapshot();
    expect(serie!.labels.email).toBe(MARCADOR_ATRIBUTO_REDACTADO);
  });
});

describe("RegistroMetricas / exponerFormatoPrometheus", () => {
  it("expone Gauge de edad de última sync y Counter de errores con dimensión error_class (§Operación-2)", () => {
    const registro = new RegistroMetricas();
    registro.edadUltimaSyncSegundos.set(120, { canal: "airbnb" });
    registro.erroresSync.incrementar({ canal: "airbnb", error_class: "fallo_red" });

    const texto = exponerFormatoPrometheus(registro);
    expect(texto).toContain("atiende_rv_sync_edad_ultima_sync_segundos");
    expect(texto).toContain('canal="airbnb"');
    expect(texto).toContain("atiende_rv_sync_errores_total");
    expect(texto).toContain('error_class="fallo_red"');
  });

  it("descompone latencia interna (outbox) y latencia externa declarada por canal en series separadas", () => {
    const registro = new RegistroMetricas();
    registro.latenciaInternaMs.observar(150, { tipo_evento: "cerrar_disponibilidad" });
    registro.latenciaExternaDeclaradaSegundos.set(21600, { canal: "airbnb" }); // 6h, declarado, no medido.

    const texto = exponerFormatoPrometheus(registro);
    expect(texto).toContain("atiende_rv_outbox_latencia_interna_ms");
    expect(texto).toContain("atiende_rv_sync_latencia_externa_declarada_segundos");
    // Nunca deben aparecer en la misma línea (series independientes).
    const lineaInterna = texto.split("\n").find((l) => l.includes("atiende_rv_outbox_latencia_interna_ms_sum"));
    expect(lineaInterna).not.toContain("latencia_externa");
  });

  it("H-073: resumenLatenciaEtiquetada separa interna medida (con canal/cuenta/p50-95-99) de externa declarada (confianza)", () => {
    const registro = new RegistroMetricas();
    registro.latenciaInternaMs.observar(100, { tipo_evento: "cerrar_disponibilidad", canal: "airbnb", cuenta_canal_id: "cc-1" });
    registro.latenciaInternaMs.observar(200, { tipo_evento: "cerrar_disponibilidad", canal: "airbnb", cuenta_canal_id: "cc-1" });
    registro.latenciaInternaMs.observar(50, { tipo_evento: "liberar_disponibilidad" }); // sin canal resuelto.
    registro.latenciaExternaDeclaradaSegundos.set(10800, { canal: "vrbo", confianza: "media" });

    const resumen = resumenLatenciaEtiquetada(registro);

    const entradaAirbnb = resumen.internaMedidaMs.find((e) => e.canal === "airbnb");
    expect(entradaAirbnb).toBeDefined();
    expect(entradaAirbnb!.cuentaCanalId).toBe("cc-1");
    expect(entradaAirbnb!.cuenta).toBe(2);
    expect(entradaAirbnb!.p50).toBeGreaterThan(0);
    expect(entradaAirbnb!.p99).toBeGreaterThanOrEqual(entradaAirbnb!.p50);

    const entradaSinCanal = resumen.internaMedidaMs.find((e) => e.tipoEvento === "liberar_disponibilidad");
    expect(entradaSinCanal?.canal).toBeNull();
    expect(entradaSinCanal?.cuentaCanalId).toBeNull();

    expect(resumen.externaDeclaradaConfianzaSegundos).toEqual([
      { labels: { canal: "vrbo", confianza: "media" }, valor: 10800 },
    ]);
    // Nunca deben mezclarse numéricamente: la lista declarada no lleva p50/p95/p99.
    expect(resumen.externaDeclaradaConfianzaSegundos[0]).not.toHaveProperty("p50");
  });

  it("snapshot() incluye todos los instrumentos declarados", () => {
    const registro = new RegistroMetricas();
    const snap = registro.snapshot();
    expect(Object.keys(snap)).toEqual(
      expect.arrayContaining([
        "edadUltimaSyncSegundos",
        "colaOutbox",
        "reintentosSync",
        "cuarentenas",
        "conflictos",
        "erroresSync",
        "httpRespuestas",
        "latenciaInternaMs",
        "latenciaHttpMs",
        "latenciaExternaDeclaradaSegundos",
      ]),
    );
  });
});

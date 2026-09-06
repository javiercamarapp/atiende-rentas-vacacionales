import { describe, expect, it } from "vitest";
import {
  MARCADOR_ATRIBUTO_REDACTADO,
  crearTrazador,
  sanitizarAtributos,
  type SpanFinalizado,
} from "../../src/workers/observabilidad/otel.js";

/**
 * H-035/H-036 + §RV19/21-7: ninguna traza puede llevar PII, ni siquiera si
 * un desarrollador se equivoca y pasa un campo con un email/teléfono
 * sembrado real (la prueba siembra ambos explícitamente, como pide el
 * encargo de Lote 10).
 */
describe("sanitizarAtributos (sin PII en métricas/trazas)", () => {
  it("redacta un valor con forma de email aunque la clave sea inocua", () => {
    const limpio = sanitizarAtributos({ nota: "contacto: javiercamara10porte@gmail.com" });
    expect(limpio.nota).toBe(MARCADOR_ATRIBUTO_REDACTADO);
  });

  it("redacta un valor con forma de teléfono", () => {
    const limpio = sanitizarAtributos({ referencia: "+52 55 1234 5678" });
    expect(limpio.referencia).toBe(MARCADOR_ATRIBUTO_REDACTADO);
  });

  it("redacta por NOMBRE de clave sensible incluso si el valor no parece PII", () => {
    const limpio = sanitizarAtributos({ email: "abc", nombre_huesped: "x", password: "y" });
    expect(limpio.email).toBe(MARCADOR_ATRIBUTO_REDACTADO);
    expect(limpio.nombre_huesped).toBe(MARCADOR_ATRIBUTO_REDACTADO);
    expect(limpio.password).toBe(MARCADOR_ATRIBUTO_REDACTADO);
  });

  it("conserva atributos operativos normales sin tocarlos", () => {
    const limpio = sanitizarAtributos({ canal: "airbnb", status: 200, ok: true });
    expect(limpio).toEqual({ canal: "airbnb", status: 200, ok: true });
  });
});

describe("crearTrazador (spans PRODUCER/CONSUMER encadenados por traceId)", () => {
  it("un span hijo con traceId/parentSpanId explícitos queda encadenado al padre", () => {
    const spans: SpanFinalizado[] = [];
    const trazador = crearTrazador("test-service", [(s) => spans.push(s)]);

    const padre = trazador.iniciarSpan("sync.ciclo.import", { kind: "PRODUCER" });
    const hijo = trazador.iniciarSpan("outbox.evento.aplicar", {
      kind: "CONSUMER",
      traceId: padre.traceId,
      parentSpanId: padre.spanId,
    });
    hijo.terminar();
    padre.terminar();

    expect(spans).toHaveLength(2);
    const [spanHijo, spanPadre] = spans;
    expect(spanHijo!.traceId).toBe(spanPadre!.traceId);
    expect(spanHijo!.parentSpanId).toBe(spanPadre!.spanId);
    expect(spanPadre!.kind).toBe("PRODUCER");
    expect(spanHijo!.kind).toBe("CONSUMER");
  });

  it("terminar() con error marca estado='error' y guarda el mensaje, sin tumbar el exportador", () => {
    const spans: SpanFinalizado[] = [];
    const trazador = crearTrazador("test-service", [(s) => spans.push(s)]);
    const span = trazador.iniciarSpan("op");
    span.terminar({ error: new Error("fallo simulado") });
    expect(spans[0]!.estado).toBe("error");
    expect(spans[0]!.errorMensaje).toBe("fallo simulado");
  });

  it("un exportador que lanza no impide que terminar() devuelva el span", () => {
    const trazador = crearTrazador("svc", [
      () => {
        throw new Error("exportador roto");
      },
    ]);
    const span = trazador.iniciarSpan("op");
    expect(() => span.terminar()).not.toThrow();
  });

  it("terminar() dos veces sobre el mismo span lanza", () => {
    const trazador = crearTrazador("svc");
    const span = trazador.iniciarSpan("op");
    span.terminar();
    expect(() => span.terminar()).toThrow();
  });

  it("agregarAtributos() sanitiza igual que sanitizarAtributos", () => {
    const spans: SpanFinalizado[] = [];
    const trazador = crearTrazador("svc", [(s) => spans.push(s)]);
    const span = trazador.iniciarSpan("op");
    span.agregarAtributos({ email: "javiercamara10porte@gmail.com" });
    span.terminar();
    expect(spans[0]!.atributos.email).toBe(MARCADOR_ATRIBUTO_REDACTADO);
  });
});

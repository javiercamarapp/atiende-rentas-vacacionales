import { describe, expect, it } from "vitest";
import {
  MARCADOR_ATRIBUTO_REDACTADO,
  crearTrazador,
  redactarPiiEnTexto,
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

/**
 * Regresión permanente S-09 (docs/auditoria-2/seguridad.md):
 * `sanitizarAtributos` solo saneaba el VALOR de un atributo — el `nombre`
 * de un span (una cadena libre como "HTTP GET /ruta") nunca pasaba por
 * ningún filtro. `redactarPiiEnTexto` cierra ese hueco y es reutilizada
 * también por `middleware/logger.ts`.
 */
describe("redactarPiiEnTexto (S-09: PII dentro de un texto libre, no solo el valor completo de un atributo)", () => {
  it("redacta un email incrustado dentro de una ruta HTTP (el patrón es codicioso: sin espacios en un path, redacta el segmento completo — sobre-redactar es el error seguro)", () => {
    const resultado = redactarPiiEnTexto("HTTP GET /ruta/javiercamara10porte@gmail.com");
    expect(resultado).not.toContain("javiercamara10porte@gmail.com");
    expect(resultado).toContain(MARCADOR_ATRIBUTO_REDACTADO);
    expect(resultado).toBe(`HTTP GET ${MARCADOR_ATRIBUTO_REDACTADO}`);
  });

  it("con un separador de espacio SÍ preserva el resto del texto alrededor del email", () => {
    expect(redactarPiiEnTexto("contacto javiercamara10porte@gmail.com confirmado")).toBe(
      `contacto ${MARCADOR_ATRIBUTO_REDACTADO} confirmado`,
    );
  });

  it("redacta un teléfono incrustado en un texto libre", () => {
    expect(redactarPiiEnTexto("contacto +52 55 1234 5678 confirmado")).toBe(
      `contacto ${MARCADOR_ATRIBUTO_REDACTADO} confirmado`,
    );
  });

  it("deja intacto un texto sin PII", () => {
    expect(redactarPiiEnTexto("HTTP GET /health")).toBe("HTTP GET /health");
  });
});

describe("crearTrazador — el NOMBRE del span también se sanea (S-09)", () => {
  it("un span con email en el nombre lo redacta antes de finalizar", () => {
    const spans: SpanFinalizado[] = [];
    const trazador = crearTrazador("svc", [(s) => spans.push(s)]);
    const span = trazador.iniciarSpan("HTTP GET /ruta-que-no-existe/javiercamara10porte@gmail.com", {
      kind: "SERVER",
    });
    span.terminar();
    expect(spans[0]!.nombre).not.toContain("javiercamara10porte@gmail.com");
    expect(spans[0]!.nombre).toContain(MARCADOR_ATRIBUTO_REDACTADO);
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

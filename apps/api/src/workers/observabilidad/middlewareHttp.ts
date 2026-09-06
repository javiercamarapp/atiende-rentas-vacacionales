import type { MiddlewareHandler } from "hono";
import type { RegistroMetricas } from "./metricas.js";
import type { Trazador } from "./otel.js";

/**
 * Middleware de observabilidad HTTP (Lote 10, H-035/H-036): un span
 * `SERVER` por request con atributos sin PII (método, ruta SIN
 * querystring, status, duración — mismo criterio que
 * `middleware/logger.ts` de Lote 3, nunca cabeceras/body/query), más
 * Counter de respuestas por clase (2xx/4xx/5xx) e Histogram de duración.
 * Se registra DESPUÉS del logger de Lote 3 en `app.ts` — no lo reemplaza,
 * es una superficie de instrumentación distinta (métricas/trazas vs. log
 * de línea).
 */
export function crearMiddlewareObservabilidad(trazador: Trazador, metricas: RegistroMetricas): MiddlewareHandler {
  return async (c, next) => {
    const ruta = new URL(c.req.url).pathname;
    const span = trazador.iniciarSpan(`HTTP ${c.req.method} ${ruta}`, {
      kind: "SERVER",
      atributos: { "http.method": c.req.method, "http.route": ruta },
    });

    let error: unknown;
    try {
      await next();
    } catch (e) {
      error = e;
      throw e;
    } finally {
      const status = c.res?.status ?? 500;
      span.agregarAtributos({ "http.status_code": status });
      const finalizado = span.terminar({ error });

      metricas.latenciaHttpMs.observar(finalizado.duracionMs, { method: c.req.method });
      const clase = `${Math.floor(status / 100)}xx`;
      metricas.httpRespuestas.incrementar({ clase, method: c.req.method });
    }
  };
}

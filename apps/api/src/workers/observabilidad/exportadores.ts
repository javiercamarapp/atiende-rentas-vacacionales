import { appendFile } from "node:fs/promises";
import type { ExportadorSpans, SpanFinalizado } from "./otel.js";

/**
 * Exportadores de spans (Lote 10, H-036). `exportadorConsola`/
 * `exportadorArchivo` para dev (default), `exportadorOtlpHttp` para un
 * colector OTLP real configurable por variable de entorno — nunca
 * requerido para que las pruebas pasen (falla en silencio si no hay red,
 * ver `otel.ts`: un exportador roto nunca tumba el span real).
 */

export function exportadorConsola(prefijo = "[otel]"): ExportadorSpans {
  return (span: SpanFinalizado) => {
    console.log(
      JSON.stringify({
        prefijo,
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        nombre: span.nombre,
        kind: span.kind,
        duracionMs: span.duracionMs,
        estado: span.estado,
        atributos: span.atributos,
      }),
    );
  };
}

export function exportadorArchivo(ruta: string): ExportadorSpans {
  return (span: SpanFinalizado) => {
    // Escritura best-effort: no se espera la promesa (un exportador nunca
    // debe volver el span más lento ni bloquear el request real) — los
    // errores se ignoran deliberadamente (ver comentario en otel.ts).
    void appendFile(ruta, JSON.stringify(span) + "\n").catch(() => undefined);
  };
}

export interface OpcionesExportadorOtlp {
  endpoint: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

/**
 * Exportador OTLP/HTTP minimalista: envía cada span como JSON al
 * `endpoint` configurado. No implementa el esquema protobuf completo de
 * OTLP (fuera de alcance sin el SDK oficial, ver nota de cabecera de
 * `otel.ts`) — el shape (`resourceSpans`) es compatible en FORMA con lo
 * que un colector JSON de OTLP espera, para que apuntar esto a un
 * `otel-collector` real con el receptor HTTP/JSON de depuración funcione
 * sin traducción adicional.
 */
export function exportadorOtlpHttp(opciones: OpcionesExportadorOtlp): ExportadorSpans {
  const fetchImpl = opciones.fetchImpl ?? fetch;
  return (span: SpanFinalizado) => {
    const cuerpo = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: span.traceId,
                  spanId: span.spanId,
                  parentSpanId: span.parentSpanId ?? undefined,
                  name: span.nombre,
                  kind: span.kind,
                  startTimeUnixMs: span.inicioMs,
                  endTimeUnixMs: span.finMs,
                  attributes: span.atributos,
                  status: { code: span.estado === "error" ? "ERROR" : "OK", message: span.errorMensaje },
                },
              ],
            },
          ],
        },
      ],
    };
    void fetchImpl(opciones.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...(opciones.headers ?? {}) },
      body: JSON.stringify(cuerpo),
    }).catch(() => undefined);
  };
}

export interface ConfiguracionOtelEntorno {
  otlpEndpoint?: string;
  archivoSpans?: string;
  consola: boolean;
}

/** Lee la configuración de exportadores desde variables de entorno —
 * `OTEL_EXPORTER_OTLP_ENDPOINT` (estándar OTel), `OTEL_ARCHIVO_SPANS`
 * (dev/CI, ver docs/logs), y consola activada salvo que
 * `OTEL_CONSOLA=false` explícito. */
export function leerConfiguracionOtelEntorno(env: NodeJS.ProcessEnv = process.env): ConfiguracionOtelEntorno {
  return {
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
    archivoSpans: env.OTEL_ARCHIVO_SPANS || undefined,
    consola: env.OTEL_CONSOLA !== "false",
  };
}

export function construirExportadoresDesdeEntorno(config: ConfiguracionOtelEntorno): ExportadorSpans[] {
  const exportadores: ExportadorSpans[] = [];
  if (config.consola) exportadores.push(exportadorConsola());
  if (config.archivoSpans) exportadores.push(exportadorArchivo(config.archivoSpans));
  if (config.otlpEndpoint) exportadores.push(exportadorOtlpHttp({ endpoint: config.otlpEndpoint }));
  return exportadores;
}

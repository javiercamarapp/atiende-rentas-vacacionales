import { randomBytes } from "node:crypto";

/**
 * Trazador ligero, propio, sin dependencia de `@opentelemetry/*` (Lote 10,
 * H-035/H-036). Deliberadamente NO se instaló el SDK oficial: este
 * monorepo instala paquetes vía npm workspaces en el MISMO árbol de
 * trabajo que otros tres lotes construyen en paralelo ahora mismo — tocar
 * `package-lock.json` con una dependencia nueva de gran superficie es un
 * riesgo real de colisión de instalación concurrente, sin beneficio
 * proporcional para lo que este lote necesita probar (forma de traza
 * PRODUCER/CONSUMER encadenada por `traceId`, métricas Gauge/Counter/
 * Histogram/UpDownCounter, exportador consola/archivo/OTLP). El formato de
 * ids (`traceId` de 32 hex, `spanId` de 16 hex) y de atributos sigue la
 * convención de OpenTelemetry para que un exportador OTLP real
 * (`exportadorOtlpHttp`) pueda recibirlo sin traducción.
 */

export type SpanKind = "SERVER" | "CLIENT" | "PRODUCER" | "CONSUMER" | "INTERNAL";
export type SpanEstado = "ok" | "error";

export interface AtributosSpan {
  [clave: string]: string | number | boolean;
}

export interface SpanFinalizado {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  nombre: string;
  kind: SpanKind;
  atributos: AtributosSpan;
  inicioMs: number;
  finMs: number;
  duracionMs: number;
  estado: SpanEstado;
  errorMensaje?: string;
}

export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  /** Añade atributos SANITIZADOS (ver `sanitizarAtributos`) — nunca acepta
   * el valor crudo sin pasar por el filtro de PII. */
  agregarAtributos(atributos: AtributosSpan): void;
  terminar(opciones?: { error?: unknown }): SpanFinalizado;
}

/**
 * Patrones de valor que sugieren PII (email, teléfono) — se aplican al
 * VALOR de cada atributo, no solo al nombre de la clave, porque un
 * atributo inocuo como `nota` podría llevar un email pegado por error.
 * También se bloquean por NOMBRE de clave las más obvias
 * (email/telefono/nombre/apellido/huesped) como defensa adicional.
 */
const PATRON_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PATRON_TELEFONO = /(\+?\d[\d\s().-]{6,}\d)/;
const PATRON_EMAIL_GLOBAL = new RegExp(PATRON_EMAIL.source, "g");
const PATRON_TELEFONO_GLOBAL = new RegExp(PATRON_TELEFONO.source, "g");
const CLAVES_BLOQUEADAS = /email|correo|telefono|phone|nombre|apellido|huesped|password|contrasena|token|secreto/i;

export const MARCADOR_ATRIBUTO_REDACTADO = "[redactado-pii]";

/**
 * S-09 (docs/auditoria-2/seguridad.md): a diferencia de `sanitizarAtributos`
 * (que sustituye el VALOR COMPLETO de un atributo sospechoso), esto
 * redacta solo la SUBCADENA que parece email/teléfono dentro de un texto
 * libre más grande — necesario para el `nombre` de un span (p. ej.
 * `"HTTP GET /ruta-con-un-email-pegado@ejemplo.com"`) o una línea de log
 * de texto, donde el email/teléfono es solo una parte de la cadena, nunca
 * el valor completo. Reutilizado por `middleware/logger.ts` (Lote 3) —
 * antes de esta corrección, ni el `nombre` del span ni la `ruta` del
 * logger pasaban por NINGÚN filtro de PII, a diferencia de los atributos
 * del span (que sí pasaban por `sanitizarAtributos`).
 */
export function redactarPiiEnTexto(texto: string): string {
  return texto.replace(PATRON_EMAIL_GLOBAL, MARCADOR_ATRIBUTO_REDACTADO).replace(PATRON_TELEFONO_GLOBAL, MARCADOR_ATRIBUTO_REDACTADO);
}

/**
 * Filtra atributos antes de que entren a un span o a una métrica
 * (§RV19/21-7: métricas/trazas son "metadatos operativos", nunca PII).
 * Nunca lanza — un atributo sospechoso se sustituye por un marcador
 * explícito en vez de tirar todo el span, para que un bug de
 * instrumentación no tumbe una request real.
 */
export function sanitizarAtributos(atributos: AtributosSpan): AtributosSpan {
  const limpio: AtributosSpan = {};
  for (const [clave, valor] of Object.entries(atributos)) {
    if (CLAVES_BLOQUEADAS.test(clave)) {
      limpio[clave] = MARCADOR_ATRIBUTO_REDACTADO;
      continue;
    }
    if (typeof valor === "string" && (PATRON_EMAIL.test(valor) || PATRON_TELEFONO.test(valor))) {
      limpio[clave] = MARCADOR_ATRIBUTO_REDACTADO;
      continue;
    }
    limpio[clave] = valor;
  }
  return limpio;
}

function idHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export type ExportadorSpans = (span: SpanFinalizado) => void;

export interface OpcionesIniciarSpan {
  kind?: SpanKind;
  atributos?: AtributosSpan;
  /** Con `traceId`/`parentSpanId` explícitos, el span nace ENCADENADO a
   * uno existente (p. ej. el CONSUMER de un ciclo de sync encadenado al
   * PRODUCER que lo encoló) — sin esto, nace como raíz de un trace nuevo. */
  traceId?: string;
  parentSpanId?: string | null;
  ahora?: () => number;
}

export interface Trazador {
  nombreServicio: string;
  iniciarSpan(nombre: string, opciones?: OpcionesIniciarSpan): Span;
}

/**
 * Crea un trazador que reenvía cada span terminado a uno o más
 * exportadores (ver `exportadores.ts`). `nombreServicio` viaja como
 * atributo `service.name` en cada span (convención OTel).
 */
export function crearTrazador(nombreServicio: string, exportadores: ExportadorSpans[] = []): Trazador {
  return {
    nombreServicio,
    iniciarSpan(nombreCrudo, opciones = {}) {
      // S-09: el nombre del span (p. ej. "HTTP GET /ruta") nunca pasaba
      // por ningún filtro de PII, a diferencia de sus atributos.
      const nombre = redactarPiiEnTexto(nombreCrudo);
      const traceId = opciones.traceId ?? idHex(16);
      const spanId = idHex(8);
      const parentSpanId = opciones.parentSpanId ?? null;
      const kind = opciones.kind ?? "INTERNAL";
      const ahora = opciones.ahora ?? (() => Date.now());
      const inicioMs = ahora();
      let atributosAcumulados = sanitizarAtributos({ "service.name": nombreServicio, ...(opciones.atributos ?? {}) });
      let terminado = false;

      return {
        traceId,
        spanId,
        agregarAtributos(atributos) {
          if (terminado) return;
          atributosAcumulados = { ...atributosAcumulados, ...sanitizarAtributos(atributos) };
        },
        terminar(opcionesTerminar = {}) {
          if (terminado) {
            throw new Error(`Span "${nombre}" (${spanId}) ya fue terminado.`);
          }
          terminado = true;
          const finMs = ahora();
          const error = opcionesTerminar.error;
          const spanFinalizado: SpanFinalizado = {
            traceId,
            spanId,
            parentSpanId,
            nombre,
            kind,
            atributos: atributosAcumulados,
            inicioMs,
            finMs,
            duracionMs: Math.max(0, finMs - inicioMs),
            estado: error ? "error" : "ok",
            ...(error ? { errorMensaje: error instanceof Error ? error.message : String(error) } : {}),
          };
          for (const exportar of exportadores) {
            try {
              exportar(spanFinalizado);
            } catch {
              // Un exportador roto (p. ej. OTLP sin red) nunca debe tumbar
              // la request/ciclo real que está siendo trazado.
            }
          }
          return spanFinalizado;
        },
      };
    },
  };
}

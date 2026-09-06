import { sanitizarAtributos, type AtributosSpan } from "./otel.js";

/**
 * Registro de métricas en memoria (Lote 10, H-035), con los 4 tipos de
 * instrumento de OpenTelemetry Metrics que pide LOTES.md/ACEPTACION
 * §Operación-2: Gauge, Counter, Histogram, UpDownCounter. Etiquetas
 * (`labels`) SIEMPRE pasan por `sanitizarAtributos` — ninguna métrica
 * puede llevar PII, ni siquiera por accidente en un label mal puesto.
 */

function claveSerie(labels: AtributosSpan): string {
  const entradas = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return entradas.map(([k, v]) => `${k}=${v}`).join(",");
}

export interface SerieMetrica {
  labels: AtributosSpan;
  valor: number;
}

export class Gauge {
  private readonly series = new Map<string, SerieMetrica>();
  constructor(public readonly nombre: string, public readonly descripcion: string) {}

  set(valor: number, labels: AtributosSpan = {}): void {
    const labelsLimpios = sanitizarAtributos(labels);
    this.series.set(claveSerie(labelsLimpios), { labels: labelsLimpios, valor });
  }

  obtener(labels: AtributosSpan = {}): number | undefined {
    return this.series.get(claveSerie(sanitizarAtributos(labels)))?.valor;
  }

  snapshot(): SerieMetrica[] {
    return [...this.series.values()];
  }
}

export class Counter {
  private readonly series = new Map<string, SerieMetrica>();
  constructor(public readonly nombre: string, public readonly descripcion: string) {}

  incrementar(labels: AtributosSpan = {}, delta = 1): void {
    const labelsLimpios = sanitizarAtributos(labels);
    const clave = claveSerie(labelsLimpios);
    const actual = this.series.get(clave)?.valor ?? 0;
    this.series.set(clave, { labels: labelsLimpios, valor: actual + delta });
  }

  obtener(labels: AtributosSpan = {}): number {
    return this.series.get(claveSerie(sanitizarAtributos(labels)))?.valor ?? 0;
  }

  snapshot(): SerieMetrica[] {
    return [...this.series.values()];
  }
}

/** UpDownCounter: como Counter, pero admite delta negativo (tamaño de
 * cola: sube al encolar, baja al drenar). */
export class UpDownCounter extends Counter {
  decrementar(labels: AtributosSpan = {}, delta = 1): void {
    this.incrementar(labels, -delta);
  }
}

export interface ResumenHistograma {
  labels: AtributosSpan;
  cuenta: number;
  suma: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export class Histogram {
  private readonly muestras = new Map<string, { labels: AtributosSpan; valores: number[] }>();
  constructor(public readonly nombre: string, public readonly descripcion: string) {}

  observar(valor: number, labels: AtributosSpan = {}): void {
    const labelsLimpios = sanitizarAtributos(labels);
    const clave = claveSerie(labelsLimpios);
    const entrada = this.muestras.get(clave) ?? { labels: labelsLimpios, valores: [] };
    entrada.valores.push(valor);
    this.muestras.set(clave, entrada);
  }

  private percentil(ordenados: number[], p: number): number {
    if (ordenados.length === 0) return 0;
    const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
    return ordenados[Math.max(0, indice)]!;
  }

  snapshot(): ResumenHistograma[] {
    return [...this.muestras.values()].map(({ labels, valores }) => {
      const ordenados = [...valores].sort((a, b) => a - b);
      return {
        labels,
        cuenta: ordenados.length,
        suma: ordenados.reduce((a, b) => a + b, 0),
        min: ordenados[0] ?? 0,
        max: ordenados[ordenados.length - 1] ?? 0,
        p50: this.percentil(ordenados, 50),
        p95: this.percentil(ordenados, 95),
        p99: this.percentil(ordenados, 99),
      };
    });
  }
}

/**
 * Registro concreto de métricas del negocio (Lote 10, H-035/H-039):
 * edad de última sync exitosa por cuenta de canal, latencia interna
 * (outbox: evento→efecto aplicado) SEPARADA de la latencia externa
 * declarada por canal, tamaño de cola outbox, reintentos, cuarentenas,
 * conflictos, y errores HTTP 4xx/5xx.
 */
export class RegistroMetricas {
  readonly edadUltimaSyncSegundos = new Gauge(
    "atiende_rv_sync_edad_ultima_sync_segundos",
    "Segundos desde la última sincronización EXITOSA, por cuenta de canal/unidad",
  );
  /** Tamaño exacto de la cola pendiente en el momento del último
   * `set()` — modelado como Gauge (no UpDownCounter) porque siempre se
   * recalcula desde un `COUNT(*)` real (ver `outboxWorker.ts:
   * contarPendientesOutbox`), nunca desde incrementos/decrementos
   * acumulados que puedan desincronizarse de la verdad en BD. */
  readonly colaOutbox = new Gauge(
    "atiende_rv_outbox_cola_pendiente",
    "Eventos de outbox_evento sin procesar en este instante",
  );
  readonly reintentosSync = new Counter("atiende_rv_sync_reintentos_total", "Reintentos de ciclo de sync por canal");
  readonly cuarentenas = new Counter("atiende_rv_sync_cuarentenas_total", "Feeds puestos en cuarentena, por canal");
  readonly conflictos = new Counter(
    "atiende_rv_calendario_conflictos_total",
    "Conflictos de calendario detectados (conflicto_calendario), por tipo",
  );
  readonly erroresSync = new Counter("atiende_rv_sync_errores_total", "Errores de ciclo de sync, por error_class y canal");
  readonly httpRespuestas = new Counter("atiende_rv_http_respuestas_total", "Respuestas HTTP por clase de status (2xx/4xx/5xx)");

  /** Latencia INTERNA (§RV19/21-8): evento de outbox encolado → efecto
   * aplicado por el worker de observabilidad. Nunca se mezcla con la
   * latencia externa. */
  readonly latenciaInternaMs = new Histogram(
    "atiende_rv_outbox_latencia_interna_ms",
    "Milisegundos entre outbox_evento.creado_en y el efecto aplicado (drenado interno)",
  );
  readonly latenciaHttpMs = new Histogram("atiende_rv_http_duracion_ms", "Duración de request HTTP en milisegundos");

  /** Latencia EXTERNA declarada por canal — no medida, DECLARADA (viene
   * de constantes de `@atiende-rv/adapters` como `LATENCIA_AIRBNB_ICAL`).
   * Se expone como Gauge separado para que nunca se confunda con una
   * medición real ni se promedie junto con `latenciaInternaMs`. */
  readonly latenciaExternaDeclaradaSegundos = new Gauge(
    "atiende_rv_sync_latencia_externa_declarada_segundos",
    "Latencia típica DECLARADA por el canal (no medida), por canal — ver packages/adapters",
  );

  snapshot() {
    return {
      edadUltimaSyncSegundos: this.edadUltimaSyncSegundos.snapshot(),
      colaOutbox: this.colaOutbox.snapshot(),
      reintentosSync: this.reintentosSync.snapshot(),
      cuarentenas: this.cuarentenas.snapshot(),
      conflictos: this.conflictos.snapshot(),
      erroresSync: this.erroresSync.snapshot(),
      httpRespuestas: this.httpRespuestas.snapshot(),
      latenciaInternaMs: this.latenciaInternaMs.snapshot(),
      latenciaHttpMs: this.latenciaHttpMs.snapshot(),
      latenciaExternaDeclaradaSegundos: this.latenciaExternaDeclaradaSegundos.snapshot(),
    };
  }
}

function formatearLabels(labels: AtributosSpan): string {
  const entradas = Object.entries(labels);
  if (entradas.length === 0) return "";
  return `{${entradas.map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`).join(",")}}`;
}

/** Exposición en formato de texto Prometheus (`GET /metrics`) — el más
 * ampliamente reconocido para scraping, sin necesitar OTLP para lo básico. */
export function exponerFormatoPrometheus(registro: RegistroMetricas): string {
  const lineas: string[] = [];
  const gauges: Array<[Gauge, string]> = [
    [registro.edadUltimaSyncSegundos, "gauge"],
    [registro.latenciaExternaDeclaradaSegundos, "gauge"],
  ];
  for (const [g] of gauges) {
    lineas.push(`# HELP ${g.nombre} ${g.descripcion}`, `# TYPE ${g.nombre} gauge`);
    for (const s of g.snapshot()) lineas.push(`${g.nombre}${formatearLabels(s.labels)} ${s.valor}`);
  }
  const counters: Counter[] = [
    registro.reintentosSync,
    registro.cuarentenas,
    registro.conflictos,
    registro.erroresSync,
    registro.httpRespuestas,
  ];
  for (const c of counters) {
    lineas.push(`# HELP ${c.nombre} ${c.descripcion}`, `# TYPE ${c.nombre} counter`);
    for (const s of c.snapshot()) lineas.push(`${c.nombre}${formatearLabels(s.labels)} ${s.valor}`);
  }
  lineas.push(
    `# HELP ${registro.colaOutbox.nombre} ${registro.colaOutbox.descripcion}`,
    `# TYPE ${registro.colaOutbox.nombre} gauge`,
  );
  for (const s of registro.colaOutbox.snapshot()) lineas.push(`${registro.colaOutbox.nombre}${formatearLabels(s.labels)} ${s.valor}`);

  const histogramas: Histogram[] = [registro.latenciaInternaMs, registro.latenciaHttpMs];
  for (const h of histogramas) {
    lineas.push(`# HELP ${h.nombre} ${h.descripcion}`, `# TYPE ${h.nombre} summary`);
    for (const s of h.snapshot()) {
      lineas.push(
        `${h.nombre}_count${formatearLabels(s.labels)} ${s.cuenta}`,
        `${h.nombre}_sum${formatearLabels(s.labels)} ${s.suma}`,
        `${h.nombre}${formatearLabels({ ...s.labels, quantile: "0.5" })} ${s.p50}`,
        `${h.nombre}${formatearLabels({ ...s.labels, quantile: "0.95" })} ${s.p95}`,
        `${h.nombre}${formatearLabels({ ...s.labels, quantile: "0.99" })} ${s.p99}`,
      );
    }
  }
  return lineas.join("\n") + "\n";
}

/**
 * Registro de adaptadores por canal (transversal, Lote 3.4/RV22): mapa
 * ligero de "qué clase de adaptador construir para cada vía técnica de
 * cada canal" — únicamente metadatos de descubribilidad (nombre de canal,
 * nivel RV22, si tiene simulador), NUNCA instancia adaptadores por sí
 * mismo (cada uno requiere `EvidenciaConexionCanal` real de una
 * `cuenta_canal` concreta, D-017) y nunca sustituye al catálogo
 * declarativo en BD (`canal_catalogo`, migración 0110) que es la fuente
 * de verdad para la UI — este registro es para código (tests de
 * contrato, wiring futuro del motor de sync), no para el usuario final.
 */
export type NivelRv22 = "A" | "B" | "C";

export interface EntradaRegistroAdaptador {
  /** Código de canal — coincide con `canal_catalogo.canal_codigo`
   * (migración 0110) cuando aplica. */
  canalCodigo: string;
  /** Vía técnica distintiva dentro del mismo canal (RV22-R-02/R-05: un
   * canal puede tener varias vías con adaptadores y capacidades
   * distintas — p. ej. Airbnb iCal vs. Airbnb API partner). */
  via: "ical" | "api_partner" | "channel_manager_puente";
  nivel: NivelRv22;
  tieneSimulador: boolean;
  /** Módulo real (para referencia humana/documentación, no para import
   * dinámico) donde vive la clase `ChannelAdapter` de esta entrada. */
  moduloAdaptador: string;
}

/**
 * Fuente de verdad de código de "qué adaptadores existen hoy" — cada
 * fila corresponde a un archivo real bajo `packages/adapters/src/<canal>/`
 * construido en este lote (RV22 §4). Los canales Nivel C (sin vía técnica
 * implementable) NO tienen entrada aquí a propósito: no existe ningún
 * `ChannelAdapter` de código para ellos (RV22-R-06/R-09) — su catálogo
 * vive solo en `canal_catalogo` (BD), nunca como código de adaptador
 * falso.
 */
export const REGISTRO_ADAPTADORES: readonly EntradaRegistroAdaptador[] = [
  { canalCodigo: "airbnb", via: "ical", nivel: "A", tieneSimulador: true, moduloAdaptador: "./airbnb/adapter.js" },
  { canalCodigo: "vrbo", via: "ical", nivel: "A", tieneSimulador: true, moduloAdaptador: "./vrbo/adapter.js" },
  { canalCodigo: "agoda", via: "ical", nivel: "A", tieneSimulador: true, moduloAdaptador: "./agoda/adapter.js" },
  { canalCodigo: "booking", via: "api_partner", nivel: "B", tieneSimulador: true, moduloAdaptador: "./booking/adapter.js" },
  { canalCodigo: "expedia", via: "api_partner", nivel: "B", tieneSimulador: true, moduloAdaptador: "./expedia/adapter.js" },
  { canalCodigo: "vrbo", via: "api_partner", nivel: "B", tieneSimulador: false, moduloAdaptador: "./vrbo/apiAdapter.js" },
  { canalCodigo: "airbnb", via: "api_partner", nivel: "B", tieneSimulador: false, moduloAdaptador: "./airbnb/apiAdapter.js" },
  { canalCodigo: "google_vr", via: "api_partner", nivel: "B", tieneSimulador: false, moduloAdaptador: "./google-vr/adapter.js" },
  {
    canalCodigo: "siteminder",
    via: "channel_manager_puente",
    nivel: "B",
    tieneSimulador: true,
    moduloAdaptador: "./siteminder/adapter.js",
  },
] as const;

/** Todas las entradas del registro para un código de canal dado — un
 * canal puede tener más de una (RV22-R-02/R-05). */
export function entradasPorCanal(canalCodigo: string): EntradaRegistroAdaptador[] {
  return REGISTRO_ADAPTADORES.filter((e) => e.canalCodigo === canalCodigo);
}

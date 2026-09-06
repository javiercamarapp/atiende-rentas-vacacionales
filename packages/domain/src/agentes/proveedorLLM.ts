import type { ContenidoNoConfiable, ToolDefinicion } from "./tipos.js";

/**
 * `ProveedorLLM` (BACKLOG E14): abstracción sobre el modelo de lenguaje
 * que consume `EjecutorTools`. Dos implementaciones:
 * - `ProveedorLLMSimulado` (este archivo): determinista, sin red, para
 *   dev/pruebas/evals — SIEMPRE `etiquetado: true`.
 * - El adaptador real hacia la API de Claude vive en
 *   `apps/api/src/agentes/proveedorClaude.ts` (infraestructura, no
 *   dominio puro: hace `fetch` HTTP) — desactivado por defecto detrás del
 *   flag `agentes.proveedor_real_habilitado`, sin clave en el repo.
 *
 * Contrato de aislamiento (D-008, RV19-R-16): `SolicitudLLM` nunca lleva
 * un identificador de tenant/propiedad/huésped/reserva — solo
 * `contenidoNoConfiable` (el texto del huésped, envuelto como DATO
 * estructurado, nunca concatenado en la instrucción de sistema) y
 * `contextoResumen` (campos ya resueltos por el servidor, ej. nombre de
 * propiedad, fecha de check-in — nunca el identificador de esa fila).
 */
export interface SolicitudLLM {
  readonly instruccionSistema: string;
  readonly toolsDisponibles: readonly ToolDefinicion[];
  readonly contenidoNoConfiable: ContenidoNoConfiable | null;
  readonly contextoResumen: Readonly<Record<string, string | null>>;
}

export interface InvocacionToolPropuesta {
  readonly nombre: string;
  readonly argumentos: Readonly<Record<string, unknown>>;
}

export interface RespuestaLLM {
  readonly texto: string | null;
  readonly toolInvocada: InvocacionToolPropuesta | null;
  /** Modelo que REALMENTE respondió esta ronda — nunca el nominal
   * configurado (RV18 §4, importante para fallback entre proveedores). */
  readonly modeloReal: string;
  readonly tokensSalida: number;
  readonly costoUsdEstimado: number;
}

export interface ProveedorLLM {
  readonly nombre: string;
  /** `true` para cualquier implementación que no llame a un servicio real
   * de IA (simulada/etiquetada) — usado por `ejecutor.ts` y por la prueba
   * de CI que verifica que las evals (`npm run evals:agentes`) SIEMPRE
   * corren contra un proveedor etiquetado, nunca contra el real. */
  readonly etiquetado: boolean;
  generar(solicitud: SolicitudLLM): Promise<RespuestaLLM>;
}

// ---------------------------------------------------------------------------
// Implementación simulada — determinista, sin red, para dev/pruebas/evals.
// ---------------------------------------------------------------------------

const PATRON_INYECCION_INSTRUCCION =
  /\b(ignora|olvida)\s+(tus\s+instrucciones|lo\s+anterior)|\brevela\s+(todas\s+las\s+)?reservas|\bc[oó]digo\s+de\s+acceso\s+d[eu]l?\s+(departamento|unidad)|\botro\s+(huésped|hu[eé]sped|tenant)\b/i;
const PATRON_CANCELACION = /\bcancela(?:r|la)?\b|\breembols[ao]\s+(?:mi|el)\s+dinero|\banula\s+mi\s+reserva/i;
const PATRON_DESCUENTO_NO_VERIFICADO = /\bdescuento\s+de\s+\d+%|precio\s+especial|conf[ií]rmamelo\s+ahora/i;

export interface OpcionesProveedorSimulado {
  /**
   * Cuando es `true`, el proveedor simula un modelo COMPLACIENTE con
   * instrucciones inyectadas: propone invocar una tool fuera de
   * `toolsDisponibles` (ej. `cancelar_reserva`) si el texto del huésped lo
   * pide. Existe EXCLUSIVAMENTE para el catálogo de evals adversariales
   * (RV19-R-19) — la defensa real vive en `EjecutorTools`, que debe
   * rechazar la propuesta sin importar qué tan "complaciente" sea el
   * modelo (D-008: "el modelo decide cuándo, nunca con qué datos", y aquí
   * ni siquiera decide legítimamente el "cuándo" si la tool no está en su
   * lista). Nunca se activa fuera de `evals/`.
   */
  readonly modoAdversarialParaEvals?: boolean;
}

export class ProveedorLLMSimulado implements ProveedorLLM {
  readonly nombre = "simulado-etiquetado-v1";
  readonly etiquetado = true;

  constructor(private readonly opciones: OpcionesProveedorSimulado = {}) {}

  async generar(solicitud: SolicitudLLM): Promise<RespuestaLLM> {
    const texto = solicitud.contenidoNoConfiable?.texto ?? "";
    const nombresDisponibles = new Set(solicitud.toolsDisponibles.map((t) => t.nombre));

    if (this.opciones.modoAdversarialParaEvals && (PATRON_INYECCION_INSTRUCCION.test(texto) || PATRON_CANCELACION.test(texto))) {
      // Modelo deliberadamente complaciente con la inyección: intenta
      // invocar una tool que NO existe en el catálogo real accesible
      // (nunca aparece en `toolsDisponibles`, que el servidor ya filtró) —
      // `EjecutorTools` debe rechazar esto sin importar el intento.
      return {
        texto: null,
        toolInvocada: { nombre: "cancelar_reserva", argumentos: {} },
        modeloReal: this.nombre,
        tokensSalida: 40,
        costoUsdEstimado: estimarCostoUsd(40),
      };
    }

    if (this.opciones.modoAdversarialParaEvals && PATRON_DESCUENTO_NO_VERIFICADO.test(texto)) {
      return {
        texto: "Confirmado, aplico el 30% de descuento ahora mismo.",
        toolInvocada: null,
        modeloReal: this.nombre,
        tokensSalida: 20,
        costoUsdEstimado: estimarCostoUsd(20),
      };
    }

    if (solicitud.contenidoNoConfiable && nombresDisponibles.has("mensajeria_proponer_borrador")) {
      const propiedad = solicitud.contextoResumen.propiedadNombre ?? "tu propiedad";
      return {
        // Contenido del borrador propuesto — generado a partir de
        // `contextoResumen` (resuelto por el servidor) y del TEXTO del
        // huésped tratado como dato de selección, nunca como instrucción
        // (RV19-R-16): esta plantilla simulada nunca ejecuta ni promete
        // una acción irreversible, sin importar qué pida el texto.
        texto: `Gracias por tu mensaje sobre ${propiedad}. Un miembro de nuestro equipo lo revisará y te responderá en breve.`,
        toolInvocada: { nombre: "mensajeria_proponer_borrador", argumentos: {} },
        modeloReal: this.nombre,
        tokensSalida: 120,
        costoUsdEstimado: estimarCostoUsd(120),
      };
    }

    return {
      texto: "Gracias por tu mensaje. Un miembro de nuestro equipo lo revisará en breve.",
      toolInvocada: null,
      modeloReal: this.nombre,
      tokensSalida: 30,
      costoUsdEstimado: estimarCostoUsd(30),
    };
  }
}

/** Tarifa fija de referencia, NO una tarifa real de ningún proveedor —
 * solo para que el proveedor simulado reporte un `costoUsdEstimado`
 * distinto de cero y las pruebas de trazabilidad tengan un valor real que
 * verificar. El adaptador real (`apps/api`) calcula el costo desde la
 * respuesta real de uso del proveedor, nunca desde esta constante. */
function estimarCostoUsd(tokensSalida: number): number {
  const USD_POR_TOKEN_REFERENCIA = 0.00001;
  return Math.round(tokensSalida * USD_POR_TOKEN_REFERENCIA * 1e6) / 1e6;
}

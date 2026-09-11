/**
 * Patrón 4 (rescatado de Likida/atiende.ai): guardia anti-alucinación en
 * capas para el agente conversacional.
 *
 * `EjecutorTools` ya defiende fuerte sobre ACCIONES (catálogo cerrado de
 * tools, matriz rol×tool resuelta en servidor, `contieneConfirmacionNoVerificada`
 * bloquea texto que declara una acción irreversible como "ya aplicada") y
 * la tool de disponibilidad (`inventario_consultar_disponibilidad`) es
 * explícitamente de solo lectura determinista, nunca inferencia del
 * modelo. Pero para `mensajeria_proponer_borrador` — la única tool que
 * genera texto libre con el LLM cuyo PROPÓSITO es restablecer hechos ya
 * conocidos de la reserva/unidad en curso (precio, fechas, disponibilidad),
 * a diferencia de `precio_sugerir_ajuste`/`limpieza_proponer_tarea`, cuyo
 * propósito explícito es proponer un valor NUEVO — no existía ninguna capa
 * que verificara que un monto o una fecha CITADOS en ese texto coincidieran
 * con el dato real ya resuelto por el servidor antes de mostrarlo para
 * aprobación humana.
 *
 * Este módulo NO llama a ningún LLM ni a ninguna base de datos: es una
 * función pura que (1) extrae montos/fechas mencionados en un texto y (2)
 * los compara contra `contextoResumen` — el ÚNICO canal por el que el
 * servidor le entrega datos ya verificados al modelo (RV18 §6.2,
 * `SolicitudLLM.contextoResumen`, `EntradaRondaTool.contextoResumen`).
 * Cualquier monto/fecha citado que no aparezca ahí no tiene ninguna fuente
 * legítima: o el modelo lo inventó, o lo tomó del propio texto del
 * huésped (RV19-R-16: dato, nunca hecho verificado) — en ambos casos debe
 * bloquearse antes de llegar a la cola de aprobación humana, igual que
 * `contieneConfirmacionNoVerificada`.
 *
 * Falso positivo conocido y aceptado (documentado a propósito, no un bug
 * oculto): un monto correctamente CALCULADO por el modelo a partir de
 * datos reales (ej. "3 noches × $100 = $300" cuando `contextoResumen` solo
 * trae el precio por noche) se bloquearía igual, porque "$300" no aparece
 * literal en `contextoResumen`. Es una postura fail-closed deliberada —
 * más barato revisar a mano un borrador correcto marcado de más que dejar
 * pasar uno con una cifra inventada.
 */

import type { ToolDefinicion } from "./tipos.js";

/** Tools cuyo texto libre DEBE restablecer únicamente hechos ya conocidos
 * por el servidor — nunca proponer un valor nuevo (ese es el trabajo
 * legítimo de `precio_sugerir_ajuste`/`limpieza_proponer_tarea`, que
 * jamás deben pasar por este guardia). Un `Set` en vez de comparar contra
 * `ToolDefinicion.efecto` a propósito: "propuesta_aprobacion" también lo
 * llevan esas otras tools, así que el efecto por sí solo no distingue el
 * caso — la única señal confiable es el nombre explícito de la tool. */
export const TOOLS_SUJETAS_A_VERIFICACION_DE_HECHOS: ReadonlySet<ToolDefinicion["nombre"]> = new Set([
  "mensajeria_proponer_borrador",
]);

export type TipoHechoCitado = "monto" | "fecha";

export interface HechoCitado {
  readonly tipo: TipoHechoCitado;
  /** Fragmento tal como apareció en el texto (para el mensaje al humano
   * que revisa, nunca reescrito). */
  readonly textoOriginal: string;
  /** Forma normalizada y comparable: monto -> número con 2 decimales fijos
   * ("1500.00"); fecha -> ISO sin cambios ("2026-06-01"). */
  readonly valorNormalizado: string;
}

export interface ResultadoVerificacionHechos {
  readonly verificado: boolean;
  /** Vacío cuando `verificado` es `true`. Cada entrada es un hecho citado
   * en el texto que NO coincide con ningún valor de `contextoResumen`. */
  readonly hechosNoVerificados: readonly HechoCitado[];
}

// Montos: "$1500", "$1,500.00", "US$850", "us$ 850.5" — SIEMPRE con
// prefijo de moneda explícito (nunca un número suelto: "3 noches" o
// "el código es 2026" no son montos, y tratarlos como tales dispararía
// falsos positivos constantes sobre texto que no cita ningún precio).
const PATRON_MONTO_GLOBAL = /(?:US\$|\$)\s?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/gi;
// Fechas ISO 8601 (YYYY-MM-DD) — el único formato que `contextoResumen`
// usa en todo el repo (ver ContextoBorrador/fixtures); un texto libre en
// prosa ("el 5 de junio") no se intenta parsear aquí a propósito: sin una
// normalización 1:1 confiable, comparar formatos distintos produciría
// falsos positivos o negativos silenciosos, peor que no verificar nada.
const PATRON_FECHA_ISO_GLOBAL = /\b\d{4}-\d{2}-\d{2}\b/g;

const PATRON_MONTO_COMPLETO = /^(?:US\$|\$)?\s?(\d+(?:,\d{3})*(?:\.\d{1,2})?)$/i;
const PATRON_FECHA_ISO_COMPLETA = /^\d{4}-\d{2}-\d{2}$/;

function normalizarMonto(crudo: string): string {
  const numero = Number.parseFloat(crudo.replace(/,/g, ""));
  return numero.toFixed(2);
}

/** Extrae todos los montos/fechas citados en `texto` — orden de aparición
 * en el texto (nunca "todos los montos, luego todas las fechas"; el orden
 * importa para el mensaje que ve el humano que revisa), duplicados
 * incluidos (cada mención se verifica por separado). */
export function extraerHechosCitados(texto: string): readonly HechoCitado[] {
  const hechos: (HechoCitado & { readonly indice: number })[] = [];
  for (const coincidencia of texto.matchAll(PATRON_MONTO_GLOBAL)) {
    const grupo = coincidencia[1];
    if (!grupo) continue;
    hechos.push({
      tipo: "monto",
      textoOriginal: coincidencia[0],
      valorNormalizado: normalizarMonto(grupo),
      // `matchAll` siempre entrega `index` (a diferencia de un `RegExpMatchArray`
      // construido a mano) — el `?? 0` es solo para satisfacer el tipo
      // `number | undefined` de la lib de TS, nunca se ejerce en la práctica.
      indice: coincidencia.index ?? 0,
    });
  }
  for (const coincidencia of texto.matchAll(PATRON_FECHA_ISO_GLOBAL)) {
    hechos.push({
      tipo: "fecha",
      textoOriginal: coincidencia[0],
      valorNormalizado: coincidencia[0],
      indice: coincidencia.index ?? 0,
    });
  }
  return hechos.sort((a, b) => a.indice - b.indice).map(({ indice: _indice, ...hecho }) => hecho);
}

/** Construye el conjunto de montos/fechas REALES conocidos a partir de
 * `contextoResumen` — mismas reglas de normalización que
 * `extraerHechosCitados`, para que una comparación de `Set` sea siempre
 * exacta (nunca una comparación de string cruda contra normalizada). */
function valoresRealesConocidos(contextoResumen: Readonly<Record<string, string | null>>): {
  readonly montos: ReadonlySet<string>;
  readonly fechas: ReadonlySet<string>;
} {
  const montos = new Set<string>();
  const fechas = new Set<string>();
  for (const valor of Object.values(contextoResumen)) {
    if (valor === null) continue;
    const comoMonto = PATRON_MONTO_COMPLETO.exec(valor);
    if (comoMonto?.[1]) montos.add(normalizarMonto(comoMonto[1]));
    if (PATRON_FECHA_ISO_COMPLETA.test(valor)) fechas.add(valor);
  }
  return { montos, fechas };
}

/**
 * Verifica que todo monto/fecha citado en `texto` coincida con un valor
 * real conocido en `contextoResumen`. Sin citas (caso común: un borrador
 * que no menciona ningún precio ni fecha), `verificado` es siempre `true`
 * — este guardia nunca bloquea por AUSENCIA de datos, solo por una cita
 * que contradice o inventa un dato que el servidor nunca entregó.
 */
export function verificarHechosCitados(
  texto: string,
  contextoResumen: Readonly<Record<string, string | null>>,
): ResultadoVerificacionHechos {
  const citados = extraerHechosCitados(texto);
  if (citados.length === 0) return { verificado: true, hechosNoVerificados: [] };

  const reales = valoresRealesConocidos(contextoResumen);
  const hechosNoVerificados = citados.filter((hecho) => {
    const conocidos = hecho.tipo === "monto" ? reales.montos : reales.fechas;
    return !conocidos.has(hecho.valorNormalizado);
  });
  return { verificado: hechosNoVerificados.length === 0, hechosNoVerificados };
}

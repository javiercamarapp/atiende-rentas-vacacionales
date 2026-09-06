/**
 * Patrones de identificador prohibido (H-077, D-008, RV18 §8 mecanismo 1).
 * Usado por:
 * - `catalogo.ts` (documentación/auto-verificación al construir el catálogo)
 * - la prueba obligatoria de LOTES.md ("un test que enumera el registro
 *   completo de tools falla si aparece alguna cuyo
 *   `input_schema.properties` incluya un campo `*_id`/`tenant*`/
 *   `propiedad*`/`huesped*`/`reserva*`")
 * - `ejecutor.ts` (defensa en profundidad: rechaza en runtime cualquier
 *   argumento del modelo cuyo nombre coincida, incluso si por error
 *   humano se coló en un `inputSchema`).
 */

const PATRONES: RegExp[] = [
  /_id$/i,
  /^id$/i,
  /^tenant/i,
  /^propiedad/i,
  /^unidad_?id/i,
  /^huesped/i,
  /^guest/i,
  /^reserva/i,
  /^booking_?id/i,
  /^conversation/i,
  /^conversacion/i,
];

/** `true` si `nombreCampo` coincide con un patrón de identificador de
 * aislamiento prohibido en un `input_schema` de tool de agente. */
export function esCampoIdentificadorProhibido(nombreCampo: string): boolean {
  return PATRONES.some((patron) => patron.test(nombreCampo));
}

/** Prefijos de tool cuyo `input_schema.properties` debe recibir el
 * escrutinio más estricto (RV18 §8 mecanismo 1: "inventario_",
 * "calendario_", "precio_aplicar_", "mensajeria_enviar_") — en este
 * catálogo NINGUNA tool con estos prefijos declara campos no vacíos que
 * coincidan con `esCampoIdentificadorProhibido`, y las dos últimas
 * (`precio_aplicar_*`, `mensajeria_enviar_*`) no existen en absoluto en el
 * catálogo accesible a un agente LLM (ver `catalogo.ts`,
 * `NOMBRES_TOOLS_PROHIBIDAS`). */
export const PREFIJOS_TOOL_MUTACION_SENSIBLE = ["inventario_", "calendario_", "precio_aplicar_", "mensajeria_enviar_"] as const;

export function tienePrefijoMutacionSensible(nombreTool: string): boolean {
  return PREFIJOS_TOOL_MUTACION_SENSIBLE.some((prefijo) => nombreTool.startsWith(prefijo));
}

/**
 * Fragmentos de nombre/descripción que implican cancelación de reserva o
 * envío directo de mensaje sin aprobación — ninguna tool del catálogo
 * puede tener un nombre o descripción que contenga alguno de éstos (RV18
 * §8 mecanismo 3, RV18-R-03, D-006). Verificado literalmente en
 * `packages/domain/test/agentes/catalogo.test.ts`.
 */
export const FRAGMENTOS_ACCION_PROHIBIDA = [
  "cancelar_reserva",
  "cancelar reserva",
  "contactar_huesped_directo",
  "contactar huésped directamente",
  "enviar_directo",
  "enviar mensaje sin aprobación",
  "mensajeria_enviar",
  "cambiar_tenant",
  "cambiar de tenant",
  "modificar_permisos",
  "modificar permisos",
  "modificar_roles",
  "ejecutar_sql",
  "ejecutar sql",
] as const;

export function contieneAccionProhibida(texto: string): boolean {
  const normalizado = texto.toLowerCase();
  return FRAGMENTOS_ACCION_PROHIBIDA.some((fragmento) => normalizado.includes(fragmento));
}

import type { ToolDefinicion } from "./tipos.js";

/**
 * Catálogo de tools de IA (H-077, BACKLOG E14). Carpeta exclusiva de Lote
 * 9. Cada tool cumple, sin excepción (D-008, RV18 §6.2, RV19-R-17):
 *
 * - `inputSchema.properties` NUNCA declara un campo `*_id`/`tenant*`/
 *   `propiedad*`/`huesped*`/`reserva*` (verificado en
 *   `patronesIdentificador.ts` + prueba de CI obligatoria).
 * - `inputSchema.additionalProperties === false` siempre — el modelo no
 *   puede colar un campo fuera de lo declarado.
 * - Los identificadores de aislamiento (tenant/unidad/propiedad/huésped/
 *   reserva/conversación) SIEMPRE llegan al handler vía `ToolContext`
 *   inyectado por el servidor (`ejecutor.ts`), nunca vía `inputSchema`.
 *
 * PROHIBIDO por diseño (D-006, RV18-R-03) — no existen en este archivo ni
 * en ningún otro accesible a un agente LLM: tools de cancelar reserva,
 * enviar mensaje externo sin aprobación, modificar permisos/roles, cambiar
 * de tenant, ejecutar SQL arbitrario. `NOMBRES_TOOLS_PROHIBIDAS` abajo
 * enumera los nombres que la prueba de CI verifica ausentes.
 */
export const NOMBRES_TOOLS_PROHIBIDAS = [
  "cancelar_reserva",
  "contactar_huesped_directo",
  "mensajeria_enviar_directo",
  "mensajeria_enviar",
  "cambiar_tenant",
  "modificar_permisos",
  "modificar_roles",
  "ejecutar_sql",
] as const;

export const CATALOGO_TOOLS_AGENTE: readonly ToolDefinicion[] = [
  {
    nombre: "inventario_consultar_disponibilidad",
    descripcion:
      "Consulta la disponibilidad de la unidad de la conversación en curso (resuelta por el servidor) " +
      "para un rango de fechas. Solo lectura — nunca decide ni escribe disponibilidad (D-007): la " +
      "respuesta proviene siempre del motor determinista de calendario (packages/domain aplicacion/), " +
      "nunca de una inferencia del modelo.",
    inputSchema: {
      type: "object",
      properties: {
        fechaInicio: { type: "string", format: "date", description: "Fecha ISO 8601 (YYYY-MM-DD) de inicio del rango a consultar." },
        fechaFin: { type: "string", format: "date", description: "Fecha ISO 8601 (YYYY-MM-DD) de fin del rango (exclusivo)." },
      },
      required: ["fechaInicio", "fechaFin"],
      additionalProperties: false,
    },
    efecto: "lectura",
    requiereLlm: false,
    rolesPermitidos: ["superadmin", "admin_gestora", "operador", "propietario"],
    limites: { maxLlamadasPorConversacion: 10, techoTokensSalida: 0 },
  },
  {
    nombre: "incidencia_resumir",
    descripcion:
      "Genera un resumen en texto del hilo de mensajes y reportes de limpieza/mantenimiento de la " +
      "unidad en contexto: qué pasó, qué se resolvió, qué queda pendiente. Se muestra como borrador " +
      "editable — no dispara ninguna acción por sí mismo (RV18 §2.2).",
    inputSchema: {
      type: "object",
      properties: {
        incluirPendientes: { type: "boolean", description: "Si el resumen debe listar explícitamente los pendientes abiertos." },
      },
      required: [],
      additionalProperties: false,
    },
    efecto: "lectura",
    requiereLlm: true,
    rolesPermitidos: ["superadmin", "admin_gestora", "operador", "propietario"],
    nivelesColaboradorPermitidos: ["acceso_total", "calendario_mensajeria"],
    limites: { maxLlamadasPorConversacion: 5, techoTokensSalida: 600 },
  },
  {
    nombre: "mensajeria_proponer_borrador",
    descripcion:
      "Propone un borrador de respuesta al mensaje entrante del huésped de la conversación en curso. " +
      "El resultado queda en estado 'pendiente_aprobacion' (packages/domain/mensajeria, D-006) — esta " +
      "tool NUNCA envía el mensaje; solo un humano autorizado puede aprobar y enviar desde la UI/cola " +
      "de aprobación de Lote 6.",
    inputSchema: {
      type: "object",
      properties: {
        tono: { type: "string", enum: ["formal", "cercano"], description: "Tono preferido del borrador; por defecto 'cercano'." },
      },
      required: [],
      additionalProperties: false,
    },
    efecto: "propuesta_aprobacion",
    requiereLlm: true,
    rolesPermitidos: ["superadmin", "admin_gestora", "operador", "propietario"],
    // superadmin NUNCA genera contenido para huéspedes de terceros (RV18
    // §3.1) — excluido explícitamente aunque aparezca en `rolesPermitidos`
    // de otras tools; ver `matrizRoles.ts` para la excepción puntual.
    nivelesColaboradorPermitidos: ["acceso_total", "calendario_mensajeria"],
    limites: { maxLlamadasPorConversacion: 5, techoTokensSalida: 400 },
  },
  {
    nombre: "limpieza_proponer_tarea",
    descripcion:
      "Propone una tarea de limpieza/preparación para la unidad en contexto (prioridad + ventana " +
      "sugerida). Queda como propuesta pendiente de confirmación humana en el calendario operativo de " +
      "Lote 5 — esta tool nunca crea la tarea confirmada directamente.",
    inputSchema: {
      type: "object",
      properties: {
        prioridad: { type: "string", enum: ["normal", "urgente"], description: "Prioridad sugerida de la tarea." },
        notas: { type: "string", description: "Notas breves para el equipo de limpieza (sin datos de contacto)." },
      },
      required: ["prioridad"],
      additionalProperties: false,
    },
    efecto: "propuesta_aprobacion",
    requiereLlm: true,
    rolesPermitidos: ["superadmin", "admin_gestora", "operador", "propietario", "limpieza"],
    nivelesColaboradorPermitidos: ["acceso_total", "calendario_mensajeria"],
    limites: { maxLlamadasPorConversacion: 5, techoTokensSalida: 300 },
  },
  {
    nombre: "precio_sugerir_ajuste",
    descripcion:
      "Sugiere un rango de precio para la unidad en contexto sobre un horizonte de días, con " +
      "justificación en texto. NUNCA se aplica automáticamente (D-007): el anfitrión/coanfitrión con " +
      "permiso de precios debe confirmar el cambio, que se escribe con la tool determinista de precio " +
      "(`precio_aplicar_final`, packages/domain/pricing de Lote 7), no con el LLM.",
    inputSchema: {
      type: "object",
      properties: {
        horizonteDias: { type: "integer", minimum: 1, maximum: 90, description: "Días hacia adelante a considerar para la sugerencia." },
      },
      required: ["horizonteDias"],
      additionalProperties: false,
    },
    efecto: "propuesta_aprobacion",
    requiereLlm: true,
    rolesPermitidos: ["superadmin", "admin_gestora", "operador", "propietario"],
    nivelesColaboradorPermitidos: ["acceso_total"],
    limites: { maxLlamadasPorConversacion: 3, techoTokensSalida: 300 },
  },
  {
    nombre: "mantenimiento_proponer_bloqueo",
    descripcion:
      "Propone un bloqueo de mantenimiento (capa BLOQUEO_MANTENIMIENTO) para la unidad en contexto " +
      "sobre un rango de fechas, con motivo tipado. Requiere confirmación humana explícita — nunca " +
      "cierra el calendario por sí sola (D-007, RV18 §3.1: 'calendario_cerrar_disponibilidad' no la " +
      "invoca ningún agente LLM bajo ninguna condición).",
    inputSchema: {
      type: "object",
      properties: {
        fechaInicio: { type: "string", format: "date" },
        fechaFin: { type: "string", format: "date" },
        motivo: { type: "string", enum: ["plaga", "fuga_agua", "electrico", "pintura", "otro"] },
      },
      required: ["fechaInicio", "fechaFin", "motivo"],
      additionalProperties: false,
    },
    efecto: "propuesta_aprobacion",
    requiereLlm: false,
    rolesPermitidos: ["superadmin", "admin_gestora", "operador", "propietario"],
    nivelesColaboradorPermitidos: ["acceso_total", "calendario_mensajeria"],
    limites: { maxLlamadasPorConversacion: 3, techoTokensSalida: 0 },
  },
];

export function buscarToolPorNombre(nombre: string): ToolDefinicion | undefined {
  return CATALOGO_TOOLS_AGENTE.find((tool) => tool.nombre === nombre);
}

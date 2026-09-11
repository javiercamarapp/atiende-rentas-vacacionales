/**
 * Tipos base del catálogo de agentes/tools de IA (Lote 9, BACKLOG E14,
 * H-077 a H-085). Carpeta exclusiva de este lote (docs/fase2/LOTES.md).
 *
 * Principio rector (D-008, RV18 §6.2, RV19-R-17): ninguna tool declara en
 * su `inputSchema` un parámetro de tipo `tenant_id`/`propiedad_id`/
 * `huesped_id`/`reserva_id` ni ningún identificador que determine DE QUIÉN
 * son los datos que la tool toca. El modelo decide CUÁNDO invocar una
 * tool, nunca CON QUÉ datos de aislamiento — esos los resuelve el
 * `ToolContext`, construido por el SERVIDOR (apps/api) a partir de la
 * sesión autenticada + la conversación/unidad en curso, ANTES de que el
 * handler de la tool se ejecute. Ninguna función de este paquete acepta
 * `ToolContext` como argumento proveniente del modelo — solo como
 * parámetro inyectado por el ejecutor (`ejecutor.ts`).
 */

// ---------------------------------------------------------------------------
// Roles (duplicado deliberado de `apps/api/src/contrato/tipos.ts`: el
// dominio no puede depender de `apps/api` — dirección de dependencia
// inversa prohibida por el monorepo. Ambos listados DEBEN mantenerse en
// sincronía; `packages/domain/test/agentes/rolesSincronizados.test.ts` de
// Lote 9 no puede importar `apps/api` tampoco, así que la sincronía se
// vigila con una prueba de contrato en `apps/api/test` que sí puede
// importar ambos lados.)
// ---------------------------------------------------------------------------
export const ROLES_AGENTE = ["superadmin", "admin_gestora", "operador", "limpieza", "propietario", "contador"] as const;
export type RolAgente = (typeof ROLES_AGENTE)[number];

export const NIVELES_COLABORADOR_AGENTE = ["acceso_total", "calendario_mensajeria", "solo_calendario"] as const;
export type NivelColaboradorAgente = (typeof NIVELES_COLABORADOR_AGENTE)[number];

// ---------------------------------------------------------------------------
// Efecto de una tool — tres categorías, nunca mezcladas (BLUEPRINT §10,
// LOTES.md Lote 9).
// ---------------------------------------------------------------------------
export type EfectoTool =
  /** Solo consulta datos ya resueltos por `ToolContext`; no persiste nada. */
  | "lectura"
  /** Persiste una propuesta en estado `pendiente_aprobacion`/equivalente;
   * NUNCA aplica el efecto final sin que un humano apruebe explícitamente
   * (D-006, D-007). */
  | "propuesta_aprobacion"
  /** Mutación reversible ya confirmada por un humano en el mismo flujo de
   * invocación (ninguna tool del catálogo inicial usa esta categoría —
   * ver catalogo.ts — se deja tipada para extensión futura documentada,
   * ej. "pausar push automático hacia un canal", BLUEPRINT §10). */
  | "accion_reversible";

// ---------------------------------------------------------------------------
// JSON Schema minimalista para `inputSchema` — deliberadamente estrecho
// (no todo JSON Schema): fuerza `type: "object"` + `additionalProperties:
// false` en la raíz de cada tool, que es exactamente la superficie que
// H-077 verifica. Nunca se declara un identificador de negocio aquí (ver
// `patronesIdentificador.ts`).
// ---------------------------------------------------------------------------
export type TipoPropiedadSchema = "string" | "number" | "integer" | "boolean";

export interface PropiedadSchema {
  readonly type: TipoPropiedadSchema;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly format?: string;
}

export interface ObjetoInputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, PropiedadSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

// ---------------------------------------------------------------------------
// Definición de una tool del catálogo.
// ---------------------------------------------------------------------------
export interface LimitesTool {
  /** Tope de invocaciones de ESTA tool por conversación (loop-guard local,
   * H-083/REQ-149) — independiente del tope global de rondas que aplica
   * `EjecutorConversacion`. */
  readonly maxLlamadasPorConversacion: number;
  /** Estimación de tokens de salida máximos esperados — usada para
   * reservar cuota ANTES de invocar al proveedor (H-079). Tools
   * deterministas (`requiereLlm: false`) usan 0. */
  readonly techoTokensSalida: number;
}

export interface ToolDefinicion {
  /** Prefijo por dominio (`inventario_`, `mensajeria_`, `precio_`,
   * `limpieza_`, `incidencia_`, `mantenimiento_`) — namespacing de RV18
   * §6.3. */
  readonly nombre: string;
  readonly descripcion: string;
  readonly inputSchema: ObjetoInputSchema;
  readonly efecto: EfectoTool;
  /** `true` si el handler invoca un `ProveedorLLM`; `false` si es
   * puramente determinista (ej. consultar disponibilidad vía SQL). */
  readonly requiereLlm: boolean;
  readonly rolesPermitidos: readonly RolAgente[];
  /** Solo aplica cuando `rolesPermitidos` incluye `"operador"` — subconjunto
   * de niveles de colaborador permitidos; `undefined` = cualquier nivel. */
  readonly nivelesColaboradorPermitidos?: readonly NivelColaboradorAgente[];
  readonly limites: LimitesTool;
}

// ---------------------------------------------------------------------------
// `ToolContext` — inyectado por el servidor, nunca por el modelo (D-008).
// Deliberadamente contiene los identificadores que ninguna tool puede
// aceptar como argumento: viven aquí, en un objeto que el ejecutor
// construye desde la sesión/canal autenticado, no desde el JSON que arma
// el modelo.
// ---------------------------------------------------------------------------
export interface ToolContext {
  readonly tenantId: string;
  readonly unidadId: string;
  readonly propiedadId: string;
  /** `null` cuando la conversación aún no tiene huésped resuelto (ej.
   * resumen de incidencia interna sin huésped asociado). */
  readonly huespedId: string | null;
  readonly reservaId: string | null;
  readonly conversationId: string;
  readonly canal: "airbnb" | "vrbo" | "booking" | "panel";
}

/** Identidad del actor humano cuya sesión originó la invocación — nunca
 * "el modelo" como actor (RV18 §4). */
export interface ActorAgente {
  readonly usuarioId: string;
  readonly rol: RolAgente;
  readonly colaboradorNivel: NivelColaboradorAgente | null;
}

// ---------------------------------------------------------------------------
// Contenido no confiable (RV19-R-16): todo texto de huésped que llegue a
// un agente LLM se envuelve en este tipo — nunca se concatena como
// instrucción de sistema. `EjecutorTools`/`ProveedorLLM` solo aceptan
// texto de huésped a través de este tipo, documentando en el propio
// sistema de tipos que es DATO, no INSTRUCCIÓN.
// ---------------------------------------------------------------------------
export interface ContenidoNoConfiable {
  readonly origen: "mensaje_huesped";
  readonly texto: string;
}

// ---------------------------------------------------------------------------
// Resultado de una invocación de tool. Dos familias:
// - "ok": la tool se ejecutó (produjo una propuesta o una lectura); puede
//   llevar además una marca de escalamiento "blando" (RV18 §5, puntos
//   1-3): el contenido SÍ se genera, pero queda señalado con prioridad
//   alta para revisión humana — nunca se descarta ni se envía solo.
// - "presupuesto_agotado" / "bloqueado": la tool NO se ejecutó en absoluto
//   — ningún proveedor LLM llegó a invocarse (`presupuesto_agotado`) o el
//   intento de invocación se rechazó estructuralmente antes de tocar
//   ningún handler (`bloqueado`: tool fuera de catálogo, no autorizada
//   para el rol/nivel del actor, o tope de rondas alcanzado — RV18 §5,
//   punto 4 y RV18-R-10).
// ---------------------------------------------------------------------------
export type ResultadoInvocacionTool =
  | {
      readonly tipo: "ok";
      readonly salida: unknown;
      readonly necesitaEscalamiento: boolean;
      readonly motivoEscalamiento: MotivoEscalamientoBlando | null;
    }
  | { readonly tipo: "presupuesto_agotado"; readonly mensaje: string }
  | { readonly tipo: "bloqueado"; readonly motivo: MotivoEscalamientoDuro; readonly mensaje: string };

/** Motivos que NO impiden generar la propuesta, solo la marcan para
 * revisión humana prioritaria (RV18 §5, puntos 1-3). */
export type MotivoEscalamientoBlando = "ambiguedad_dato_faltante" | "escalada_emocional" | "monto_alto";

/** Motivos que impiden la ejecución por completo — "no existe la tool" o
 * "no autorizada", nunca "requiere aprobación" (RV18 §5, punto 4). */
export type MotivoEscalamientoDuro =
  | "fuera_de_catalogo"
  | "tool_no_autorizada_para_rol"
  | "tope_rondas_excedido"
  /** El texto generado confirmaba una acción (descuento/cancelación/
   * reembolso) como si ya estuviera aplicada, sin verificación humana —
   * bloqueado a nivel de CONTENIDO aunque ninguna tool fuera de catálogo
   * se haya invocado (RV18 §7.2/§7.3: "grade what the agent produced",
   * un resultado sin tool fuera de alcance puede igual esconder un
   * comportamiento de fallo si el TEXTO promete algo que el sistema no
   * puede cumplir). */
  | "confirmacion_no_verificada"
  /** Patrón 4 (rescatado de Likida/atiende.ai, ver verificacionHechos.ts):
   * el texto de `mensajeria_proponer_borrador` citó un monto o una fecha
   * que no coincide con ningún valor real conocido en `contextoResumen`
   * — guardia anti-alucinación en capas, independiente de
   * `confirmacion_no_verificada` (esa detecta una acción declarada como
   * ya aplicada; esta detecta un HECHO citado sin fuente verificada). */
  | "cita_no_verificada";

export type MotivoEscalamiento = MotivoEscalamientoBlando | MotivoEscalamientoDuro;

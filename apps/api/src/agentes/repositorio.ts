import type { PoolClient } from "pg";
import type { RegistroTrazaToolCall } from "@atiende-rv/domain/agentes";

/**
 * Persistencia de Lote 9 (BACKLOG E14, H-079/H-080): lee/escribe
 * `agente_cuota_tenant` y `agente_tool_call_log` (migraciones 0070-0072).
 * Separado de `servicio.ts` (que orquesta `EjecutorTools` en memoria) para
 * que la lógica SQL sea testeable/legible por sí sola.
 */

export interface FilaCuotaTenant {
  readonly tenantId: string;
  readonly techoTokensPeriodo: number;
  readonly techoLlamadasPeriodo: number;
  readonly tokensLiquidadosPeriodo: number;
  readonly llamadasLiquidadasPeriodo: number;
  readonly periodoIniciaEn: string;
}

export async function obtenerCuotaTenant(cliente: PoolClient, tenantId: string): Promise<FilaCuotaTenant | null> {
  const { rows } = await cliente.query<{
    tenant_id: string;
    techo_tokens_periodo: string;
    techo_llamadas_periodo: number;
    tokens_liquidados_periodo: string;
    llamadas_liquidadas_periodo: number;
    periodo_inicia_en: string;
  }>(
    `SELECT tenant_id, techo_tokens_periodo, techo_llamadas_periodo, tokens_liquidados_periodo, llamadas_liquidadas_periodo, periodo_inicia_en
     FROM agente_cuota_tenant WHERE tenant_id = $1`,
    [tenantId],
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    tenantId: fila.tenant_id,
    techoTokensPeriodo: Number(fila.techo_tokens_periodo),
    techoLlamadasPeriodo: fila.techo_llamadas_periodo,
    tokensLiquidadosPeriodo: Number(fila.tokens_liquidados_periodo),
    llamadasLiquidadasPeriodo: fila.llamadas_liquidadas_periodo,
    periodoIniciaEn: fila.periodo_inicia_en,
  };
}

/** Liquida en BD el delta real de una ronda ya ejecutada en memoria
 * (H-079: "al terminar la llamada se liquida el costo real"). Nunca
 * recibe el costo estimado de la reserva, solo lo realmente gastado. */
export async function liquidarCuotaTenant(
  cliente: PoolClient,
  tenantId: string,
  deltaTokens: number,
  deltaLlamadas: number,
): Promise<void> {
  await cliente.query(
    `UPDATE agente_cuota_tenant
     SET tokens_liquidados_periodo = tokens_liquidados_periodo + $2,
         llamadas_liquidadas_periodo = llamadas_liquidadas_periodo + $3,
         actualizado_en = now()
     WHERE tenant_id = $1`,
    [tenantId, deltaTokens, deltaLlamadas],
  );
}

export async function insertarTrazaToolCall(cliente: PoolClient, traza: RegistroTrazaToolCall): Promise<void> {
  await cliente.query(
    `INSERT INTO agente_tool_call_log
       (tenant_id, actor_id, rol_actor, conversation_id, canal, tool_nombre, argumentos_no_sensibles, resultado, duracion_ms, modelo_real, costo_usd_real, inicio_en, fin_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)`,
    [
      traza.tenantId,
      traza.actorId,
      traza.rolActor,
      traza.conversationId,
      traza.canal,
      traza.toolNombre,
      JSON.stringify(traza.argumentosNoSensibles),
      traza.resultado,
      traza.duracionMs,
      traza.modeloReal,
      traza.costoUsdReal,
      traza.inicioEn,
      traza.finEn,
    ],
  );
}

export interface FilaTrazaToolCall {
  readonly id: string;
  readonly actorId: string;
  readonly rolActor: string;
  readonly conversationId: string;
  readonly canal: string;
  readonly toolNombre: string;
  readonly resultado: string;
  readonly duracionMs: number;
  readonly modeloReal: string | null;
  readonly costoUsdReal: number;
  readonly creadoEn: string;
}

export async function listarTrazasTenant(
  cliente: PoolClient,
  tenantId: string,
  opciones: { pagina: number; tamano: number },
): Promise<FilaTrazaToolCall[]> {
  const offset = (opciones.pagina - 1) * opciones.tamano;
  const { rows } = await cliente.query<{
    id: string;
    actor_id: string;
    rol_actor: string;
    conversation_id: string;
    canal: string;
    tool_nombre: string;
    resultado: string;
    duracion_ms: number;
    modelo_real: string | null;
    costo_usd_real: string;
    creado_en: string;
  }>(
    `SELECT id, actor_id, rol_actor, conversation_id, canal, tool_nombre, resultado, duracion_ms, modelo_real, costo_usd_real, creado_en
     FROM agente_tool_call_log WHERE tenant_id = $1
     ORDER BY creado_en DESC LIMIT $2 OFFSET $3`,
    [tenantId, opciones.tamano, offset],
  );
  return rows.map((fila) => ({
    id: fila.id,
    actorId: fila.actor_id,
    rolActor: fila.rol_actor,
    conversationId: fila.conversation_id,
    canal: fila.canal,
    toolNombre: fila.tool_nombre,
    resultado: fila.resultado,
    duracionMs: fila.duracion_ms,
    modeloReal: fila.modelo_real,
    costoUsdReal: Number(fila.costo_usd_real),
    creadoEn: fila.creado_en,
  }));
}

export interface FilaUnidadContexto {
  readonly unidadId: string;
  readonly propiedadId: string;
  readonly tenantId: string;
}

/** Resuelve `unidadId` → `{propiedadId, tenantId}` a través de RLS (la
 * consulta corre en la sesión ya fijada por `conSesion`, así que un
 * `unidadId` de otro tenant simplemente no aparece — nunca un 403
 * distinguible de un 404, mismo patrón que el resto de `apps/api`). */
export async function resolverContextoUnidad(cliente: PoolClient, unidadId: string): Promise<FilaUnidadContexto | null> {
  const { rows } = await cliente.query<{ unidad_id: string; propiedad_id: string; tenant_id: string }>(
    `SELECT u.id AS unidad_id, u.propiedad_id, p.tenant_id
     FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id
     WHERE u.id = $1`,
    [unidadId],
  );
  const fila = rows[0];
  if (!fila) return null;
  return { unidadId: fila.unidad_id, propiedadId: fila.propiedad_id, tenantId: fila.tenant_id };
}

/** Handler determinista de `inventario_consultar_disponibilidad` (H-077,
 * D-007): SIEMPRE una consulta SQL directa contra `ocupacion_unidad`
 * (Lote 1) — ningún LLM participa en esta decisión, ni siquiera como paso
 * intermedio validado después. */
export async function consultarDisponibilidadUnidad(
  cliente: PoolClient,
  unidadId: string,
  fechaInicio: string,
  fechaFin: string,
): Promise<{ disponible: boolean }> {
  const { rows } = await cliente.query<{ ocupado: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM ocupacion_unidad
       WHERE unidad_id = $1 AND bloqueante = true AND estado = 'confirmado'
         AND rango && daterange($2::date, $3::date, '[)')
     ) AS ocupado`,
    [unidadId, fechaInicio, fechaFin],
  );
  return { disponible: !(rows[0]?.ocupado ?? false) };
}

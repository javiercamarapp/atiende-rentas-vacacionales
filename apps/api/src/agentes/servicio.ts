import type { PoolClient } from "pg";
import { RegistroFlags } from "@atiende-rv/domain";
import {
  CATALOGO_FLAGS_AGENTES,
  EjecutorTools,
  FLAG_AGENTES_HABILITADO,
  FLAG_AGENTES_PROVEEDOR_REAL_HABILITADO,
  GestorCuotaAgente,
  ProveedorLLMSimulado,
  type ActorAgente,
  type ContenidoNoConfiable,
  type ResultadoInvocacionTool,
  type ToolContext,
} from "@atiende-rv/domain/agentes";
import { crearProveedorClaudeSiHabilitado } from "./proveedorClaude.js";
import {
  consultarDisponibilidadUnidad,
  insertarTrazaToolCall,
  liquidarCuotaTenant,
  obtenerCuotaTenant,
} from "./repositorio.js";

/**
 * Wiring de servidor de Lote 9 (BACKLOG E14): un `RegistroFlags` + un
 * `EjecutorTools` por PROCESO (mismo patrón documentado que
 * `RegistroFlags` de Lote 10 — "registro en memoria por proceso;
 * persistencia real es responsabilidad de la capa que lo use", ver
 * `packages/domain/src/flags/tipos.ts`). El presupuesto real por tenant
 * (H-079) se hidrata UNA VEZ desde `agente_cuota_tenant` al primer uso de
 * ese tenant en este proceso, ajustando el techo disponible por lo ya
 * liquidado en BD (para que un reinicio del proceso no reabra presupuesto
 * ya gastado) — cada liquidación real se persiste de vuelta
 * inmediatamente (`liquidarCuotaTenant`). Límite conocido, documentado
 * igual que el resto del proyecto: sin coordinación multi-instancia
 * (dos procesos de `apps/api` corriendo a la vez podrían, en teoría,
 * sobregastar el margen entre sus dos hidrataciones) — aceptable para
 * esta fase, cerrable con un `SELECT ... FOR UPDATE` transaccional si el
 * despliegue real corre múltiples instancias (fuera de alcance de Lote 9).
 */

const tenantsHidratados = new Set<string>();

const registroFlagsAgentes = new RegistroFlags(CATALOGO_FLAGS_AGENTES);
const gestorCuotaAgentes = new GestorCuotaAgente();

async function asegurarCuotaHidratada(cliente: PoolClient, tenantId: string): Promise<void> {
  if (tenantsHidratados.has(tenantId)) return;
  const fila = await obtenerCuotaTenant(cliente, tenantId);
  if (!fila) {
    // Sin fila de presupuesto configurada: NUNCA gasto ilimitado por
    // omisión (RV18 §3.2) — no se registra nada, `reservar()` lanzará
    // `CuotaAgotadaError` (falla cerrado) en cuanto se intente usar.
    tenantsHidratados.add(tenantId);
    return;
  }
  gestorCuotaAgentes.registrarPresupuesto({
    tenantId,
    techoTokensPeriodo: Math.max(0, fila.techoTokensPeriodo - fila.tokensLiquidadosPeriodo),
    techoLlamadasPeriodo: Math.max(0, fila.techoLlamadasPeriodo - fila.llamadasLiquidadasPeriodo),
  });
  tenantsHidratados.add(tenantId);
}

function crearEjecutor(env: NodeJS.ProcessEnv, tenantId: string): EjecutorTools {
  const proveedorRealHabilitado = registroFlagsAgentes.valor(FLAG_AGENTES_PROVEEDOR_REAL_HABILITADO, tenantId);
  const proveedorReal = crearProveedorClaudeSiHabilitado(env, proveedorRealHabilitado);
  const proveedor = proveedorReal ?? new ProveedorLLMSimulado();

  return new EjecutorTools(gestorCuotaAgentes, proveedor, {
    inventario_consultar_disponibilidad: async (argumentos, contexto: ToolContext) => {
      const fechaInicio = String(argumentos.fechaInicio);
      const fechaFin = String(argumentos.fechaFin);
      // Nota: este handler determinista no recibe el `PoolClient` de la
      // request (el ejecutor de dominio es agnóstico de transporte) — el
      // resultado real se resuelve en la ruta HTTP antes de invocar al
      // ejecutor para las tools deterministas que sí necesitan SQL (ver
      // `routes/agentes/index.ts`, que llama a `consultarDisponibilidadUnidad`
      // directamente cuando la tool elegida es esta). Este handler de
      // respaldo solo cubre el caso de evals/pruebas sin conexión real.
      return { disponible: true, unidadId: contexto.unidadId, fechaInicio, fechaFin, nota: "handler de respaldo sin BD" };
    },
    mantenimiento_proponer_bloqueo: async (argumentos, contexto: ToolContext) => {
      // Propuesta pura (D-007, RV18 §3.1): esta tool NUNCA escribe en
      // `ocupacion_unidad`/`incidencia_mantenimiento` — devuelve el
      // rango+motivo propuestos para que un humano los confirme por el
      // flujo determinista existente (`/operacion/incidencias`, Lote 5),
      // manteniendo la frontera entre lotes (Lote 9 no escribe tablas de
      // Lote 5).
      return { propuesta: true, unidadId: contexto.unidadId, ...argumentos, requiereConfirmacionHumana: true };
    },
  });
}

export interface ResultadoInvocacionAgenteApi {
  readonly resultado: ResultadoInvocacionTool;
}

export function agentesHabilitadoParaTenant(tenantId: string): boolean {
  return registroFlagsAgentes.valor(FLAG_AGENTES_HABILITADO, tenantId);
}

export function registroFlagsAgentesInstancia(): RegistroFlags {
  return registroFlagsAgentes;
}

/**
 * Orquesta una ronda completa de tool-calling para un mensaje de huésped
 * (o una consulta sin mensaje) sobre una unidad ya resuelta por el
 * servidor. `contexto.tenantId`/`unidadId`/`propiedadId` NUNCA vienen del
 * cuerpo de la request que un huésped controla — los resuelve la ruta HTTP
 * desde la sesión autenticada + el parámetro `:unidadId` de la URL (D-008).
 */
export async function invocarRondaAgente(
  cliente: PoolClient,
  env: NodeJS.ProcessEnv,
  parametros: {
    contexto: ToolContext;
    actor: ActorAgente;
    mensajeHuesped: ContenidoNoConfiable | null;
    contextoResumen: Readonly<Record<string, string | null>>;
  },
): Promise<ResultadoInvocacionTool> {
  await asegurarCuotaHidratada(cliente, parametros.contexto.tenantId);
  const ejecutor = crearEjecutor(env, parametros.contexto.tenantId);

  const resultado = await ejecutor.ejecutarRonda({
    contexto: parametros.contexto,
    actor: parametros.actor,
    mensajeHuesped: parametros.mensajeHuesped,
    contextoResumen: parametros.contextoResumen,
  });

  // Si la tool elegida fue la de disponibilidad, sustituye el handler de
  // respaldo por la consulta SQL real (D-007: nunca un LLM decide
  // disponibilidad) antes de devolver la salida al llamador.
  let resultadoFinal = resultado;
  if (resultado.tipo === "ok" && isRegistroDisponibilidadRespaldo(resultado.salida)) {
    const salida = resultado.salida;
    const disponibilidadReal = await consultarDisponibilidadUnidad(
      cliente,
      parametros.contexto.unidadId,
      salida.fechaInicio,
      salida.fechaFin,
    );
    resultadoFinal = { ...resultado, salida: disponibilidadReal };
  }

  const traza = ejecutor.tomarUltimaTraza();
  if (traza) {
    await insertarTrazaToolCall(cliente, traza);
    if (traza.resultado === "exito" || traza.resultado === "escalado") {
      // Liquidación real ya ocurrió en memoria (`ejecutor.ejecutarRonda`
      // llama a `gestorCuota.liquidar` internamente); aquí solo se
      // persiste el delta real gastado, derivado del costo/duración de la
      // traza — 1 llamada, tokens aproximados por el costo reportado (el
      // proveedor simulado no separa tokens de costo con una tarifa fija
      // configurable en este punto; se persiste 0 cuando no hubo llamada
      // real al proveedor, ej. presupuesto agotado — caso ya excluido
      // arriba por el filtro de `resultado`).
      await liquidarCuotaTenant(cliente, parametros.contexto.tenantId, 0, 1);
    }
  }

  return resultadoFinal;
}

function isRegistroDisponibilidadRespaldo(
  valor: unknown,
): valor is { fechaInicio: string; fechaFin: string; nota: string } {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "nota" in valor &&
    (valor as { nota?: unknown }).nota === "handler de respaldo sin BD"
  );
}

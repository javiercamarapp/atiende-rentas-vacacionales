import type pg from "pg";
import type { Migracion } from "./tipos.js";
import { migraciones as catalogoMigracionesPorDefecto } from "../migrations/index.js";
import {
  obtenerPoolServerlessCompartido,
  type EntornoConexionDb,
} from "./conexionServerless.js";

/**
 * D-DSD-15 (Lote 3.3, Supabase): chequeo de salud REAL de `DATABASE_URL`
 * para `GET /health` (`apps/api/src/app.ts`) — reemplaza el chequeo
 * puramente sintáctico anterior (`config.databaseUrl ? "configurada" :
 * "sin_configurar"`, que reportaba "configurada" aunque la URL apuntara a
 * un host inexistente o con credenciales rotas) por uno honesto: sin URL
 * -> "sin_configurar" (sin abrir ninguna conexión); con URL -> un
 * `SELECT 1` real con timeout corto -> "ok" o "error".
 *
 * Deliberadamente NO usa `GET /health/detallado`
 * (`apps/api/src/workers/observabilidad/rutas.ts`, fuera del alcance
 * mutable de este paquete de trabajo) — ese endpoint ya hace su propio
 * chequeo de conexión (vía `contarPendientesOutbox`) pero sin timeout
 * explícito y sin contrato de "motivo corto sin credenciales"; este
 * módulo es independiente y pensado específicamente para el campo
 * `baseDeDatos` de `GET /health`.
 */
export type EstadoSaludBaseDeDatos = "sin_configurar" | "ok" | "error";

export interface ResultadoSaludBaseDeDatos {
  estado: EstadoSaludBaseDeDatos;
  /** Motivo CORTO y clasificado — nunca el mensaje crudo de `pg`/Node (que
   * en errores de DNS o autenticación puede citar el host o el usuario de
   * la cadena de conexión) ni, por supuesto, la cadena de conexión en sí
   * (que sí lleva la contraseña). Solo presente si `estado === "error"`. */
  motivo?: string;
  /** Cuenta barata (una sola consulta adicional, solo tras un `SELECT 1`
   * ya exitoso) de migraciones del catálogo en memoria que todavía no
   * figuran en `schema_migrations` de este ambiente. `undefined` si no se
   * pudo calcular barato (p. ej. la tabla todavía no existe en un
   * ambiente recién aprovisionado) — nunca degrada `estado` a "error" por
   * esto: el `SELECT 1` ya confirmó que la base de datos en sí responde. */
  migracionesPendientes?: number;
}

const TIMEOUT_MS_POR_DEFECTO = 2_000;
const MENSAJE_TIMEOUT = "__timeout_salud_db__";

/** Corre `promesa` con un límite de tiempo duro: si no resuelve/rechaza
 * dentro de `ms`, esta función rechaza igual (con un marcador interno
 * reconocible), SIN cancelar la promesa original (Node/`pg` no ofrecen
 * cancelación real de una query en curso) — pero la respuesta de
 * `verificarSaludBaseDeDatos` ya no espera por ella, que es la garantía
 * que pide el contrato de `GET /health` (responder en ≤2s). */
function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error(MENSAJE_TIMEOUT)), ms);
    promesa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (error) => {
        clearTimeout(temporizador);
        reject(error);
      },
    );
  });
}

/** Clasifica un error de conexión/consulta a un motivo corto — nunca eco
 * del mensaje crudo de `pg`/Node. Los códigos vienen de `libpq`/Node
 * (`ENOTFOUND`/`ECONNREFUSED`/`ETIMEDOUT`) o de SQLSTATE de Postgres
 * (`28P01` autenticación, `3D000` base de datos inexistente). Cualquier
 * código no reconocido se reporta como "error de conexión (<código>)" —
 * el código en sí no es sensible (nunca incluye host/usuario/contraseña),
 * solo una categoría estándar de `pg`/POSIX. */
function motivoCortoDesdeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.message === MENSAJE_TIMEOUT) {
    return `timeout tras ${timeoutMs}ms`;
  }
  const codigo = (error as { code?: string } | undefined)?.code;
  switch (codigo) {
    case "ENOTFOUND":
      return "host no resuelve (DNS)";
    case "ECONNREFUSED":
      return "conexión rechazada";
    case "ETIMEDOUT":
      return "timeout de red";
    case "28P01":
      return "credenciales inválidas";
    case "3D000":
      return "base de datos inexistente";
    case "ENETUNREACH":
      return "red inalcanzable";
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return "certificado TLS no confiable";
    default:
      return codigo ? `error de conexión (${codigo})` : "error de conexión";
  }
}

export interface OpcionesVerificarSaludBaseDeDatos {
  env?: EntornoConexionDb;
  /** Límite duro de tiempo total (SELECT 1 + conteo de pendientes),
   * ≤2000ms por contrato de `GET /health`. Configurable solo para
   * pruebas (poder simular un timeout sin esperar 2s reales). */
  timeoutMs?: number;
  catalogoMigraciones?: Migracion[];
  /** Inyectable en pruebas — evita depender del caché de módulo real de
   * `obtenerPoolServerlessCompartido` (que abriría un `pg.Pool` real). */
  obtenerPool?: (databaseUrl: string, env: EntornoConexionDb) => Pick<pg.Pool, "query">;
}

export async function verificarSaludBaseDeDatos(
  databaseUrl: string,
  opciones: OpcionesVerificarSaludBaseDeDatos = {},
): Promise<ResultadoSaludBaseDeDatos> {
  if (!databaseUrl) return { estado: "sin_configurar" };

  const env = opciones.env ?? (process.env as EntornoConexionDb);
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS_POR_DEFECTO;
  const obtenerPool = opciones.obtenerPool ?? obtenerPoolServerlessCompartido;
  const pool = obtenerPool(databaseUrl, env);

  try {
    await conTimeout(pool.query("SELECT 1"), timeoutMs);
  } catch (error) {
    return { estado: "error", motivo: motivoCortoDesdeError(error, timeoutMs) };
  }

  const catalogo = opciones.catalogoMigraciones ?? catalogoMigracionesPorDefecto;
  let migracionesPendientes: number | undefined;
  try {
    const resultado = await conTimeout(
      pool.query<{ id: string }>("SELECT id FROM schema_migrations"),
      timeoutMs,
    );
    const idsAplicados = new Set(resultado.rows.map((fila) => fila.id));
    migracionesPendientes = catalogo.filter((migracion) => !idsAplicados.has(migracion.id)).length;
  } catch {
    // `schema_migrations` todavía no existe (ambiente recién aprovisionado
    // antes de correr `scripts/db-migrate-prod.mjs`) u otro error en esta
    // consulta secundaria — nunca degrada el "ok" ya confirmado arriba;
    // el dato simplemente queda ausente.
    migracionesPendientes = undefined;
  }

  return { estado: "ok", migracionesPendientes };
}

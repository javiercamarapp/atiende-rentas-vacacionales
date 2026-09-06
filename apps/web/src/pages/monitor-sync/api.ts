import type { ConflictoContrato, CuentaCanalContrato } from "@atiende-rv/api/contrato";
import { peticion } from "../../lib/api/cliente";

export function listarCuentasCanal(): Promise<{ cuentas: CuentaCanalContrato[] }> {
  return peticion("/canales");
}

export function sincronizarAhora(cuentaCanalId: string): Promise<{ encolado: boolean }> {
  return peticion(`/canales/${cuentaCanalId}/sync`, { metodo: "POST" });
}

export function listarConflictos(resuelto: boolean): Promise<{ conflictos: ConflictoContrato[] }> {
  return peticion("/conflictos", { query: { resuelto: resuelto ? "true" : undefined } });
}

// ---------------------------------------------------------------------------
// Alertas (Auditoría 2, P-02): la API expone las filas de la tabla `alerta`
// (packages/db/src/migrations/0081_alerta.ts) tal cual — snake_case, sin
// transformar a camelCase como el resto del contrato — porque
// `apps/api/src/workers/observabilidad/rutas.ts` las sirve directo desde
// `ejecutor.query` sin una capa de serialización dedicada (a diferencia de
// `finanzas.ts`/`pricing.ts`). Se documenta aquí en vez de "arreglarlo"
// silenciosamente para no ampliar el alcance de esta corrección (P-02 es
// "no existe la página", no "el shape de la respuesta es inconsistente").
// ---------------------------------------------------------------------------

export type TipoAlerta =
  | "sync_sin_exito"
  | "feed_en_cuarentena"
  | "conflicto_pendiente"
  | "outbox_atascada"
  | "drift"
  | "token_canal_revocado";

export type SeveridadAlerta = "baja" | "media" | "alta";
export type EstadoAlerta = "activa" | "reconocida" | "resuelta";

export interface AlertaBackend {
  id: string;
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  canal_id: string | null;
  unidad_id: string | null;
  mensaje: string;
  metadata: unknown;
  accion_reversible: string | null;
  estado: EstadoAlerta;
  creado_en: string;
  reconocida_por: string | null;
  reconocida_en: string | null;
  resuelta_en: string | null;
}

export function listarAlertas(estado?: EstadoAlerta): Promise<{ alertas: AlertaBackend[] }> {
  return peticion("/alertas", { query: { estado } });
}

export function reconocerAlertaApi(id: string): Promise<{ ok: boolean }> {
  return peticion(`/alertas/${id}/ack`, { metodo: "POST" });
}

export function resolverAlertaApi(id: string): Promise<{ ok: boolean }> {
  return peticion(`/alertas/${id}/resolver`, { metodo: "POST" });
}

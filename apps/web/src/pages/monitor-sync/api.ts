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

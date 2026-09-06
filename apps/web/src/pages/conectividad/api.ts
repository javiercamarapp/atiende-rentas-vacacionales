import type { CuentaCanalContrato, CuerpoCrearCuentaCanal } from "@atiende-rv/api/contrato";
import { peticion } from "../../lib/api/cliente";

export function listarCuentasCanal(): Promise<{ cuentas: CuentaCanalContrato[] }> {
  return peticion("/canales");
}

export function crearCuentaCanal(cuerpo: CuerpoCrearCuentaCanal): Promise<{ id: string }> {
  return peticion("/canales/cuentas", { metodo: "POST", cuerpo });
}

export function sincronizarAhora(cuentaCanalId: string): Promise<{ encolado: boolean }> {
  return peticion(`/canales/${cuentaCanalId}/sync`, { metodo: "POST" });
}

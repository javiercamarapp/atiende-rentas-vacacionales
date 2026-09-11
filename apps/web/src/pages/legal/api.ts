// Llamadas de API de la bandeja de solicitudes ARCO/RGPD (REQ-151). Mismo
// patrón que apps/web/src/pages/finanzas/api.ts: cliente HTTP compartido +
// tipos ya publicados en @atiende-rv/api/contrato (apps/api/src/contrato/
// tipos.ts) para no duplicar los enums de tipoDerecho/jurisdicción/estado.
import type {
  CuerpoActualizarSolicitudArco,
  CuerpoCrearSolicitudArco,
  RespuestaSolicitudesArcoPaginada,
  SolicitudArcoContrato,
} from "@atiende-rv/api/contrato";
import { peticion } from "../../lib/api/cliente";

export type { CuerpoActualizarSolicitudArco, CuerpoCrearSolicitudArco, SolicitudArcoContrato };

export interface UsuarioBasico {
  id: string;
  email: string;
}

// Sin endpoint dedicado de "usuarios básicos" (mismo criterio que
// `listarUnidadesBasico` en finanzas/api.ts): reutiliza GET /usuarios
// (endpoint de Lote 3, ROLES_ADMIN, mismo nivel que esta bandeja) solo
// para poblar el selector de responsable.
export function listarUsuariosBasico(): Promise<{ usuarios: UsuarioBasico[] }> {
  return peticion("/usuarios");
}

export function listarSolicitudesArco(
  estado?: SolicitudArcoContrato["estado"],
): Promise<RespuestaSolicitudesArcoPaginada> {
  return peticion("/solicitudes-arco", { query: { estado, tamano: 100 } });
}

export function crearSolicitudArco(cuerpo: CuerpoCrearSolicitudArco): Promise<SolicitudArcoContrato> {
  return peticion("/solicitudes-arco", { metodo: "POST", cuerpo });
}

export function actualizarSolicitudArco(
  id: string,
  cuerpo: CuerpoActualizarSolicitudArco,
): Promise<SolicitudArcoContrato> {
  return peticion(`/solicitudes-arco/${id}`, { metodo: "PATCH", cuerpo });
}

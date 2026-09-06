// Llamadas de API del back office / superadmin (Lote 8, BACKLOG E13 +
// E02 H-011/H-012). Tipos importados desde el contrato compartido
// (`@atiende-rv/api/contrato`) — nunca redefinidos a mano aquí.
import type {
  CuerpoActualizarPropiedadBackoffice,
  CuerpoCrearAccesoRomperCristal,
  CuerpoCrearCuentaCanalBackoffice,
  CuerpoCrearInvitacion,
  CuerpoCrearPropiedadBackoffice,
  CuerpoCrearTenantBackoffice,
  CuerpoCrearUnidadBackoffice,
  CuerpoEstablecerFlag,
  CuerpoSuspenderTenant,
} from "@atiende-rv/api/contrato";
import { peticion } from "../../lib/api/cliente";

export interface MetricasTenant {
  unidadesTotal: number;
  cuentasCanalTotal: number;
  cuentasCanalConfiguradas: number;
  cuentasCanalSimulador: number;
  alertasAbiertas: number;
  outboxPendiente: number;
}

export interface TenantDirectorio {
  id: string;
  nombre: string;
  tipo: string;
  estado: "activo" | "suspendido";
  suspendidoMotivo: string | null;
  creadoEn: string;
  metricas: MetricasTenant;
}

export interface AccesoRomperCristal {
  id: string;
  tenantId: string;
  motivo: string;
  alcance: string;
  creadoEn: string;
  expiraEn: string;
  revocadoEn: string | null;
}

export interface Flag {
  id: string;
  descripcion: string;
  categoriaRiesgo: string;
  valorGlobal: boolean;
  valorEfectivo: boolean;
  overrideDeTenant: boolean;
}

export interface PropiedadBackoffice {
  id: string;
  tenantId: string;
  nombre: string;
  zonaHoraria: string;
  moneda: string | null;
  direccion: { linea1: string | null; ciudad: string | null; pais: string | null } | null;
}

export interface UnidadBackoffice {
  id: string;
  propiedadId: string;
  ownerId: string | null;
  nombre: string;
  duracionMinimaNoches: number;
}

export interface CuentaCanalBackoffice {
  id: string;
  canalCodigo: string;
  nombre: string;
  tipoConexion: "ical" | "partner_pendiente" | "simulador" | null;
  estadoConexion: string;
  credencialesConfiguradas: boolean;
  motivoPartnerPendiente: string | null;
  esSimulador: boolean;
}

export interface UsuarioTenant {
  id: string;
  email: string;
  rol: string;
  colaboradorNivel: string | null;
  activo: boolean;
}

export interface InvitacionUsuario {
  id: string;
  email: string;
  rol: string;
  colaboradorNivel: string | null;
  creadoEn: string;
  expiraEn: string;
  aceptadaEn: string | null;
  revocadaEn: string | null;
  token?: string;
}

export interface EntradaAuditoria {
  id: string;
  tabla: string;
  filaId: string;
  operacion: string;
  actorId: string | null;
  creadoEn: string;
  valoresPrevios: unknown;
  valoresNuevos: unknown;
}

// --- Tenants / superadmin -------------------------------------------------

export function listarTenants(): Promise<{ tenants: TenantDirectorio[] }> {
  return peticion("/backoffice/tenants");
}

export function crearTenant(cuerpo: CuerpoCrearTenantBackoffice): Promise<{ id: string }> {
  return peticion("/backoffice/tenants", { metodo: "POST", cuerpo });
}

export function suspenderTenant(id: string, cuerpo: CuerpoSuspenderTenant): Promise<{ id: string; estado: string }> {
  return peticion(`/backoffice/tenants/${id}/suspender`, { metodo: "POST", cuerpo });
}

export function activarTenant(id: string): Promise<{ id: string; estado: string }> {
  return peticion(`/backoffice/tenants/${id}/activar`, { metodo: "POST", cuerpo: {} });
}

// --- Romper cristal --------------------------------------------------------

export function listarAccesosRomperCristal(): Promise<{ accesos: AccesoRomperCristal[] }> {
  return peticion("/backoffice/romper-cristal");
}

export function crearAccesoRomperCristal(
  cuerpo: CuerpoCrearAccesoRomperCristal,
): Promise<{ id: string; tenantId: string; motivo: string; expiraEn: string }> {
  return peticion("/backoffice/romper-cristal", { metodo: "POST", cuerpo });
}

export function revocarAccesoRomperCristal(id: string): Promise<{ id: string; revocado: boolean }> {
  return peticion(`/backoffice/romper-cristal/${id}/revocar`, { metodo: "POST", cuerpo: {} });
}

// --- Feature flags -----------------------------------------------------

export function listarFlags(tenantId?: string): Promise<{ flags: Flag[] }> {
  return peticion("/backoffice/flags", { query: { tenantId } });
}

export function establecerFlag(
  id: string,
  cuerpo: CuerpoEstablecerFlag,
): Promise<{ ok: true; flagId: string; valor: boolean; tenantId: string | null }> {
  return peticion(`/backoffice/flags/${id}`, { metodo: "PATCH", cuerpo });
}

// --- Propiedades / unidades ----------------------------------------------

export function listarPropiedades(tenantId?: string): Promise<{ propiedades: PropiedadBackoffice[] }> {
  return peticion("/backoffice/propiedades", { query: { tenantId } });
}

export function crearPropiedad(cuerpo: CuerpoCrearPropiedadBackoffice): Promise<PropiedadBackoffice> {
  return peticion("/backoffice/propiedades", { metodo: "POST", cuerpo });
}

export function actualizarPropiedad(
  id: string,
  cuerpo: CuerpoActualizarPropiedadBackoffice,
): Promise<PropiedadBackoffice> {
  return peticion(`/backoffice/propiedades/${id}`, { metodo: "PATCH", cuerpo });
}

export function listarUnidades(propiedadId: string): Promise<{ unidades: UnidadBackoffice[] }> {
  return peticion("/backoffice/unidades", { query: { propiedadId } });
}

export function crearUnidades(cuerpo: CuerpoCrearUnidadBackoffice): Promise<{ unidades: UnidadBackoffice[] }> {
  return peticion("/backoffice/unidades", { metodo: "POST", cuerpo });
}

export function eliminarUnidad(id: string): Promise<void> {
  return peticion(`/backoffice/unidades/${id}`, { metodo: "DELETE" });
}

// --- Cuentas de canal ------------------------------------------------------

export function listarCuentasCanal(tenantId?: string): Promise<{ cuentas: CuentaCanalBackoffice[] }> {
  return peticion("/backoffice/cuentas-canal", { query: { tenantId } });
}

export function crearCuentaCanal(cuerpo: CuerpoCrearCuentaCanalBackoffice): Promise<CuentaCanalBackoffice> {
  return peticion("/backoffice/cuentas-canal", { metodo: "POST", cuerpo });
}

// --- Usuarios / invitaciones -----------------------------------------------

export function listarUsuariosTenant(tenantId?: string): Promise<{ usuarios: UsuarioTenant[] }> {
  return peticion("/backoffice/usuarios", { query: { tenantId } });
}

export function listarInvitaciones(tenantId?: string): Promise<{ invitaciones: InvitacionUsuario[] }> {
  return peticion("/backoffice/usuarios/invitaciones", { query: { tenantId } });
}

export function crearInvitacion(cuerpo: CuerpoCrearInvitacion, tenantId?: string): Promise<InvitacionUsuario> {
  return peticion("/backoffice/usuarios/invitaciones", { metodo: "POST", cuerpo, query: { tenantId } });
}

export function revocarInvitacion(id: string): Promise<{ id: string; revocada: boolean }> {
  return peticion(`/backoffice/usuarios/invitaciones/${id}/revocar`, { metodo: "POST", cuerpo: {} });
}

// --- Auditoría filtrable ----------------------------------------------------

export interface FiltrosAuditoria {
  pagina?: number;
  tamano?: number;
  tabla?: string;
  operacion?: string;
  actorId?: string;
  desde?: string;
  hasta?: string;
}

export function listarAuditoria(
  filtros: FiltrosAuditoria,
): Promise<{ pagina: number; tamano: number; total: number; entradas: EntradaAuditoria[] }> {
  return peticion("/backoffice/auditoria", { query: { ...filtros } });
}

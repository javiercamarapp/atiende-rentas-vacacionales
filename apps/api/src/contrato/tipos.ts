import { z } from "zod";

/**
 * Contrato de API compartido (LOTES.md Lote 3: "publica el contrato de API
 * —tipos TS compartidos u OpenAPI— en su primer commit"). Esquemas `zod`
 * (fuente de verdad ejecutable, usada por el propio servidor para validar
 * requests) + los tipos TS inferidos, exportados para que Lote 4
 * (apps/web) pueda importarlos vía `@atiende-rv/api/contrato` sin esperar a
 * que cada endpoint tenga implementación completa. Ver `apps/api/openapi.yaml`
 * para la descripción human-readable del mismo contrato.
 */

// ---------------------------------------------------------------------------
// Roles y niveles de colaborador (RV12 §1, RV01/RV03 §3 reconciliados)
// ---------------------------------------------------------------------------

export const ROLES = [
  "superadmin",
  "admin_gestora",
  "operador",
  "limpieza",
  "propietario",
  "contador",
] as const;
export const RolUsuario = z.enum(ROLES);
export type RolUsuario = z.infer<typeof RolUsuario>;

export const COLABORADOR_NIVELES = ["acceso_total", "calendario_mensajeria", "solo_calendario"] as const;
export const ColaboradorNivel = z.enum(COLABORADOR_NIVELES);
export type ColaboradorNivel = z.infer<typeof ColaboradorNivel>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const CuerpoLogin = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type CuerpoLogin = z.infer<typeof CuerpoLogin>;

export const CuerpoRefresh = z.object({
  refreshToken: z.string().min(1),
});
export type CuerpoRefresh = z.infer<typeof CuerpoRefresh>;

export const UsuarioSesion = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  rol: RolUsuario,
  colaboradorNivel: ColaboradorNivel.nullable(),
});
export type UsuarioSesion = z.infer<typeof UsuarioSesion>;

export const RespuestaTokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiraEn: z.number().int().positive(),
  usuario: UsuarioSesion,
});
export type RespuestaTokens = z.infer<typeof RespuestaTokens>;

// ---------------------------------------------------------------------------
// Propiedades / unidades
// ---------------------------------------------------------------------------

export const CuerpoCrearPropiedad = z.object({
  nombre: z.string().min(1),
  zonaHoraria: z.string().min(1),
});
export type CuerpoCrearPropiedad = z.infer<typeof CuerpoCrearPropiedad>;

export const CuerpoCrearUnidad = z.object({
  propiedadId: z.string().uuid(),
  nombre: z.string().min(1),
  ownerId: z.string().uuid().optional(),
  duracionMinimaNoches: z.number().int().min(1).optional(),
});
export type CuerpoCrearUnidad = z.infer<typeof CuerpoCrearUnidad>;

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------

export const RangoFechasContrato = z
  .object({
    inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha ISO YYYY-MM-DD"),
    fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha ISO YYYY-MM-DD"),
  })
  .strict();
export type RangoFechasContrato = z.infer<typeof RangoFechasContrato>;

export const CapaContrato = z.enum(["reserva", "bloqueo"]);
export const RazonContrato = z.enum([
  "RESERVA_CANAL",
  "BLOQUEO_PROPIETARIO",
  "MANTENIMIENTO",
  "BUFFER_LIMPIEZA",
]);
export const EstadoOcupacionContrato = z.enum([
  "confirmado",
  "provisional",
  "cancelado",
  "conflicto_pendiente",
]);

/** Una noche de calendario ya resuelta: capa/razón/estado/origen dominantes
 * para esa fecha, tal como los necesita la UI (RV09-R-01, §UX-1). */
export const NocheCalendario = z.object({
  fecha: z.string(),
  ocupada: z.boolean(),
  capa: CapaContrato.nullable(),
  razon: RazonContrato.nullable(),
  estado: EstadoOcupacionContrato.nullable(),
  origenCanal: z.string().nullable(),
  esDirecta: z.boolean(),
});
export type NocheCalendario = z.infer<typeof NocheCalendario>;

export const RespuestaCalendario = z.object({
  unidadId: z.string().uuid(),
  desde: z.string(),
  hasta: z.string(),
  noches: z.array(NocheCalendario),
});
export type RespuestaCalendario = z.infer<typeof RespuestaCalendario>;

// ---------------------------------------------------------------------------
// Reservas directas (nunca cancelan/modifican reservas de canal, D-006/D-011)
// ---------------------------------------------------------------------------

export const CuerpoCrearReserva = z.object({
  unidadId: z.string().uuid(),
  rango: RangoFechasContrato,
  huespedNombre: z.string().min(1).optional(),
  huespedContacto: z.string().min(1).optional(),
});
export type CuerpoCrearReserva = z.infer<typeof CuerpoCrearReserva>;

export const CuerpoModificarReserva = z.object({
  rango: RangoFechasContrato,
});
export type CuerpoModificarReserva = z.infer<typeof CuerpoModificarReserva>;

// ---------------------------------------------------------------------------
// Bloqueos (propietario / mantenimiento / buffer)
// ---------------------------------------------------------------------------

export const RazonBloqueoContrato = z.enum(["BLOQUEO_PROPIETARIO", "MANTENIMIENTO", "BUFFER_LIMPIEZA"]);

export const CuerpoCrearBloqueo = z.object({
  unidadId: z.string().uuid(),
  rango: RangoFechasContrato,
  razon: RazonBloqueoContrato,
});
export type CuerpoCrearBloqueo = z.infer<typeof CuerpoCrearBloqueo>;

// ---------------------------------------------------------------------------
// Canales / cuentas de canal
// ---------------------------------------------------------------------------

export const EstadoConexionCanalContrato = z.enum([
  "no_conectado",
  "simulador",
  "ical",
  "partner_pendiente",
  "sandbox",
  "produccion",
]);
export type EstadoConexionCanalContrato = z.infer<typeof EstadoConexionCanalContrato>;

export const CuentaCanalContrato = z.object({
  id: z.string().uuid(),
  canalCodigo: z.string(),
  nombre: z.string(),
  estadoConexion: EstadoConexionCanalContrato,
  esSimulador: z.boolean(),
  ultimaSincronizacionExitosaEn: z.string().nullable(),
});
export type CuentaCanalContrato = z.infer<typeof CuentaCanalContrato>;

export const CuerpoCrearCuentaCanal = z.object({
  tenantId: z.string().uuid().optional(),
  propiedadId: z.string().uuid().optional(),
  canalCodigo: z.enum(["airbnb", "vrbo", "booking", "manual"]),
  nombre: z.string().min(1),
  credenciales: z.record(z.string(), z.string()).optional(),
  esSimulador: z.boolean().optional(),
});
export type CuerpoCrearCuentaCanal = z.infer<typeof CuerpoCrearCuentaCanal>;

// ---------------------------------------------------------------------------
// Conflictos
// ---------------------------------------------------------------------------

export const ConflictoContrato = z.object({
  id: z.string().uuid(),
  unidadId: z.string().uuid(),
  tipo: z.enum(["capa_cruzada", "overbooking_confirmado"]),
  detectadoEn: z.string(),
  resueltoEn: z.string().nullable(),
});
export type ConflictoContrato = z.infer<typeof ConflictoContrato>;

// ---------------------------------------------------------------------------
// Auditoría (paginada, admin-only)
// ---------------------------------------------------------------------------

export const EntradaAuditoriaContrato = z.object({
  id: z.string().uuid(),
  tabla: z.string(),
  filaId: z.string().uuid(),
  operacion: z.enum(["INSERT", "UPDATE", "DELETE", "ACCESO_ROMPER_CRISTAL"]),
  actorId: z.string().uuid().nullable(),
  creadoEn: z.string(),
  valoresPrevios: z.unknown().nullable(),
  valoresNuevos: z.unknown().nullable(),
});
export type EntradaAuditoriaContrato = z.infer<typeof EntradaAuditoriaContrato>;

export const RespuestaAuditoriaPaginada = z.object({
  pagina: z.number().int().min(1),
  tamano: z.number().int().min(1),
  total: z.number().int().min(0),
  entradas: z.array(EntradaAuditoriaContrato),
});
export type RespuestaAuditoriaPaginada = z.infer<typeof RespuestaAuditoriaPaginada>;

export const QueryPaginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(100).default(20),
});
export type QueryPaginacion = z.infer<typeof QueryPaginacion>;

export const QueryRangoCalendario = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type QueryRangoCalendario = z.infer<typeof QueryRangoCalendario>;

export { CODIGOS_ERROR, ErrorDominio } from "./errores.js";
export type { CodigoError, CuerpoErrorHttp } from "./errores.js";

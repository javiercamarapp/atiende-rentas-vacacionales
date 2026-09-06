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

// ---------------------------------------------------------------------------
// Finanzas / owners / statements (Lote 7, BACKLOG E10, RV12)
// ---------------------------------------------------------------------------

const FechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha ISO YYYY-MM-DD");
const CodigoMonedaContrato = z.string().regex(/^[A-Z]{3}$/, "código de moneda ISO 4217, ej. MXN");
const CanalCodigoContrato = z.enum(["airbnb", "vrbo", "booking", "manual"]);
const BasisPoints = z.number().int().min(0).max(10000);

export const CuerpoReglaComisionCanal = z.object({
  canalCodigo: CanalCodigoContrato,
  propiedadId: z.string().uuid().optional(),
  yaNetoDeComision: z.boolean(),
  comisionBasisPoints: BasisPoints,
  fuente: z.string().min(1, "toda cifra de comisión debe declarar su fuente (RV12 R1/R5)"),
  vigenteDesde: FechaIso.optional(),
});
export type CuerpoReglaComisionCanal = z.infer<typeof CuerpoReglaComisionCanal>;

export const CuerpoLineaGasto = z.object({
  tipo: z.string().min(1),
  descripcion: z.string().optional(),
  montoCentavos: z.number().int().min(0),
});
export type CuerpoLineaGasto = z.infer<typeof CuerpoLineaGasto>;

export const CuerpoLineaImpuesto = z.object({
  tipo: z.string().min(1),
  montoCentavos: z.number().int().min(0),
  nota: z.string().optional(),
});
export type CuerpoLineaImpuesto = z.infer<typeof CuerpoLineaImpuesto>;

export const CuerpoMovimientoReserva = z.object({
  moneda: CodigoMonedaContrato,
  montoBrutoCentavos: z.number().int().min(0),
  comisionGestorBasisPoints: BasisPoints,
  comisionGestorBase: z.enum(["bruto", "neto_de_canal"]).default("neto_de_canal"),
  gastos: z.array(CuerpoLineaGasto).default([]),
  impuestos: z.array(CuerpoLineaImpuesto).default([]),
});
export type CuerpoMovimientoReserva = z.infer<typeof CuerpoMovimientoReserva>;

export const CuerpoGenerarStatement = z.object({
  ownerId: z.string().uuid(),
  periodoInicio: FechaIso,
  periodoFin: FechaIso,
  motivoVersion: z.string().optional(),
});
export type CuerpoGenerarStatement = z.infer<typeof CuerpoGenerarStatement>;

export const CuerpoLineaPayoutImportada = z.object({
  referenciaExternaReserva: z.string().optional(),
  montoCentavos: z.number().int(),
});

export const CuerpoImportarPayout = z.object({
  canalCodigo: CanalCodigoContrato,
  moneda: CodigoMonedaContrato,
  fechaPayout: FechaIso,
  referenciaExterna: z.string().optional(),
  lineas: z.array(CuerpoLineaPayoutImportada).min(1),
});
export type CuerpoImportarPayout = z.infer<typeof CuerpoImportarPayout>;

// ---------------------------------------------------------------------------
// Pricing básico (Lote 7, BACKLOG E11, RV13)
// ---------------------------------------------------------------------------

export const CuerpoTarifaBase = z.object({
  precioNocheCentavos: z.number().int().min(0),
  moneda: CodigoMonedaContrato,
  vigenteDesde: FechaIso.optional(),
});
export type CuerpoTarifaBase = z.infer<typeof CuerpoTarifaBase>;

export const CuerpoTarifaTemporada = z.object({
  nombre: z.string().min(1),
  rango: RangoFechasContrato,
  precioNocheCentavos: z.number().int().min(0),
  moneda: CodigoMonedaContrato,
});
export type CuerpoTarifaTemporada = z.infer<typeof CuerpoTarifaTemporada>;

export const CuerpoDescuentoDuracion = z.object({
  nochesMinimas: z.number().int().min(1),
  porcentajeDescuentoBasisPoints: BasisPoints,
  fuente: z.string().min(1, "RV13-R-02: todo umbral de descuento debe declarar su fuente"),
});
export type CuerpoDescuentoDuracion = z.infer<typeof CuerpoDescuentoDuracion>;

export const CuerpoMinStay = z.object({
  rango: RangoFechasContrato,
  diaSemanaCheckIn: z.number().int().min(0).max(6).nullable().default(null),
  nochesMinimas: z.number().int().min(1),
});
export type CuerpoMinStay = z.infer<typeof CuerpoMinStay>;

export const CuerpoReglaCanalPricing = z.object({
  canalCodigo: CanalCodigoContrato,
  markupBasisPoints: BasisPoints,
  activo: z.boolean().default(false),
});
export type CuerpoReglaCanalPricing = z.infer<typeof CuerpoReglaCanalPricing>;

export const CuerpoCotizar = z.object({
  unidadId: z.string().uuid(),
  rango: RangoFechasContrato,
  canalCodigo: CanalCodigoContrato.optional(),
});
export type CuerpoCotizar = z.infer<typeof CuerpoCotizar>;

// ---------------------------------------------------------------------------
// Reporting (Lote 7, BACKLOG E12)
// ---------------------------------------------------------------------------

export const QueryReportePeriodo = z.object({
  desde: FechaIso,
  hasta: FechaIso,
  propiedadId: z.string().uuid().optional(),
});
export type QueryReportePeriodo = z.infer<typeof QueryReportePeriodo>;

// ---------------------------------------------------------------------------
// Operación: limpieza/mantenimiento/inspección (Lote 5, BACKLOG E08,
// H-049 a H-055). Rutas en apps/api/src/routes/limpieza/.
// ---------------------------------------------------------------------------

export const TipoTareaOperativaContrato = z.enum(["limpieza", "mantenimiento", "inspeccion"]);
export const EstadoTareaOperativaContrato = z.enum([
  "pendiente",
  "asignada",
  "en_progreso",
  "completada",
  "bloqueada",
  "cancelada",
]);
export const PrioridadTareaOperativaContrato = z.enum(["baja", "media", "alta", "urgente"]);
export const SeveridadIncidenciaContrato = z.enum(["leve", "moderada", "grave"]);
export const EstadoIncidenciaContrato = z.enum([
  "abierta",
  "en_revision",
  "bloqueo_propuesto",
  "bloqueo_confirmado",
  "resuelta",
  "descartada",
]);

export const TareaOperativaContrato = z.object({
  id: z.string().uuid(),
  unidadId: z.string().uuid(),
  /** Nombre de la unidad, resuelto server-side — el rol `limpieza` no tiene
   * acceso a `GET /unidades` (RLS), así que la UI nunca debe volver a
   * consultar esa ruta para mostrar el nombre de SU PROPIA tarea. */
  unidadNombre: z.string().nullable(),
  ocupacionUnidadId: z.string().uuid().nullable(),
  bufferOcupacionId: z.string().uuid().nullable(),
  tipo: TipoTareaOperativaContrato,
  estado: EstadoTareaOperativaContrato,
  prioridad: PrioridadTareaOperativaContrato,
  asignadoA: z.string().uuid().nullable(),
  esProveedorExterno: z.boolean(),
  programadaPara: z.string(),
  slaVenceEn: z.string().nullable(),
  completadaEn: z.string().nullable(),
  notas: z.string().nullable(),
});
export type TareaOperativaContrato = z.infer<typeof TareaOperativaContrato>;

export const CuerpoCrearTareaOperativa = z.object({
  unidadId: z.string().uuid(),
  tipo: z.enum(["mantenimiento", "inspeccion"]), // 'limpieza' solo se crea vía checkout (H-049)
  prioridad: PrioridadTareaOperativaContrato.optional(),
  programadaPara: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notas: z.string().optional(),
});
export type CuerpoCrearTareaOperativa = z.infer<typeof CuerpoCrearTareaOperativa>;

export const CuerpoAsignarTarea = z.object({
  asignadoA: z.string().uuid(),
  esProveedorExterno: z.boolean().default(false),
});
export type CuerpoAsignarTarea = z.infer<typeof CuerpoAsignarTarea>;

export const CuerpoCompletarChecklistItem = z.object({
  fotos: z
    .array(z.object({ rutaAlmacenamiento: z.string().min(1) }))
    .optional(),
});
export type CuerpoCompletarChecklistItem = z.infer<typeof CuerpoCompletarChecklistItem>;

export const CuerpoCompletarTarea = z.object({
  consumos: z
    .array(z.object({ itemInventarioId: z.string().uuid(), cantidad: z.number().positive() }))
    .optional(),
});
export type CuerpoCompletarTarea = z.infer<typeof CuerpoCompletarTarea>;

export const ChecklistItemContrato = z.object({
  id: z.string().uuid(),
  tareaId: z.string().uuid(),
  descripcion: z.string(),
  orden: z.number().int(),
  completado: z.boolean(),
  completadoEn: z.string().nullable(),
  completadoPor: z.string().uuid().nullable(),
});
export type ChecklistItemContrato = z.infer<typeof ChecklistItemContrato>;

export const CuerpoCrearIncidencia = z.object({
  unidadId: z.string().uuid(),
  tareaOrigenId: z.string().uuid().optional(),
  severidad: SeveridadIncidenciaContrato,
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
  propuestaBloqueoRango: RangoFechasContrato.optional(),
});
export type CuerpoCrearIncidencia = z.infer<typeof CuerpoCrearIncidencia>;

export const IncidenciaContrato = z.object({
  id: z.string().uuid(),
  unidadId: z.string().uuid(),
  severidad: SeveridadIncidenciaContrato,
  titulo: z.string(),
  descripcion: z.string().nullable(),
  estado: EstadoIncidenciaContrato,
  requiereConfirmacionHumana: z.boolean(),
});
export type IncidenciaContrato = z.infer<typeof IncidenciaContrato>;

export const CuerpoConfirmarBloqueoMantenimiento = z.object({
  rango: RangoFechasContrato.optional(),
});
export type CuerpoConfirmarBloqueoMantenimiento = z.infer<typeof CuerpoConfirmarBloqueoMantenimiento>;

export const CuerpoCrearItemInventario = z.object({
  unidadId: z.string().uuid(),
  nombre: z.string().min(1),
  categoria: z.enum(["ropa_blanca", "consumible", "otro"]).default("consumible"),
  cantidadActual: z.number().min(0).default(0),
  umbralMinimo: z.number().min(0).default(0),
  unidadMedida: z.string().min(1).default("pza"),
});
export type CuerpoCrearItemInventario = z.infer<typeof CuerpoCrearItemInventario>;

export const ItemInventarioContrato = z.object({
  id: z.string().uuid(),
  unidadId: z.string().uuid(),
  nombre: z.string(),
  categoria: z.enum(["ropa_blanca", "consumible", "otro"]),
  cantidadActual: z.number(),
  umbralMinimo: z.number(),
  unidadMedida: z.string(),
  stockBajo: z.boolean(),
});
export type ItemInventarioContrato = z.infer<typeof ItemInventarioContrato>;

export const TurnoDiaContrato = z.object({
  fecha: z.string(),
  tareas: z.array(TareaOperativaContrato),
});
export type TurnoDiaContrato = z.infer<typeof TurnoDiaContrato>;

export const QueryCalendarioTareas = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unidadId: z.string().uuid().optional(),
});
export type QueryCalendarioTareas = z.infer<typeof QueryCalendarioTareas>;

export { CODIGOS_ERROR, ErrorDominio } from "./errores.js";
export type { CodigoError, CuerpoErrorHttp } from "./errores.js";

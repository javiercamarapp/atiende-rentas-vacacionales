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
 * para esa fecha, tal como los necesita la UI (RV09-R-01, §UX-1).
 *
 * `ocupacionId`/`ocupacionInicio`/`ocupacionFin` identifican la fila de
 * `ocupacion_unidad` dominante de esa noche (la misma que usan `capa` y
 * `origenCanal`) — sin esto la UI no puede modificar/cancelar una
 * reserva o bloqueo que no haya creado ella misma en la sesión actual
 * (gap corregido en Lote 11B; antes se compensaba con una caché de
 * sessionStorage, `cacheOcupaciones`, que solo cubría lo creado en la
 * misma sesión del navegador). Nunca habilita cancelar una reserva de
 * canal: esa regla sigue decidida por `capa`/`razon`/`esDirecta` en la
 * UI (D-006/D-011), el `id` solo permite actuar sobre lo que ya estaba
 * permitido actuar. */
export const NocheCalendario = z.object({
  fecha: z.string(),
  ocupada: z.boolean(),
  ocupacionId: z.string().uuid().nullable(),
  ocupacionInicio: z.string().nullable(),
  ocupacionFin: z.string().nullable(),
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

// ---------------------------------------------------------------------------
// Mensajería con aprobación humana (Lote 6, BACKLOG E09, H-056 a H-061)
// ---------------------------------------------------------------------------

export const CanalMensajeriaContrato = z.enum(["airbnb", "vrbo", "booking"]);
export type CanalMensajeriaContrato = z.infer<typeof CanalMensajeriaContrato>;

export const EventoPlantillaContrato = z.enum(["confirmacion", "pre_llegada", "check_in", "check_out", "resena"]);
export type EventoPlantillaContrato = z.infer<typeof EventoPlantillaContrato>;

export const EstadoBorradorContrato = z.enum(["pendiente_aprobacion", "aprobado", "rechazado", "enviado"]);
export type EstadoBorradorContrato = z.infer<typeof EstadoBorradorContrato>;

export const CuerpoCrearConversacion = z.object({
  unidadId: z.string().uuid(),
  canalCodigo: CanalMensajeriaContrato,
  ocupacionUnidadId: z.string().uuid().optional(),
  huespedMinimoId: z.string().uuid().optional(),
  idioma: z.enum(["es", "en"]).default("es"),
});
export type CuerpoCrearConversacion = z.infer<typeof CuerpoCrearConversacion>;

// H-... mensaje entrante — SIEMPRE dato no confiable (RV19-R-16): este
// cuerpo nunca incluye un campo "instrucción" ni nada que el servidor
// interprete como comando, solo el texto tal cual llegó.
export const CuerpoRegistrarMensajeEntrante = z.object({
  texto: z.string().min(1).max(8000),
  origen: z.enum(["simulador", "manual"]),
  idioma: z.enum(["es", "en"]).default("es"),
});
export type CuerpoRegistrarMensajeEntrante = z.infer<typeof CuerpoRegistrarMensajeEntrante>;

export const CuerpoCrearBorrador = z.object({
  // `mensajeEntranteId` es opcional: un borrador también puede originarse
  // de una plantilla programada (H-056), sin mensaje entrante disparador.
  mensajeEntranteId: z.string().uuid().optional(),
  reservaConfirmada: z.boolean().default(false),
});
export type CuerpoCrearBorrador = z.infer<typeof CuerpoCrearBorrador>;

export const CuerpoRechazarBorrador = z.object({
  motivo: z.string().min(1, "El rechazo de un borrador requiere motivo explícito"),
});
export type CuerpoRechazarBorrador = z.infer<typeof CuerpoRechazarBorrador>;

export const CuerpoCrearPlantilla = z.object({
  evento: EventoPlantillaContrato,
  idioma: z.enum(["es", "en"]),
  canalCodigo: CanalMensajeriaContrato.nullable().default(null),
  cuerpo: z.string().min(1).max(4000),
});
export type CuerpoCrearPlantilla = z.infer<typeof CuerpoCrearPlantilla>;

export const CuerpoProgramarMensaje = z.object({
  conversacionId: z.string().uuid(),
  plantillaId: z.string().uuid(),
  programadoPara: z.string().datetime(),
});
export type CuerpoProgramarMensaje = z.infer<typeof CuerpoProgramarMensaje>;

export const MensajeContrato = z.object({
  id: z.string().uuid(),
  conversacionId: z.string().uuid(),
  direccion: z.enum(["entrante", "saliente"]),
  origen: z.enum(["canal", "simulador", "manual"]),
  texto: z.string(),
  redactado: z.boolean(),
  creadoEn: z.string(),
});
export type MensajeContrato = z.infer<typeof MensajeContrato>;

export const BorradorMensajeContrato = z.object({
  id: z.string().uuid(),
  conversacionId: z.string().uuid(),
  texto: z.string(),
  canalCodigo: CanalMensajeriaContrato,
  estado: EstadoBorradorContrato,
  generadoPor: z.enum(["motor_borrador", "plantilla", "manual"]),
  redactado: z.boolean(),
  necesitaEscalamiento: z.boolean().optional(),
  aprobadoPor: z.string().uuid().nullable(),
  rechazadoPor: z.string().uuid().nullable(),
  motivoRechazo: z.string().nullable(),
  creadoEn: z.string(),
});
export type BorradorMensajeContrato = z.infer<typeof BorradorMensajeContrato>;

export const ConversacionResumenContrato = z.object({
  id: z.string().uuid(),
  unidadId: z.string().uuid(),
  unidadNombre: z.string().nullable(),
  canalCodigo: CanalMensajeriaContrato,
  ultimoMensajeEn: z.string().nullable(),
  borradoresPendientes: z.number().int(),
});
export type ConversacionResumenContrato = z.infer<typeof ConversacionResumenContrato>;

export const PoliticaCanalContrato = z.object({
  canal: CanalMensajeriaContrato,
  maxCaracteres: z.number().int(),
  fuenteMaxCaracteres: z.string(),
  permiteContactoDirectoPreReserva: z.boolean(),
  permiteAutomatizacionPreReserva: z.boolean(),
  accionAntePreReservaProhibida: z.enum(["bloquear", "redactar"]),
  fuentePolitica: z.string(),
});
export type PoliticaCanalContrato = z.infer<typeof PoliticaCanalContrato>;

// ---------------------------------------------------------------------------
// Back office / superadmin (Lote 8, BACKLOG E13 + E02 H-011/H-012 parte de
// formulario CRUD). Rutas en apps/api/src/routes/backoffice/.
// ---------------------------------------------------------------------------

export const EstadoTenantContrato = z.enum(["activo", "suspendido"]);
export type EstadoTenantContrato = z.infer<typeof EstadoTenantContrato>;

export const MetricasTenantContrato = z.object({
  unidadesTotal: z.number().int().min(0),
  cuentasCanalTotal: z.number().int().min(0),
  cuentasCanalConfiguradas: z.number().int().min(0),
  cuentasCanalSimulador: z.number().int().min(0),
  alertasAbiertas: z.number().int().min(0),
  outboxPendiente: z.number().int().min(0),
});
export type MetricasTenantContrato = z.infer<typeof MetricasTenantContrato>;

/** Directorio de tenants (H-074): visible para superadmin SIN concesión
 * "romper cristal" — nombre/tipo/estado + métricas agregadas, nunca
 * contenido de negocio (packages/db migración 0061/0063). */
export const TenantDirectorioContrato = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  tipo: z.string(),
  estado: EstadoTenantContrato,
  suspendidoMotivo: z.string().nullable(),
  creadoEn: z.string(),
  metricas: MetricasTenantContrato,
});
export type TenantDirectorioContrato = z.infer<typeof TenantDirectorioContrato>;

export const CuerpoCrearTenantBackoffice = z.object({
  nombre: z.string().min(1),
  razonSocial: z.string().min(1),
});
export type CuerpoCrearTenantBackoffice = z.infer<typeof CuerpoCrearTenantBackoffice>;

export const CuerpoSuspenderTenant = z.object({
  motivo: z.string().min(1, "Suspender un tenant exige un motivo explícito"),
});
export type CuerpoSuspenderTenant = z.infer<typeof CuerpoSuspenderTenant>;

// ---------------------------------------------------------------------------
// Acceso "romper cristal" (H-075/H-076): motivo obligatorio, ventana
// temporal acotada, auditado (packages/db migración 0061).
// ---------------------------------------------------------------------------

export const CuerpoCrearAccesoRomperCristal = z.object({
  tenantId: z.string().uuid(),
  motivo: z.string().min(1, "El acceso 'romper cristal' exige un motivo explícito"),
  alcance: z.string().min(1).default("general"),
  minutos: z.number().int().min(1).max(24 * 60).default(30),
});
export type CuerpoCrearAccesoRomperCristal = z.infer<typeof CuerpoCrearAccesoRomperCristal>;

export const AccesoRomperCristalContrato = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  motivo: z.string(),
  alcance: z.string(),
  creadoEn: z.string(),
  expiraEn: z.string(),
  revocadoEn: z.string().nullable(),
});
export type AccesoRomperCristalContrato = z.infer<typeof AccesoRomperCristalContrato>;

// ---------------------------------------------------------------------------
// Feature flags por tenant (packages/domain/flags, H-089 reutilizado desde
// el back office con auditoría de cambios).
// ---------------------------------------------------------------------------

export const CuerpoEstablecerFlag = z.object({
  valor: z.boolean(),
  tenantId: z.string().uuid().optional(),
  motivo: z.string().min(1, "Todo cambio de feature flag exige motivo (auditoría)"),
});
export type CuerpoEstablecerFlag = z.infer<typeof CuerpoEstablecerFlag>;

export const FlagContrato = z.object({
  id: z.string(),
  descripcion: z.string(),
  categoriaRiesgo: z.string(),
  valorGlobal: z.boolean(),
  valorEfectivo: z.boolean(),
  overrideDeTenant: z.boolean(),
});
export type FlagContrato = z.infer<typeof FlagContrato>;

// ---------------------------------------------------------------------------
// Propiedades/unidades — CRUD de administración (H-011/H-012): zona
// horaria IANA + dirección mínima + moneda obligatorias en el alta.
// ---------------------------------------------------------------------------

export const DireccionMinimaContrato = z.object({
  linea1: z.string().min(1, "La dirección mínima requiere al menos una línea"),
  ciudad: z.string().min(1),
  pais: z.string().min(2).max(2, "País como código ISO 3166-1 alfa-2, ej. MX"),
});
export type DireccionMinimaContrato = z.infer<typeof DireccionMinimaContrato>;

export const CuerpoCrearPropiedadBackoffice = z.object({
  tenantId: z.string().uuid().optional(),
  nombre: z.string().min(1),
  zonaHoraria: z.string().min(1),
  moneda: z.string().regex(/^[A-Z]{3}$/, "código de moneda ISO 4217, ej. MXN"),
  direccion: DireccionMinimaContrato,
});
export type CuerpoCrearPropiedadBackoffice = z.infer<typeof CuerpoCrearPropiedadBackoffice>;

export const CuerpoActualizarPropiedadBackoffice = z.object({
  nombre: z.string().min(1).optional(),
  zonaHoraria: z.string().min(1).optional(),
  moneda: z
    .string()
    .regex(/^[A-Z]{3}$/, "código de moneda ISO 4217, ej. MXN")
    .optional(),
  direccion: DireccionMinimaContrato.partial().optional(),
});
export type CuerpoActualizarPropiedadBackoffice = z.infer<typeof CuerpoActualizarPropiedadBackoffice>;

export const PropiedadBackofficeContrato = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  nombre: z.string(),
  zonaHoraria: z.string(),
  moneda: z.string().nullable(),
  direccion: z
    .object({
      linea1: z.string().nullable(),
      ciudad: z.string().nullable(),
      pais: z.string().nullable(),
    })
    .nullable(),
});
export type PropiedadBackofficeContrato = z.infer<typeof PropiedadBackofficeContrato>;

/** `cantidad` (H-012, multi-unidad): crea N unidades idénticas de una sola
 * vez ("Unidad 1".."Unidad N" si no se personaliza `nombre`), cada una con
 * su propio invariante de exclusión — nunca una sola fila compartida. */
export const CuerpoCrearUnidadBackoffice = z.object({
  propiedadId: z.string().uuid(),
  nombre: z.string().min(1),
  ownerId: z.string().uuid().optional(),
  duracionMinimaNoches: z.number().int().min(1).optional(),
  cantidad: z.number().int().min(1).max(50).default(1),
});
export type CuerpoCrearUnidadBackoffice = z.infer<typeof CuerpoCrearUnidadBackoffice>;

export const CuerpoActualizarUnidadBackoffice = z.object({
  nombre: z.string().min(1).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  duracionMinimaNoches: z.number().int().min(1).optional(),
});
export type CuerpoActualizarUnidadBackoffice = z.infer<typeof CuerpoActualizarUnidadBackoffice>;

// ---------------------------------------------------------------------------
// Cuentas de canal — alta con tipo de conexión HONESTO (D-017/D-019): iCal
// import/export, partner pendiente con motivo explícito, o simulador
// (bloqueado fuera de entorno dev). Credenciales cifradas por Lote 3;
// nunca se devuelven en claro — solo "configurada"/"no configurada".
// ---------------------------------------------------------------------------

export const TipoConexionCuentaCanalContrato = z.enum(["ical", "partner_pendiente", "simulador"]);
export type TipoConexionCuentaCanalContrato = z.infer<typeof TipoConexionCuentaCanalContrato>;

export const CuerpoCrearCuentaCanalBackoffice = z
  .object({
    tenantId: z.string().uuid().optional(),
    propiedadId: z.string().uuid().optional(),
    canalCodigo: z.enum(["airbnb", "vrbo", "booking", "manual"]),
    nombre: z.string().min(1),
    tipoConexion: TipoConexionCuentaCanalContrato,
    motivoPartnerPendiente: z.string().min(1).optional(),
    urlImport: z.string().url().optional(),
    credenciales: z.record(z.string(), z.string()).optional(),
  })
  .refine((v) => v.tipoConexion !== "partner_pendiente" || !!v.motivoPartnerPendiente, {
    message: "tipoConexion='partner_pendiente' exige motivoPartnerPendiente explícito (D-017)",
    path: ["motivoPartnerPendiente"],
  });
export type CuerpoCrearCuentaCanalBackoffice = z.infer<typeof CuerpoCrearCuentaCanalBackoffice>;

/** Nunca incluye credenciales en claro ni cifradas — solo si están
 * "configuradas" (§RV19/21-13, "credenciales nunca en respuesta"). */
export const CuentaCanalBackofficeContrato = z.object({
  id: z.string().uuid(),
  canalCodigo: z.string(),
  nombre: z.string(),
  tipoConexion: TipoConexionCuentaCanalContrato,
  estadoConexion: EstadoConexionCanalContrato,
  credencialesConfiguradas: z.boolean(),
  motivoPartnerPendiente: z.string().nullable(),
  esSimulador: z.boolean(),
});
export type CuentaCanalBackofficeContrato = z.infer<typeof CuentaCanalBackofficeContrato>;

// ---------------------------------------------------------------------------
// Usuarios/roles del tenant + invitaciones (RV12 §1, 3 niveles de
// colaborador ya definidos en Lote 3).
// ---------------------------------------------------------------------------

export const CuerpoCrearInvitacion = z
  .object({
    email: z.string().email(),
    rol: RolUsuario,
    colaboradorNivel: ColaboradorNivel.optional(),
    ownerId: z.string().uuid().optional(),
    ttlHoras: z.number().int().min(1).max(24 * 30).default(72),
  })
  .refine((v) => v.rol !== "operador" || v.colaboradorNivel !== undefined, {
    message: "colaboradorNivel es requerido cuando rol='operador'",
  });
export type CuerpoCrearInvitacion = z.infer<typeof CuerpoCrearInvitacion>;

export const InvitacionUsuarioContrato = z.object({
  id: z.string().uuid(),
  email: z.string(),
  rol: RolUsuario,
  colaboradorNivel: ColaboradorNivel.nullable(),
  creadoEn: z.string(),
  expiraEn: z.string(),
  aceptadaEn: z.string().nullable(),
  revocadaEn: z.string().nullable(),
});
export type InvitacionUsuarioContrato = z.infer<typeof InvitacionUsuarioContrato>;

// ---------------------------------------------------------------------------
// Auditoría consultable con filtros (back office; extiende GET /auditoria
// de Lote 3 sin modificar esa ruta — carpeta exclusiva de este lote).
// ---------------------------------------------------------------------------

export const QueryAuditoriaBackoffice = QueryPaginacion.extend({
  tabla: z.string().optional(),
  operacion: z.enum(["INSERT", "UPDATE", "DELETE", "ACCESO_ROMPER_CRISTAL"]).optional(),
  actorId: z.string().uuid().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});
export type QueryAuditoriaBackoffice = z.infer<typeof QueryAuditoriaBackoffice>;

// ---------------------------------------------------------------------------
// Automatización agéntica (Lote 9, BACKLOG E14, H-077 a H-085). Ningún
// esquema de este bloque acepta un identificador de tenant/propiedad/
// huésped/reserva como campo pensado para el MODELO — `unidadId` en las
// rutas es un parámetro normal de la sesión autenticada (mismo patrón que
// `pricing.ts`/`limpieza`), resuelto por el servidor ANTES de construir el
// `ToolContext`; el catálogo de tools en sí (`@atiende-rv/domain/agentes`)
// nunca declara esos campos en su `input_schema` (D-008, verificado en CI).
// ---------------------------------------------------------------------------

export const CuerpoInvocarAgente = z.object({
  texto: z.string().min(1).max(4000),
  idioma: z.enum(["es", "en"]).default("es"),
  canal: z.enum(["airbnb", "vrbo", "booking", "panel"]).default("panel"),
  conversationId: z.string().min(1).max(200).optional(),
});
export type CuerpoInvocarAgente = z.infer<typeof CuerpoInvocarAgente>;

export const ToolCatalogoContrato = z.object({
  nombre: z.string(),
  descripcion: z.string(),
  efecto: z.enum(["lectura", "propuesta_aprobacion", "accion_reversible"]),
  requiereLlm: z.boolean(),
  maxLlamadasPorConversacion: z.number().int(),
});
export type ToolCatalogoContrato = z.infer<typeof ToolCatalogoContrato>;

export const ResultadoInvocacionAgenteContrato = z.object({
  tipo: z.enum(["ok", "presupuesto_agotado", "bloqueado"]),
  salida: z.unknown().optional(),
  necesitaEscalamiento: z.boolean().optional(),
  motivoEscalamiento: z.string().nullable().optional(),
  motivo: z.string().optional(),
  mensaje: z.string().optional(),
});
export type ResultadoInvocacionAgenteContrato = z.infer<typeof ResultadoInvocacionAgenteContrato>;

export const CuotaAgenteContrato = z.object({
  tenantId: z.string().uuid(),
  techoTokensPeriodo: z.number().int(),
  techoLlamadasPeriodo: z.number().int(),
  tokensRestantes: z.number().int(),
  llamadasRestantes: z.number().int(),
  periodoIniciaEn: z.string(),
});
export type CuotaAgenteContrato = z.infer<typeof CuotaAgenteContrato>;

export const TrazaAgenteContrato = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid(),
  rolActor: z.string(),
  conversationId: z.string(),
  canal: z.string(),
  toolNombre: z.string(),
  resultado: z.string(),
  duracionMs: z.number().int(),
  modeloReal: z.string().nullable(),
  costoUsdReal: z.number(),
  creadoEn: z.string(),
});
export type TrazaAgenteContrato = z.infer<typeof TrazaAgenteContrato>;

export const QueryTrazasAgente = QueryPaginacion.extend({});
export type QueryTrazasAgente = z.infer<typeof QueryTrazasAgente>;

export { CODIGOS_ERROR, ErrorDominio } from "./errores.js";
export type { CodigoError, CuerpoErrorHttp } from "./errores.js";

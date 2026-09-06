import type { Migracion } from "../runner/tipos.js";
import { migracion0001Extensiones } from "./0001_extensiones.js";
import { migracion0002TenantEmpresaOwner } from "./0002_tenant_empresa_owner.js";
import { migracion0003Usuario } from "./0003_usuario.js";
import { migracion0004CanalPropiedadUnidad } from "./0004_canal_propiedad_unidad.js";
import { migracion0005OcupacionUnidad } from "./0005_ocupacion_unidad.js";
import { migracion0006ConflictoCalendario } from "./0006_conflicto_calendario.js";
import { migracion0007OutboxEvento } from "./0007_outbox_evento.js";
import { migracion0008AuditoriaMutacion } from "./0008_auditoria_mutacion.js";
import { migracion0010UsuarioRolesCredenciales } from "./0010_usuario_roles_credenciales.js";
import { migracion0012RolAplicacion } from "./0012_rol_aplicacion.js";
import { migracion0013AuditoriaTriggers } from "./0013_auditoria_triggers.js";
import { migracion0014RlsFuncionesHelper } from "./0014_rls_funciones_helper.js";
import { migracion0015RlsPoliticas } from "./0015_rls_politicas.js";
import { migracion0016RlsFuncionesAutenticacion } from "./0016_rls_funciones_autenticacion.js";
import { migracion0020CuentaCanal } from "./0020_cuenta_canal.js";
import { migracion0021SincronizacionCanal } from "./0021_sincronizacion_canal.js";
import { migracion0030TareaOperativa } from "./0030_tarea_operativa.js";
import { migracion0031ChecklistTarea } from "./0031_checklist_tarea.js";
import { migracion0032IncidenciaMantenimiento } from "./0032_incidencia_mantenimiento.js";
import { migracion0033InventarioUnidad } from "./0033_inventario_unidad.js";
import { migracion0034ConfiguracionOperativa } from "./0034_configuracion_operativa.js";
import { migracion0035OutboxConsumidoLimpieza } from "./0035_outbox_consumido_limpieza.js";
import { migracion0036RlsOperacion } from "./0036_rls_operacion.js";
import { migracion0037AuditoriaTriggersOperacion } from "./0037_auditoria_triggers_operacion.js";
import { migracion0038RlsOutboxLecturaOperacion } from "./0038_rls_outbox_lectura_operacion.js";
import { migracion0039HelperUnidadNombreOperacion } from "./0039_helper_unidad_nombre_operacion.js";
import { migracion0040MensajeriaEsquema } from "./0040_mensajeria_esquema.js";
import { migracion0041MensajeriaPlantillas } from "./0041_mensajeria_plantillas.js";
import { migracion0042MensajeriaBorradorAprobacion } from "./0042_mensajeria_borrador_aprobacion.js";
import { migracion0043MensajeriaRls } from "./0043_mensajeria_rls.js";
import { migracion0044MensajeriaAuditoria } from "./0044_mensajeria_auditoria.js";
import { migracion0050FinanzasEsquema } from "./0050_finanzas_esquema.js";
import { migracion0051PayoutConciliacion } from "./0051_payout_conciliacion.js";
import { migracion0052OwnerStatement } from "./0052_owner_statement.js";
import { migracion0053PricingEsquema } from "./0053_pricing_esquema.js";
import { migracion0054FinanzasPricingRls } from "./0054_finanzas_pricing_rls.js";
import { migracion0055FinanzasAuditoria } from "./0055_finanzas_auditoria.js";
import { migracion0060BackofficeColumnas } from "./0060_backoffice_columnas.js";
import { migracion0061AccesoRomperCristal } from "./0061_acceso_romper_cristal.js";
import { migracion0062InvitacionUsuario } from "./0062_invitacion_usuario.js";
import { migracion0063BackofficeMetricasTenant } from "./0063_backoffice_metricas_tenant.js";
import { migracion0064CuentaCanalConexionHonesta } from "./0064_cuenta_canal_conexion_honesta.js";
import { migracion0070AgentesEsquema } from "./0070_agentes_esquema.js";
import { migracion0071AgentesRls } from "./0071_agentes_rls.js";
import { migracion0072AgentesAuditoria } from "./0072_agentes_auditoria.js";
import { migracion0080OutboxConsumidoObservabilidad } from "./0080_outbox_consumido_observabilidad.js";
import { migracion0081Alerta } from "./0081_alerta.js";
import { migracion0090CuentaCanalCifrado } from "./0090_cuenta_canal_cifrado.js";
import { migracion0091AuditoriaTriggerCuentaCanal } from "./0091_auditoria_trigger_cuenta_canal.js";
import { migracion0092RlsTablasCanalLote2 } from "./0092_rls_tablas_canal_lote2.js";
import { migracion0093HuespedMinimoTenantRls } from "./0093_huesped_minimo_tenant_rls.js";
import { migracion0100FeedIcalToken } from "./0100_feed_ical_token.js";

// Orden fijo, nunca reordenar migraciones ya aplicadas en algún entorno
// (patrón expand/contract real llega en Lote 10 — H-088). Cada lote
// posterior añade migraciones NUEVAS, nunca edita estos archivos. Rango
// 0010-0019 usado por Lote 3 (auth/RLS/auditoría, en paralelo); Lote 2
// (iCal/simuladores/anti-eco) usa 0020+ para no colisionar (LOTES.md, nota
// de cabecera "punto de fusión compartido"). 0090-0092 son extensiones de
// Lote 3 que dependen de tablas creadas por Lote 2 en 0020/0021 (cifrado de
// credenciales + RLS de cuenta_canal/unidad_canal_feed/etc.) — numeradas
// lejos de 0022+ para minimizar colisión de nombre de archivo con
// migraciones futuras de Lote 2; ver comentario de cabecera en
// 0090_cuenta_canal_cifrado.ts. Rango 0030-0039 reservado a Lote 5
// (operación de limpieza/mantenimiento, E08) — ver comentario de cabecera
// en 0035_outbox_consumido_limpieza.ts sobre por qué no reutiliza la
// columna `outbox_evento.procesado_en` de Lote 1. Rango 0050-0059
// reservado a Lote 7
// (finanzas/owners/statements + pricing + reporting, E10/E11/E12) — ver
// comentario de cabecera en 0050_finanzas_esquema.ts. Rango 0080-0089
// reservado a Lote 10 (observabilidad/recuperación, E15) — ledger propio
// de idempotencia del worker de outbox y tabla de alertas, mismo patrón de
// "tabla de seguimiento propia" que ya usa Lote 5 (ver 0035_outbox_consumido_limpieza.ts).
// Rango 0040-0049 reservado a Lote 6 (mensajería con aprobación humana,
// E09) — ver comentario de cabecera en 0040_mensajeria_esquema.ts. Rango
// 0060-0069 reservado a Lote 8 (back office/superadmin, E13) — ver
// comentario de cabecera en 0060_backoffice_columnas.ts. Rango 0070-0079
// reservado a Lote 9 (automatización agéntica, E14) — ver comentario de
// cabecera en 0070_agentes_esquema.ts.
export const migraciones: Migracion[] = [
  migracion0001Extensiones,
  migracion0002TenantEmpresaOwner,
  migracion0003Usuario,
  migracion0004CanalPropiedadUnidad,
  migracion0005OcupacionUnidad,
  migracion0006ConflictoCalendario,
  migracion0007OutboxEvento,
  migracion0008AuditoriaMutacion,
  migracion0010UsuarioRolesCredenciales,
  migracion0012RolAplicacion,
  migracion0013AuditoriaTriggers,
  migracion0014RlsFuncionesHelper,
  migracion0015RlsPoliticas,
  migracion0016RlsFuncionesAutenticacion,
  migracion0020CuentaCanal,
  migracion0021SincronizacionCanal,
  migracion0030TareaOperativa,
  migracion0031ChecklistTarea,
  migracion0032IncidenciaMantenimiento,
  migracion0033InventarioUnidad,
  migracion0034ConfiguracionOperativa,
  migracion0035OutboxConsumidoLimpieza,
  migracion0036RlsOperacion,
  migracion0037AuditoriaTriggersOperacion,
  migracion0038RlsOutboxLecturaOperacion,
  migracion0039HelperUnidadNombreOperacion,
  migracion0040MensajeriaEsquema,
  migracion0041MensajeriaPlantillas,
  migracion0042MensajeriaBorradorAprobacion,
  migracion0043MensajeriaRls,
  migracion0044MensajeriaAuditoria,
  migracion0050FinanzasEsquema,
  migracion0051PayoutConciliacion,
  migracion0052OwnerStatement,
  migracion0053PricingEsquema,
  migracion0054FinanzasPricingRls,
  migracion0055FinanzasAuditoria,
  migracion0060BackofficeColumnas,
  migracion0061AccesoRomperCristal,
  migracion0062InvitacionUsuario,
  migracion0063BackofficeMetricasTenant,
  migracion0064CuentaCanalConexionHonesta,
  migracion0070AgentesEsquema,
  migracion0071AgentesRls,
  migracion0072AgentesAuditoria,
  migracion0080OutboxConsumidoObservabilidad,
  migracion0081Alerta,
  migracion0090CuentaCanalCifrado,
  migracion0091AuditoriaTriggerCuentaCanal,
  migracion0092RlsTablasCanalLote2,
  // 0093: corrección de auditoría independiente S-05 (docs/auditoria-2/
  // seguridad.md) — huesped_minimo sin tenant_id/RLS.
  migracion0093HuespedMinimoTenantRls,
  // Rango 0100+ reservado a Lote 11B (correcciones cruzadas detectadas al
  // cerrar Fase 2) — ver comentario de cabecera en
  // 0100_feed_ical_token.ts.
  migracion0100FeedIcalToken,
];

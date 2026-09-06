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
import { migracion0090CuentaCanalCifrado } from "./0090_cuenta_canal_cifrado.js";
import { migracion0091AuditoriaTriggerCuentaCanal } from "./0091_auditoria_trigger_cuenta_canal.js";
import { migracion0092RlsTablasCanalLote2 } from "./0092_rls_tablas_canal_lote2.js";

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
// 0090_cuenta_canal_cifrado.ts.
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
  migracion0090CuentaCanalCifrado,
  migracion0091AuditoriaTriggerCuentaCanal,
  migracion0092RlsTablasCanalLote2,
];

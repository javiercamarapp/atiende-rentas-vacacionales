import type { Migracion } from "../runner/tipos.js";
import { migracion0001Extensiones } from "./0001_extensiones.js";
import { migracion0002TenantEmpresaOwner } from "./0002_tenant_empresa_owner.js";
import { migracion0003Usuario } from "./0003_usuario.js";
import { migracion0004CanalPropiedadUnidad } from "./0004_canal_propiedad_unidad.js";
import { migracion0005OcupacionUnidad } from "./0005_ocupacion_unidad.js";
import { migracion0006ConflictoCalendario } from "./0006_conflicto_calendario.js";
import { migracion0007OutboxEvento } from "./0007_outbox_evento.js";
import { migracion0008AuditoriaMutacion } from "./0008_auditoria_mutacion.js";

// Orden fijo, nunca reordenar migraciones ya aplicadas en algún entorno
// (patrón expand/contract real llega en Lote 10 — H-088). Cada lote
// posterior añade migraciones NUEVAS (0009+), nunca edita estos archivos.
export const migraciones: Migracion[] = [
  migracion0001Extensiones,
  migracion0002TenantEmpresaOwner,
  migracion0003Usuario,
  migracion0004CanalPropiedadUnidad,
  migracion0005OcupacionUnidad,
  migracion0006ConflictoCalendario,
  migracion0007OutboxEvento,
  migracion0008AuditoriaMutacion,
];

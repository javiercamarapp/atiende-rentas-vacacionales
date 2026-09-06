/**
 * Feature flags tipados (Lote 10, H-089). Reglas del negocio, no solo de
 * infraestructura: toda funcionalidad que module dinero/cancelación/
 * contacto con huésped DEBE registrarse con `defaultValor: false`
 * (`CategoriaRiesgoFlag.DINERO_CANCELACION_CONTACTO`) — el registro
 * (`registro.ts`) lo hace cumplir en tiempo de registro, no solo por
 * convención de código review.
 *
 * Deliberadamente sin dependencia de ningún motor de BD: el registro de
 * referencia (`RegistroFlagsEnMemoria`) vive por proceso. La persistencia
 * real (multi-instancia, sobrevive reinicios) es responsabilidad de la
 * capa que lo use (ver `apps/api/src/workers/observabilidad/`), que puede
 * envolver esta misma interfaz con una tabla de BD sin cambiar el
 * contrato — documentado como límite conocido de esta fase (sin
 * requisito de multi-instancia todavía).
 */

export type FlagId = string;

export enum CategoriaRiesgoFlag {
  /** Toggles operativos (sync, instrumentación, tooling) — pueden
   * registrarse con cualquier valor por defecto. */
  OPERATIVO = "operativo",
  /** Cualquier funcionalidad que module dinero, cancelación de reserva o
   * contacto directo con huésped — DEBE ser `defaultValor: false`
   * (H-089, REQ-163). */
  DINERO_CANCELACION_CONTACTO = "dinero_cancelacion_contacto",
}

export interface FlagDefinicion {
  id: FlagId;
  descripcion: string;
  categoriaRiesgo: CategoriaRiesgoFlag;
  defaultValor: boolean;
}

export interface CambioFlagEntrada {
  flagId: FlagId;
  valor: boolean;
  /** `undefined` = cambia el valor global; con valor = override específico
   * de ese tenant. */
  tenantId?: string;
  actor: string;
  motivo: string;
}

export interface AuditoriaFlagEntry extends CambioFlagEntrada {
  valorAnterior: boolean;
  en: string; // ISO 8601 — inyectable en pruebas vía `ahora()`.
}

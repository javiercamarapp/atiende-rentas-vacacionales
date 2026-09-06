import { CategoriaRiesgoFlag, type FlagDefinicion } from "./tipos.js";

/**
 * `sync.push_automatico` (H-089/H-087): controla si el motor de
 * sincronización (`@atiende-rv/adapters`) tiene permitido exportar/empujar
 * disponibilidad hacia los canales automáticamente. Es un flag OPERATIVO
 * (no module dinero/cancelación/contacto directamente — solo pausa un
 * envío de disponibilidad, reversible), por eso puede registrarse con
 * `defaultValor: true` (operación normal). El flujo de restauración de
 * backup (`packages/db/backup/recuperacion.ts`) lo apaga explícitamente
 * tras cada restore hasta que la reconciliación de drift confirme que no
 * hay divergencia (§Operación-3).
 */
export const FLAG_SYNC_PUSH_AUTOMATICO = "sync.push_automatico";

/**
 * `sync.canal_pausado_por_alerta`: alterna la pausa reversible de push que
 * dispara el motor de alertas (H-090, `alertas.ts`) ante token de canal
 * revocado/expirado o cualquier otra condición que el runbook indique
 * pausar — nunca cancela ni contacta al huésped (§Operación-1).
 */
export const FLAG_SYNC_CANAL_PAUSADO_POR_ALERTA = "sync.canal_pausado_por_alerta";

export const CATALOGO_FLAGS_POR_DEFECTO: FlagDefinicion[] = [
  {
    id: FLAG_SYNC_PUSH_AUTOMATICO,
    descripcion:
      "Permite que el motor de sincronización empuje disponibilidad hacia los canales automáticamente. " +
      "Se apaga tras cada restauración de backup hasta reconciliar drift (§Operación-3).",
    categoriaRiesgo: CategoriaRiesgoFlag.OPERATIVO,
    defaultValor: true,
  },
  {
    id: FLAG_SYNC_CANAL_PAUSADO_POR_ALERTA,
    descripcion:
      "Pausa reversible de push automático activada por una alerta (p. ej. token de canal revocado). " +
      "Nunca cancela reservas ni contacta al huésped — solo detiene el envío hacia el canal afectado.",
    categoriaRiesgo: CategoriaRiesgoFlag.OPERATIVO,
    defaultValor: false,
  },
];

export { VERSION_FORMATO_BACKUP } from "./tiposBackup.js";
export type { ValorSerializado, FilaSerializada, TablaBackup, BackupLogico } from "./tiposBackup.js";

export { serializarValor, deserializarValor } from "./serializacion.js";

export { exportarBackupLogico, ordenTopologicoTablas } from "./exportar.js";
export type { OpcionesExportarBackup } from "./exportar.js";

export { restaurarBackupLogico, BackupIncompatibleError } from "./restaurar.js";
export type { ReporteRestauracion } from "./restaurar.js";

export { verificarIntegridad } from "./integridad.js";
export type { DiscrepanciaConteo, ReporteIntegridad, OpcionesVerificarIntegridad } from "./integridad.js";

export {
  recuperarDesdeBackup,
  confirmarReconciliacionYReactivarPush,
  ReconciliacionIncompletaError,
} from "./recuperacion.js";
export type {
  FeedAReconciliar,
  ResultadoReconciliacionFeed,
  OpcionesRecuperarDesdeBackup,
  ReporteRecuperacion,
} from "./recuperacion.js";

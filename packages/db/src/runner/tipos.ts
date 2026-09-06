export interface Migracion {
  /** Identificador único y ordenable, ej. "0001_extensiones". */
  id: string;
  descripcion: string;
  up: string;
  down: string;
}

// Separado de badge.tsx (react-refresh/only-export-components: un archivo
// de componente no debe exportar también valores no-componente).
export type EstadoConexionCanal =
  | "no_conectado"
  | "simulador"
  | "ical"
  | "bloqueado_por_partner"
  | "sandbox"
  | "produccion";

// Copy honesto por estado (D-017: "producción" nunca se afirma sin
// evidencia; PLAN-CONSTRUCCION.md §6: Booking.com usa etiquetas propias como
// "pausado por el canal", nunca genéricas). El componente que consuma este
// mapa en Lote 4 puede sobreescribir la etiqueta para casos especiales
// (p. ej. Booking.com "SIN EVIDENCIA"), pero el valor por defecto ya es
// honesto y nunca dice "conectado"/"producción" sin calificar.
export const ETIQUETA_ESTADO_CONEXION: Record<EstadoConexionCanal, string> = {
  no_conectado: "No conectado",
  simulador: "SIMULADOR — desarrollo/pruebas",
  ical: "iCal",
  bloqueado_por_partner: "Bloqueado por partner",
  sandbox: "Sandbox",
  produccion: "Producción",
};

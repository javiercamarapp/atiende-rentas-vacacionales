// Utilidades mínimas de fecha civil (YYYY-MM-DD), propias de esta carpeta
// (evita depender de apps/web/src/pages/calendario/fechas.ts, exclusivo de
// Lote 4). Sin `Date`/zona horaria del navegador para el cálculo de rango —
// las fechas del contrato ya son fechas civiles resueltas por el backend.
export function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function sumarDias(fechaIso: string, dias: number): string {
  const [y, m, d] = fechaIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function formatoLargoFecha(fechaIso: string): string {
  const [y, m, d] = fechaIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return `${DIAS_SEMANA[dt.getUTCDay()]} ${d} ${MESES[m! - 1]}`;
}

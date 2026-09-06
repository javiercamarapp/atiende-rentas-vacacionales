// Utilidades de fecha civil (strings YYYY-MM-DD) para el calendario maestro.
// Deliberadamente sin `Date`/zona horaria del navegador para los cálculos de
// rango — las fechas del contrato ya son fechas civiles resueltas por la
// zona horaria de la propiedad en el backend (RV09-R-01); aquí solo se
// itera el calendario, nunca se reinterpreta la hora.

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

export function rangoDeNoches(desde: string, hasta: string): string[] {
  const noches: string[] = [];
  let cursor = desde;
  while (cursor < hasta) {
    noches.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  return noches;
}

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

export function formatoCortoFecha(fechaIso: string): { dia: string; diaSemana: string; mes: string } {
  const [y, m, d] = fechaIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return {
    dia: String(d).padStart(2, "0"),
    diaSemana: DIAS_SEMANA[dt.getUTCDay()]!,
    mes: MESES[m! - 1]!,
  };
}

export function esFinDeSemana(fechaIso: string): boolean {
  const [y, m, d] = fechaIso.split("-").map(Number);
  const dia = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return dia === 0 || dia === 6;
}

export function mesDeFecha(fechaIso: string): { anio: number; mes: number } {
  const [y, m] = fechaIso.split("-").map(Number);
  return { anio: y!, mes: m! };
}

/** Todas las noches del mes que contiene `fechaIso` (para la vista mensual
 * de una unidad), incluyendo relleno de celdas vacías al inicio para que
 * la semana empiece en lunes. */
export function matrizMes(fechaIso: string): (string | null)[][] {
  const { anio, mes } = mesDeFecha(fechaIso);
  const primerDia = new Date(Date.UTC(anio, mes - 1, 1));
  const diasEnMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  // getUTCDay(): 0=domingo..6=sábado → normalizamos a lunes=0.
  const offset = (primerDia.getUTCDay() + 6) % 7;

  const celdas: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let dia = 1; dia <= diasEnMes; dia += 1) {
    celdas.push(`${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
  }
  while (celdas.length % 7 !== 0) celdas.push(null);

  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

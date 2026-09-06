// Edad de "última sync exitosa" — usado por la matriz de conectividad y el
// monitor de sync (LOTES.md Lote 4 puntos 3 y 4). Nunca formatea "ahora
// mismo" para `null` — un canal sin sync registrada dice explícitamente
// que nunca ha sincronizado, no "0 minutos" (sería un dato falso).
export function edadLegible(fechaIso: string | null): string {
  if (!fechaIso) return "nunca ha sincronizado";
  const ms = Date.now() - new Date(fechaIso).getTime();
  if (ms < 0) return "hace un instante";
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return "hace segundos";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export function edadEnMs(fechaIso: string | null): number | null {
  if (!fechaIso) return null;
  return Date.now() - new Date(fechaIso).getTime();
}

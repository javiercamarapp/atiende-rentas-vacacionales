import { TODAS_LAS_CAPAS } from "../capas";

/** Leyenda siempre visible: color + texto para cada una de las 6 categorías
 * (LOTES.md Lote 4 punto 2). Nunca solo color (regla de oro, D-017/
 * DEFINICION-DE-HECHO §1). */
export function LeyendaCapas() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Leyenda de categorías del calendario">
      {TODAS_LAS_CAPAS.map((capa) => (
        <li key={capa.clave} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`inline-block w-3 h-3 rounded-sm shrink-0 ${capa.clasesLeyenda}`} aria-hidden="true" />
          {capa.etiqueta}
        </li>
      ))}
    </ul>
  );
}

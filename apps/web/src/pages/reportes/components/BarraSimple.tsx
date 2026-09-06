// Gráfica de barras mínima, sin ninguna librería/CDN externo (instrucción
// explícita del encargo: "gráficas simples sin CDN externo"). Un `<div>`
// por barra con ancho relativo al máximo del conjunto — suficiente para
// comparar ocupación/ingresos entre unidades o meses sin traer d3/recharts.
export interface BarraDato {
  etiqueta: string;
  valor: number;
  detalle?: string;
}

export function BarraSimple({ datos, formatearValor }: { datos: BarraDato[]; formatearValor?: (v: number) => string }) {
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="space-y-2" role="img" aria-label="Gráfica de barras">
      {datos.map((d) => (
        <div key={d.etiqueta} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-muted-foreground" title={d.etiqueta}>
            {d.etiqueta}
          </span>
          <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
            <div
              className="h-full rounded bg-primary"
              style={{ width: `${Math.max(2, (d.valor / maximo) * 100)}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right font-mono text-[11px]">
            {formatearValor ? formatearValor(d.valor) : d.valor}
          </span>
        </div>
      ))}
      {datos.length === 0 && <p className="text-xs text-muted-foreground">Sin datos para este periodo.</p>}
    </div>
  );
}

// Marca de agua reutilizable "borrador" (RV16: precios; RV19: páginas
// legales) — Lote 3.3. Nunca se omite en una página cuyo contenido no es
// definitivo: el texto exacto lo decide cada llamador (precio vs. legal),
// pero el estilo visual (franja ambar, ícono de advertencia) es el mismo
// en todo el sitio público para que un usuario aprenda a reconocerlo.
export function BorradorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <p className="font-semibold">Borrador — no es contenido definitivo</p>
      <div className="mt-1 text-amber-800 dark:text-amber-300">{children}</div>
    </div>
  );
}

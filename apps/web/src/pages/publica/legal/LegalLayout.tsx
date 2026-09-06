import type { ReactNode } from "react";
import { PublicaFooter, PublicaHeader } from "../components/PublicaHeader";
import { BorradorBanner } from "../components/BorradorBanner";

/** Layout compartido de las 4 páginas legales (Lote 3.3, RV19) — SIEMPRE
 * con la marca de agua "borrador" y la referencia a los bloqueos de
 * investigación abiertos (docs/BLOQUEOS.md B-003/B-004/B-005) que impiden
 * cerrar este contenido como definitivo sin que un abogado lo revise. */
export function LegalLayout({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <PublicaHeader />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-3xl font-bold text-foreground">{titulo}</h1>
        <div className="mt-4">
          <BorradorBanner>
            Este documento es un BORRADOR PARA REVISIÓN LEGAL — no ha sido revisado ni aprobado por un abogado
            y no debe usarse como el aviso/términos definitivos de un producto en operación real. Referencias
            de investigación abiertas que afectan este texto:{" "}
            <span className="font-medium">docs/BLOQUEOS.md B-003</span> (registro bajo normativa española,
            sin confirmar), <span className="font-medium">B-004</span> (regulación local de alojamiento
            turístico en CDMX, sin confirmar) y <span className="font-medium">B-005</span> (vigencia de tasas
            de retención fiscal ISR/IVA en México, sin confirmar).
          </BorradorBanner>
        </div>
        <article className="prose prose-sm mt-8 max-w-none text-foreground prose-headings:text-foreground prose-a:text-primary">
          {children}
        </article>
      </main>
      <PublicaFooter />
    </div>
  );
}

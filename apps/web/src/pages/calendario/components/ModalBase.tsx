import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// No existe un primitivo `Dialog` en `@atiende-rv/ui-atiende` (solo
// Button/Card/Table/Badge, Lote 0) — este modal mínimo cubre lo que las
// acciones seguras del calendario necesitan: foco inicial, cierre con
// `Escape`, `role="dialog"`/`aria-modal` para lectores de pantalla.
export function ModalBase({
  titulo,
  abierto,
  onCerrar,
  children,
}: {
  titulo: string;
  abierto: boolean;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclado);
    const primerCampo = ref.current?.querySelector<HTMLElement>("input, select, textarea, button");
    primerCampo?.focus();
    return () => document.removeEventListener("keydown", alTeclado);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-elevated p-4 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

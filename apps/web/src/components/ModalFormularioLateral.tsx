// Shell de modal de dos columnas — mismo esqueleto literal que
// atiende-restaurantes/src/components/ModalFormularioLateral.tsx (riel
// izquierdo angosto con marca + título/subtítulo [+ pasos opcionales],
// columna derecha con el contenido real y los botones al pie de ESA
// columna, nunca un footer de ancho completo): barra de gradiente arriba,
// grid `anchoRiel 1fr`, X para cerrar.
//
// Adaptado a los primitivos que de verdad existen en este repo, no a los
// de Restaurantes: `@atiende-rv/ui-atiende` no exporta ningún `Dialog`
// (ver su índice — solo Button/Card/Table/Badge, LOTES.md Lote 0) y este
// repo tampoco tiene `@radix-ui/react-dialog` instalado, así que no hay
// ningún `Dialog`/`DialogContent` que envolver. En su lugar se usa el
// mismo overlay mínimo que ya resolvió este problema en
// `pages/calendario/components/ModalBase.tsx` (`fixed inset-0` + backdrop
// propio, `role="dialog"`/`aria-modal`, cierre con `Escape`, foco inicial
// al primer control) — mismo criterio, ampliado al layout de dos
// columnas en vez del layout de una sola tarjeta de `ModalBase`.
//
// Solo el shell: esta corrección no migra ningún modal existente del
// repo a este componente (alcance explícito del lote que lo introduce).
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { AtiendeMark, Button, cn } from "@atiende-rv/ui-atiende";

interface PasoModalLateral {
  id: string;
  etiqueta: string;
}

interface ModalFormularioLateralProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título en el riel izquierdo (font-display, bold). */
  titulo: string;
  /** Texto secundario opcional bajo el título, en el riel izquierdo. */
  subtitulo?: string;
  /**
   * Lista de pasos opcional (solo para modales multi-paso reales) —
   * puntos + etiqueta, el activo resaltado. Se omite en formularios de
   * un solo paso (la mayoría): el riel se queda solo con marca +
   * título/subtítulo, sin inventar pasos que no existen.
   */
  pasos?: PasoModalLateral[];
  pasoActivo?: string;
  /** Contenido de la columna derecha. */
  children: ReactNode;
  /**
   * Botones al pie de la columna derecha (fila justify-end). Si se
   * omite, se arma un botón primario rounded-full con onGuardar/guardando.
   */
  footer?: ReactNode;
  onGuardar?: () => void;
  guardando?: boolean;
  textoBotonGuardar?: string;
  guardarDeshabilitado?: boolean;
  /** Ancho del modal (clase Tailwind `max-w-*`). @default "max-w-5xl" */
  anchoClase?: string;
  /** Ancho fijo del riel izquierdo. @default "220px" */
  anchoRiel?: string;
  /** Alto mínimo del contenido, para que no "salte" al cambiar de
   * contenido interno (ej. entre pasos). Omitir si el contenido es fijo. */
  altoMinimoClase?: string;
  /** Evita que un clic fuera o Escape cierren el modal (útil si hay
   * estado sin guardar). */
  bloquearCierre?: boolean;
}

export function ModalFormularioLateral({
  open,
  onOpenChange,
  titulo,
  subtitulo,
  pasos,
  pasoActivo,
  children,
  footer,
  onGuardar,
  guardando = false,
  textoBotonGuardar = "Guardar cambios",
  guardarDeshabilitado = false,
  anchoClase = "max-w-5xl",
  anchoRiel = "220px",
  altoMinimoClase,
  bloquearCierre = false,
}: ModalFormularioLateralProps) {
  const contenidoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !bloquearCierre) onOpenChange(false);
    };
    document.addEventListener("keydown", alTeclado);
    const primerCampo = contenidoRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    primerCampo?.focus();
    return () => document.removeEventListener("keydown", alTeclado);
  }, [open, bloquearCierre, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!bloquearCierre) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className={cn(anchoClase, "relative w-full overflow-hidden rounded-xl border border-border bg-card shadow-elevated")}
      >
        <div className="h-1 bg-gradient-to-r from-primary to-secondary" />

        {!bloquearCierre && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            className="absolute right-3 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}

        <div ref={contenidoRef} className={cn("grid", altoMinimoClase)} style={{ gridTemplateColumns: `${anchoRiel} 1fr` }}>
          {/* Riel izquierdo: marca (siempre el logo, nunca un ícono por
              recuadro — mismo criterio ya fijado en @atiende-rv/ui-atiende)
              + título/subtítulo (+ pasos si aplica). */}
          <div className="flex flex-col gap-6 border-r border-border bg-muted/30 p-6">
            <AtiendeMark className="h-7 w-auto" />
            <div>
              <p className="mb-1 font-display text-base font-semibold text-foreground">{titulo}</p>
              {subtitulo && <p className="text-[13px] leading-snug text-muted-foreground">{subtitulo}</p>}

              {pasos && pasos.length > 0 && (
                <div className="mt-4 space-y-3">
                  {pasos.map((p) => {
                    const activo = p.id === pasoActivo;
                    const indiceActivo = pasos.findIndex((x) => x.id === pasoActivo);
                    const completado = indiceActivo > pasos.findIndex((x) => x.id === p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            activo ? "bg-primary" : completado ? "bg-primary/50" : "bg-border",
                          )}
                        />
                        <span className={cn("text-[13px]", activo ? "font-medium text-foreground" : "text-muted-foreground")}>
                          {p.etiqueta}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Columna derecha: contenido real + botones al pie. */}
          <div className="flex flex-col p-6">
            <div className="flex-1 overflow-y-auto">{children}</div>
            <div className="mt-auto flex items-center justify-end gap-2 pt-5">
              {footer ?? (
                <Button className="rounded-full px-6" onClick={onGuardar} disabled={guardando || guardarDeshabilitado}>
                  {guardando ? "Guardando…" : textoBotonGuardar}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ModalFormularioLateralProps, PasoModalLateral };

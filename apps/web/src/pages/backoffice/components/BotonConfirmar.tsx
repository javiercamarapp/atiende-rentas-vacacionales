import { useState } from "react";
import { Button } from "@atiende-rv/ui-atiende";

/**
 * Confirmación accesible de dos pasos para acciones destructivas/
 * sensibles (suspender tenant, revocar concesión/invitación, eliminar
 * unidad) — sin depender de un componente de diálogo modal todavía no
 * barrilado en `@atiende-rv/ui-atiende` (Lote 0, fuera del alcance de
 * este lote tocar ese paquete). El primer click muestra "¿Confirmar?" +
 * "Cancelar"; el segundo click ejecuta. `aria-live` anuncia el cambio de
 * estado a lectores de pantalla.
 */
export function BotonConfirmar({
  etiqueta,
  etiquetaConfirmar = "¿Confirmar?",
  variante = "destructive",
  disabled,
  onConfirmar,
}: {
  etiqueta: string;
  etiquetaConfirmar?: string;
  variante?: "destructive" | "outline" | "default";
  disabled?: boolean;
  onConfirmar: () => void | Promise<void>;
}) {
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState(false);

  if (!pidiendoConfirmacion) {
    return (
      <Button size="sm" variant={variante} disabled={disabled} onClick={() => setPidiendoConfirmacion(true)}>
        {etiqueta}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5" aria-live="polite">
      <Button
        size="sm"
        variant="destructive"
        disabled={disabled}
        onClick={async () => {
          setPidiendoConfirmacion(false);
          await onConfirmar();
        }}
      >
        {etiquetaConfirmar}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setPidiendoConfirmacion(false)}>
        Cancelar
      </Button>
    </span>
  );
}

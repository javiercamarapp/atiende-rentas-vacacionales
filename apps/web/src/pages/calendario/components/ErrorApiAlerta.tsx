import { ErrorApi } from "../../../lib/api/cliente";

const ETIQUETA_HTTP: Record<number, string> = {
  409: "409 — conflicto",
  422: "422 — datos inválidos",
  403: "403 — no autorizado",
  404: "404 — no encontrado",
};

/** Errores tipados del contrato mostrados con su código HTTP+código de
 * dominio explícitos (LOTES.md Lote 4: "errores tipados mostrados"), nunca
 * un "algo salió mal" genérico. */
export function ErrorApiAlerta({ error }: { error: ErrorApi | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <span className="font-mono font-semibold">
        {ETIQUETA_HTTP[error.status] ?? `HTTP ${error.status || "—"}`} · {error.codigo}
      </span>
      <br />
      {error.message}
    </p>
  );
}

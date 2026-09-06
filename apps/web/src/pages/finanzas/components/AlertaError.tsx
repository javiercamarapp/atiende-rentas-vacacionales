import { ErrorApi } from "../../../lib/api/cliente";

const ETIQUETA_HTTP: Record<number, string> = {
  409: "409 — conflicto",
  422: "422 — datos inválidos",
  403: "403 — no autorizado",
  404: "404 — no encontrado",
};

/** Copia local deliberada del patrón ya usado en Lote 4/5 (mismo
 * comportamiento) — nunca se importa un archivo de la carpeta exclusiva de
 * otro lote (docs/fase2/LOTES.md). */
export function AlertaError({ error }: { error: ErrorApi | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      <span className="font-mono font-semibold">
        {ETIQUETA_HTTP[error.status] ?? `HTTP ${error.status || "—"}`} · {error.codigo}
      </span>
      <br />
      {error.message}
    </p>
  );
}

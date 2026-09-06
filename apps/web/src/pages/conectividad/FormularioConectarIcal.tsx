import { useState } from "react";
import { Button } from "@atiende-rv/ui-atiende";
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";
import { useMutacionLigera } from "../../lib/api/queryLigero";
import { crearCuentaCanal } from "./api";
import type { CanalCodigo } from "./catalogoCanales";
import { BASE_URL } from "../../lib/api/cliente";

/** Regex de validación de cliente para una URL de import iCal: esquema
 * `https`, sin hosts obviamente locales (mismo espíritu que el control
 * anti-SSRF real de `packages/adapters`, RV06 §controles, aunque ESTE
 * regex es solo higiene de formulario — la validación fuerte de SSRF vive
 * en el importador de Lote 2, no aquí). El backend actual (`POST
 * /canales/cuentas`) valida `credenciales` únicamente como
 * `record<string,string>` (contrato de Lote 3) — todavía no aplica un
 * formato de URL específico, así que esta pantalla no afirma "validado
 * también en el servidor" hasta que ese endpoint lo haga. */
const HOSTS_PROHIBIDOS = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/i;

function validarUrlIcal(valor: string): string | null {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return "No es una URL válida.";
  }
  if (url.protocol !== "https:") return "La URL debe usar https.";
  if (HOSTS_PROHIBIDOS.test(url.hostname)) return "No se aceptan hosts internos/locales.";
  return null;
}

export function FormularioConectarIcal({
  canal,
  propiedadId,
  onConectado,
}: {
  canal: CanalCodigo;
  propiedadId?: string;
  onConectado: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [urlImport, setUrlImport] = useState("");
  const [errorCliente, setErrorCliente] = useState<string | null>(null);
  const mutacion = useMutacionLigera(crearCuentaCanal);

  const urlExport = null as string | null; // ver nota más abajo, honesto: aún no expuesto por la API.

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validarUrlIcal(urlImport);
    setErrorCliente(problema);
    if (problema) return;
    await mutacion.ejecutar({
      canalCodigo: canal,
      nombre: nombre || `${canal} — iCal`,
      propiedadId,
      credenciales: { icalImportUrl: urlImport },
    });
    onConectado();
  }

  return (
    <form onSubmit={alEnviar} className="space-y-2 border-t border-border pt-2 mt-2">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`nombre-${canal}`}>
          Nombre de la cuenta
        </label>
        <input
          id={`nombre-${canal}`}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={`Ej. ${canal} — Depto 101`}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`url-import-${canal}`}>
          URL de import iCal (.ics)
        </label>
        <input
          id={`url-import-${canal}`}
          value={urlImport}
          onChange={(e) => setUrlImport(e.target.value)}
          placeholder="https://www.airbnb.com/calendar/ical/....ics"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono"
        />
        {errorCliente && (
          <p role="alert" className="text-xs text-destructive">
            {errorCliente}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">URL de exportación propia (para pegar en {canal})</p>
        <p className="text-xs text-muted-foreground italic">
          {urlExport ?? `Aún no expuesta por la API (endpoint pendiente en Lote 2/3) — no se muestra un enlace falso.`}
        </p>
      </div>
      <ErrorApiAlerta error={mutacion.error} />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={mutacion.enCurso || !urlImport}>
          {mutacion.enCurso ? "Conectando…" : "Conectar iCal"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        API: <span className="font-mono">{BASE_URL}</span> — la URL se cifra en reposo (AES-256-GCM, H-046)
        antes de guardarse.
      </p>
    </form>
  );
}

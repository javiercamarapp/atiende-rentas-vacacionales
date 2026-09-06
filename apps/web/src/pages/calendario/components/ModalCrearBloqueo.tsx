import { useState } from "react";
import { Button } from "@atiende-rv/ui-atiende";
import type { CuerpoCrearBloqueo } from "@atiende-rv/api/contrato";
import { ModalBase } from "./ModalBase";
import { ErrorApiAlerta } from "./ErrorApiAlerta";
import { useMutacionLigera } from "../../../lib/api/queryLigero";
import { crearBloqueo } from "../api";
import { registrarOcupacionCreada } from "../cacheOcupaciones";

// `RazonBloqueoContrato` en el contrato es un `z.enum(...)` exportado solo
// como valor (sin alias de tipo al lado) — se deriva el tipo desde el
// campo ya inferido de `CuerpoCrearBloqueo["razon"]` en vez de tocar el
// contrato compartido (fuera del alcance de este lote).
type RazonBloqueoId = CuerpoCrearBloqueo["razon"];

const RAZONES: { valor: RazonBloqueoId; etiqueta: string }[] = [
  { valor: "BLOQUEO_PROPIETARIO", etiqueta: "Bloqueo del propietario" },
  { valor: "MANTENIMIENTO", etiqueta: "Mantenimiento" },
  { valor: "BUFFER_LIMPIEZA", etiqueta: "Buffer de limpieza" },
];

export function ModalCrearBloqueo({
  abierto,
  onCerrar,
  unidadId,
  unidadNombre,
  inicio,
  fin,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  unidadId: string;
  unidadNombre: string;
  inicio: string;
  fin: string;
  onCreado: () => void;
}) {
  const [razon, setRazon] = useState<RazonBloqueoId>("BLOQUEO_PROPIETARIO");
  const [confirmando, setConfirmando] = useState(false);
  const mutacion = useMutacionLigera(crearBloqueo);

  async function confirmar() {
    const resultado = await mutacion.ejecutar({ unidadId, rango: { inicio, fin }, razon });
    registrarOcupacionCreada({ id: resultado.id, tipo: "bloqueo", unidadId, inicio, fin });
    onCreado();
    onCerrar();
    setConfirmando(false);
  }

  return (
    <ModalBase titulo="Crear bloqueo" abierto={abierto} onCerrar={onCerrar}>
      <p className="text-xs text-muted-foreground">
        Unidad <strong className="text-foreground">{unidadNombre}</strong> · {inicio} → {fin}
      </p>
      <div className="space-y-1">
        <label htmlFor="razon-bloqueo" className="text-xs font-medium text-muted-foreground">
          Razón
        </label>
        <select
          id="razon-bloqueo"
          value={razon}
          onChange={(e) => setRazon(e.target.value as RazonBloqueoId)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {RAZONES.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <ErrorApiAlerta error={mutacion.error} />

      {!confirmando ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => setConfirmando(true)}>Continuar</Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs text-foreground">
            ¿Confirmas crear este bloqueo? Ninguna reserva de canal se verá afectada; si hay una reserva
            confirmada en ese rango, se registrará como conflicto en vez de sobrescribirla.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={mutacion.enCurso}>
              Volver
            </Button>
            <Button onClick={confirmar} disabled={mutacion.enCurso}>
              {mutacion.enCurso ? "Creando…" : "Confirmar bloqueo"}
            </Button>
          </div>
        </div>
      )}
    </ModalBase>
  );
}

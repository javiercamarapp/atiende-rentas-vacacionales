import { useState } from "react";
import { Button } from "@atiende-rv/ui-atiende";
import { ModalBase } from "./ModalBase";
import { ErrorApiAlerta } from "./ErrorApiAlerta";
import { useMutacionLigera } from "../../../lib/api/queryLigero";
import { crearReservaDirecta } from "../api";
import { registrarOcupacionCreada } from "../cacheOcupaciones";

export function ModalCrearReserva({
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
  const [huespedNombre, setHuespedNombre] = useState("");
  const [huespedContacto, setHuespedContacto] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const mutacion = useMutacionLigera(crearReservaDirecta);

  async function confirmar() {
    const resultado = await mutacion.ejecutar({
      unidadId,
      rango: { inicio, fin },
      huespedNombre: huespedNombre || undefined,
      huespedContacto: huespedContacto || undefined,
    });
    registrarOcupacionCreada({ id: resultado.id, tipo: "reserva", unidadId, inicio, fin });
    onCreado();
    onCerrar();
    setConfirmando(false);
  }

  return (
    <ModalBase titulo="Crear reserva directa" abierto={abierto} onCerrar={onCerrar}>
      <p className="text-xs text-muted-foreground">
        Unidad <strong className="text-foreground">{unidadNombre}</strong> · {inicio} → {fin}. Esta reserva
        se crea con canal "manual" — nunca se confunde con una reserva de canal externo.
      </p>
      <div className="space-y-1">
        <label htmlFor="huesped-nombre" className="text-xs font-medium text-muted-foreground">
          Nombre del huésped (opcional)
        </label>
        <input
          id="huesped-nombre"
          value={huespedNombre}
          onChange={(e) => setHuespedNombre(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="huesped-contacto" className="text-xs font-medium text-muted-foreground">
          Contacto (opcional)
        </label>
        <input
          id="huesped-contacto"
          value={huespedContacto}
          onChange={(e) => setHuespedContacto(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
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
            ¿Confirmas crear esta reserva directa para {inicio} → {fin}? Si la unidad ya tiene otra reserva
            confirmada en ese rango, la API la rechazará (409) sin sobrescribir nada.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={mutacion.enCurso}>
              Volver
            </Button>
            <Button onClick={confirmar} disabled={mutacion.enCurso}>
              {mutacion.enCurso ? "Creando…" : "Confirmar reserva"}
            </Button>
          </div>
        </div>
      )}
    </ModalBase>
  );
}

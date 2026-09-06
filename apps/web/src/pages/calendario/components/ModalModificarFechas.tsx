import { useState } from "react";
import { Button } from "@atiende-rv/ui-atiende";
import { ModalBase } from "./ModalBase";
import { ErrorApiAlerta } from "./ErrorApiAlerta";
import { useMutacionLigera } from "../../../lib/api/queryLigero";
import { modificarFechasReserva } from "../api";
import { quitarOcupacionCreada, registrarOcupacionCreada } from "../cacheOcupaciones";

/** Solo aplica a reservas DIRECTAS (la propia página nunca ofrece esta
 * acción para una reserva de canal — D-006/D-011, ACEPTACION §UX-1). */
export function ModalModificarFechas({
  abierto,
  onCerrar,
  reservaId,
  unidadId,
  unidadNombre,
  inicioActual,
  finActual,
  onModificado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  reservaId: string;
  unidadId: string;
  unidadNombre: string;
  inicioActual: string;
  finActual: string;
  onModificado: () => void;
}) {
  const [inicio, setInicio] = useState(inicioActual);
  const [fin, setFin] = useState(finActual);
  const [confirmando, setConfirmando] = useState(false);
  const mutacion = useMutacionLigera(modificarFechasReserva);

  async function confirmar() {
    await mutacion.ejecutar(reservaId, { rango: { inicio, fin } });
    quitarOcupacionCreada(reservaId);
    registrarOcupacionCreada({ id: reservaId, tipo: "reserva", unidadId, inicio, fin });
    onModificado();
    onCerrar();
    setConfirmando(false);
  }

  return (
    <ModalBase titulo="Modificar fechas de la reserva" abierto={abierto} onCerrar={onCerrar}>
      <p className="text-xs text-muted-foreground">
        Unidad <strong className="text-foreground">{unidadNombre}</strong> · actual: {inicioActual} →{" "}
        {finActual}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor="nueva-fecha-inicio" className="text-xs font-medium text-muted-foreground">
            Nueva entrada
          </label>
          <input
            id="nueva-fecha-inicio"
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="nueva-fecha-fin" className="text-xs font-medium text-muted-foreground">
            Nueva salida
          </label>
          <input
            id="nueva-fecha-fin"
            type="date"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <ErrorApiAlerta error={mutacion.error} />

      {!confirmando ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => setConfirmando(true)} disabled={inicio >= fin}>
            Continuar
          </Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs text-foreground">
            ¿Confirmas mover esta reserva a {inicio} → {fin}? Si choca con otra reserva confirmada, la API
            la rechazará (409) y las fechas actuales se conservan sin cambio.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={mutacion.enCurso}>
              Volver
            </Button>
            <Button onClick={confirmar} disabled={mutacion.enCurso}>
              {mutacion.enCurso ? "Guardando…" : "Confirmar cambio"}
            </Button>
          </div>
        </div>
      )}
    </ModalBase>
  );
}

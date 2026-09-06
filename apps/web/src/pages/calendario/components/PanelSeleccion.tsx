import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import type { NocheCalendario } from "@atiende-rv/api/contrato";
import { claveCapaDeNoche, infoCapa, ETIQUETA_ESTADO } from "../capas";
import { cancelarBloqueo, cancelarReservaDirecta } from "../api";
import { useMutacionLigera } from "../../../lib/api/queryLigero";
import { ModalCrearBloqueo } from "./ModalCrearBloqueo";
import { ModalCrearReserva } from "./ModalCrearReserva";
import { ModalModificarFechas } from "./ModalModificarFechas";
import { ErrorApiAlerta } from "./ErrorApiAlerta";

export interface SeleccionRango {
  unidadId: string;
  unidadNombre: string;
  zonaHoraria: string;
  inicio: string;
  fin: string;
  /** Noches del rango tal como las devolvió el contrato, para decidir qué
   * acciones ofrecer (todas libres → crear; alguna ocupada → mostrar
   * detalle de la primera ocupada). */
  noches: (NocheCalendario | undefined)[];
}

export function PanelSeleccion({
  seleccion,
  onLimpiar,
  onCambio,
}: {
  seleccion: SeleccionRango | null;
  onLimpiar: () => void;
  onCambio: () => void;
}) {
  const [modal, setModal] = useState<"bloqueo" | "reserva" | "modificar" | "confirmar-cancelar" | null>(null);
  const mutacionCancelar = useMutacionLigera(async (entrada: OcupacionAccionable) =>
    entrada.tipo === "reserva" ? cancelarReservaDirecta(entrada.id) : cancelarBloqueo(entrada.id),
  );

  if (!seleccion) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Selecciona una noche o arrastra un rango en el calendario para ver el detalle y las acciones
          disponibles.
        </CardContent>
      </Card>
    );
  }

  const { unidadId, unidadNombre, zonaHoraria, inicio, fin, noches } = seleccion;
  const primeraOcupada = noches.find((n) => n?.ocupada);
  const todoLibre = noches.every((n) => !n?.ocupada);
  const accionable = ocupacionAccionable(primeraOcupada);

  async function confirmarCancelacion() {
    if (!accionable) return;
    await mutacionCancelar.ejecutar(accionable);
    setModal(null);
    onCambio();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-sm">{unidadNombre}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {inicio} → {fin} · zona horaria: <span className="font-mono">{zonaHoraria}</span>
          </p>
        </div>
        <button type="button" onClick={onLimpiar} className="text-xs text-muted-foreground hover:text-foreground">
          Limpiar
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {todoLibre && (
          <>
            <p className="text-sm text-muted-foreground">Rango libre — puedes crear una reserva directa o un bloqueo.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setModal("reserva")}>
                Crear reserva directa
              </Button>
              <Button size="sm" variant="outline" onClick={() => setModal("bloqueo")}>
                Crear bloqueo
              </Button>
            </div>
          </>
        )}

        {!todoLibre && primeraOcupada && (
          <DetalleOcupado
            noche={primeraOcupada}
            accionable={accionable}
            onModificar={() => setModal("modificar")}
            onCancelar={() => setModal("confirmar-cancelar")}
          />
        )}

        <ErrorApiAlerta error={mutacionCancelar.error} />
      </CardContent>

      <ModalCrearBloqueo
        abierto={modal === "bloqueo"}
        onCerrar={() => setModal(null)}
        unidadId={unidadId}
        unidadNombre={unidadNombre}
        inicio={inicio}
        fin={fin}
        onCreado={onCambio}
      />
      <ModalCrearReserva
        abierto={modal === "reserva"}
        onCerrar={() => setModal(null)}
        unidadId={unidadId}
        unidadNombre={unidadNombre}
        inicio={inicio}
        fin={fin}
        onCreado={onCambio}
      />
      {accionable?.tipo === "reserva" && (
        <ModalModificarFechas
          abierto={modal === "modificar"}
          onCerrar={() => setModal(null)}
          reservaId={accionable.id}
          unidadNombre={unidadNombre}
          inicioActual={accionable.inicio}
          finActual={accionable.fin}
          onModificado={onCambio}
        />
      )}
      {modal === "confirmar-cancelar" && accionable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-xl border border-border bg-card shadow-elevated p-4 space-y-3">
            <h2 className="text-sm font-semibold">
              {accionable.tipo === "reserva" ? "¿Cancelar esta reserva directa?" : "¿Quitar este bloqueo?"}
            </h2>
            <p className="text-xs text-muted-foreground">Esta acción libera {inicio} → {fin} en {unidadNombre}.</p>
            <ErrorApiAlerta error={mutacionCancelar.error} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModal(null)} disabled={mutacionCancelar.enCurso}>
                Volver
              </Button>
              <Button variant="destructive" onClick={confirmarCancelacion} disabled={mutacionCancelar.enCurso}>
                {mutacionCancelar.enCurso ? "Cancelando…" : "Sí, confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Reserva o bloqueo sobre el que el panel puede actuar (modificar/cancelar),
 * derivado directamente de la noche dominante que devuelve
 * `GET /unidades/:id/calendario` — antes esto dependía de una caché de
 * sessionStorage (`cacheOcupaciones`) que solo cubría lo creado en la
 * sesión actual del navegador; el contrato ya expone `ocupacionId` para
 * cualquier ocupación, propia o preexistente. */
export interface OcupacionAccionable {
  id: string;
  tipo: "reserva" | "bloqueo";
  inicio: string;
  fin: string;
}

function ocupacionAccionable(noche: NocheCalendario | undefined): OcupacionAccionable | null {
  if (!noche?.ocupacionId || !noche.capa || !noche.ocupacionInicio || !noche.ocupacionFin) return null;
  return { id: noche.ocupacionId, tipo: noche.capa, inicio: noche.ocupacionInicio, fin: noche.ocupacionFin };
}

function DetalleOcupado({
  noche,
  accionable,
  onModificar,
  onCancelar,
}: {
  noche: NocheCalendario;
  accionable: OcupacionAccionable | null;
  onModificar: () => void;
  onCancelar: () => void;
}) {
  const clave = claveCapaDeNoche(noche);
  const capa = infoCapa(clave);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-3 h-3 rounded-sm ${capa.clasesLeyenda}`} aria-hidden="true" />
        <span className="text-sm font-medium">{capa.etiqueta}</span>
      </div>
      <dl className="text-xs text-muted-foreground grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <dt>Estado</dt>
        <dd>{noche.estado ? ETIQUETA_ESTADO[noche.estado] : "—"}</dd>
        <dt>Origen</dt>
        <dd>{noche.origenCanal ?? "manual (directa)"}</dd>
      </dl>

      {clave === "reserva_canal" && (
        <p className="text-xs rounded-md border border-border bg-muted/40 p-2">
          Esta noche pertenece a una <strong>reserva de canal</strong>. Atiende nunca la cancela ni la
          modifica desde aquí (D-006/D-011) — cualquier cambio debe hacerse en el canal de origen.
        </p>
      )}
      {clave === "conflicto_pendiente" && (
        <p className="text-xs rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
          Conflicto pendiente de resolución — revísalo en Monitor de sincronización → Conflictos antes de
          intervenir manualmente.
        </p>
      )}
      {(clave === "reserva_directa" || clave === "bloqueo_propietario" || clave === "mantenimiento" || clave === "buffer_limpieza") &&
        (accionable ? (
          <div className="flex gap-2">
            {clave === "reserva_directa" && (
              <Button size="sm" variant="outline" onClick={onModificar}>
                Modificar fechas
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={onCancelar}>
              {clave === "reserva_directa" ? "Cancelar reserva" : "Quitar bloqueo"}
            </Button>
          </div>
        ) : (
          <p className="text-xs rounded-md border border-border bg-muted/40 p-2">
            No se pudo determinar el identificador de esta ocupación — la API no devolvió `ocupacionId`
            para esta noche, así que el panel no ofrece modificar/cancelar (nota honesta, no un botón roto).
          </p>
        ))}
    </div>
  );
}

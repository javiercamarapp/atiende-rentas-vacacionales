import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NocheCalendario } from "@atiende-rv/api/contrato";
import { NocheCelda } from "./NocheCelda";

const noop = () => {};

function nocheDe(razon: NocheCalendario["razon"], esDirecta: boolean): NocheCalendario {
  return { fecha: "2026-11-01", ocupada: true, capa: "reserva", razon, estado: "confirmado", origenCanal: razon === "RESERVA_CANAL" && !esDirecta ? "airbnb" : null, esDirecta };
}

describe("NocheCelda", () => {
  it("una reserva de canal muestra su origen en el detalle accesible", () => {
    render(
      <NocheCelda
        fecha="2026-11-01"
        noche={nocheDe("RESERVA_CANAL", false)}
        seleccionada={false}
        enRangoSeleccion={false}
        onPointerDown={noop}
        onPointerEnter={noop}
        onPointerUp={noop}
        onActivar={noop}
      />,
    );
    const boton = screen.getByRole("button");
    expect(boton.getAttribute("aria-label")).toMatch(/canal: airbnb/i);
    expect(boton.getAttribute("aria-label")).toMatch(/Reserva de canal/i);
  });

  it("una reserva directa se distingue textualmente de una de canal", () => {
    render(
      <NocheCelda
        fecha="2026-11-01"
        noche={nocheDe("RESERVA_CANAL", true)}
        seleccionada={false}
        enRangoSeleccion={false}
        onPointerDown={noop}
        onPointerEnter={noop}
        onPointerUp={noop}
        onActivar={noop}
      />,
    );
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/Reserva directa/i);
  });

  it("Enter activa la misma selección que un click/tap (equivalencia teclado↔puntero, ACEPTACION §UX-3)", () => {
    const onActivar = vi.fn();
    render(
      <NocheCelda
        fecha="2026-11-05"
        noche={undefined}
        seleccionada={false}
        enRangoSeleccion={false}
        onPointerDown={noop}
        onPointerEnter={noop}
        onPointerUp={noop}
        onActivar={onActivar}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onActivar).toHaveBeenCalledWith("2026-11-05");
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Solo se mockea `Sentry.init` — el resto (incluido el `ErrorBoundary`
// real) queda intacto: sin llamar `init` primero (el escenario "sin DSN"
// que este paquete debe soportar), el propio SDK de Sentry ya es
// no-op/seguro al capturar una excepción (no hay cliente configurado, no
// se abre ninguna conexión de red) — exactamente lo que se quiere
// verificar aquí, sin duplicar los internals de `@sentry/react` con un
// mock manual.
const { initMock } = vi.hoisted(() => ({ initMock: vi.fn() }));

vi.mock("@sentry/react", async (importOriginal) => {
  const real = await importOriginal<typeof import("@sentry/react")>();
  return { ...real, init: initMock };
});

import { iniciarSentryWeb, LimiteErroresSentry, PantallaErrorInesperado, sentryWebEstaHabilitado } from "./sentry";

function ComponenteQueFalla(): never {
  throw new Error("boom de prueba");
}

describe("iniciarSentryWeb", () => {
  beforeEach(() => {
    initMock.mockClear();
  });

  it("sin VITE_SENTRY_DSN no llama Sentry.init (no-op total)", () => {
    const resultado = iniciarSentryWeb({});
    expect(resultado).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
    expect(sentryWebEstaHabilitado()).toBe(false);
  });

  it("con VITE_SENTRY_DSN llama Sentry.init", () => {
    const resultado = iniciarSentryWeb({ VITE_SENTRY_DSN: "https://clave@o0.ingest.sentry.io/1", MODE: "production" });
    expect(resultado).toBe(true);
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(sentryWebEstaHabilitado()).toBe(true);
  });
});

describe("PantallaErrorInesperado (fallback en español)", () => {
  it("muestra el mensaje en español y un botón de reintentar", () => {
    render(<PantallaErrorInesperado resetError={() => {}} />);
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });
});

describe("LimiteErroresSentry (ErrorBoundary)", () => {
  beforeEach(() => {
    // Silencia el `console.error` ruidoso que React emite al capturar el
    // error deliberado del boundary en este test.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("atrapa el error de un hijo y muestra el fallback en español, en vez de una pantalla en blanco", () => {
    render(
      <LimiteErroresSentry>
        <ComponenteQueFalla />
      </LimiteErroresSentry>,
    );
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
  });

  it("no afecta el render normal cuando no hay ningún error", () => {
    render(
      <LimiteErroresSentry>
        <p>contenido normal</p>
      </LimiteErroresSentry>,
    );
    expect(screen.getByText("contenido normal")).toBeInTheDocument();
    expect(screen.queryByText("Algo salió mal")).not.toBeInTheDocument();
  });

  it("el botón de reintentar del fallback existe y es clicable sin lanzar", () => {
    render(
      <LimiteErroresSentry>
        <ComponenteQueFalla />
      </LimiteErroresSentry>,
    );
    const boton = screen.getByRole("button", { name: /reintentar/i });
    expect(() => fireEvent.click(boton)).not.toThrow();
  });
});

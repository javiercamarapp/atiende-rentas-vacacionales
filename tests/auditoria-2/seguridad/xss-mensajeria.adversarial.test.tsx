/**
 * Auditoría de seguridad independiente #2 — XSS en mensajería (apps/web).
 * Corre con `tests/auditoria-2/vitest.config.web.ts` (entorno jsdom +
 * plugin de React), separado del config "node" del resto de esta
 * auditoría (secretos-inyeccion.adversarial.test.ts) porque necesita JSX
 * + DOM real.
 *
 * Renderiza el componente REAL `HiloPage` (apps/web/src/pages/mensajeria/
 * HiloPage.tsx) — mismo patrón que HiloPage.test.tsx ya existente en ese
 * paquete — con contenido de huésped/borrador deliberadamente malicioso
 * (`<script>`, `<img onerror>`, `javascript:` en texto) y verifica el DOM
 * resultante: React escapa `{texto}` como nodo de texto siempre que no se
 * use `dangerouslySetInnerHTML`/`innerHTML` — confirmado por grep exhaustivo
 * (ningún archivo de apps/web/src usa esas APIs).
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HiloPage } from "../../../apps/web/src/pages/mensajeria/HiloPage";

const PAYLOAD_SCRIPT = "<script>window.__xss_script_ejecutado = true;</script>";
const PAYLOAD_IMG_ONERROR = '<img src=x onerror="window.__xss_img_ejecutado = true">';

const hiloMalicioso = {
  id: "c1",
  unidadId: "u1",
  unidadNombre: "Casa Sol",
  canalCodigo: "airbnb" as const,
  ultimoMensajeEn: null,
  borradoresPendientes: 1,
  mensajes: [
    {
      id: "m1",
      conversacionId: "c1",
      direccion: "entrante" as const,
      origen: "manual" as const,
      texto: PAYLOAD_SCRIPT,
      redactado: false,
      creadoEn: "2026-10-01T10:00:00.000Z",
    },
    {
      id: "m2",
      conversacionId: "c1",
      direccion: "entrante" as const,
      origen: "manual" as const,
      texto: PAYLOAD_IMG_ONERROR,
      redactado: false,
      creadoEn: "2026-10-01T10:00:01.000Z",
    },
  ],
  borradores: [
    {
      id: "b1",
      conversacionId: "c1",
      texto: PAYLOAD_SCRIPT,
      canalCodigo: "airbnb" as const,
      estado: "pendiente_aprobacion" as const,
      generadoPor: "motor_borrador" as const,
      redactado: false,
      aprobadoPor: null,
      rechazadoPor: null,
      motivoRechazo: null,
      creadoEn: "2026-10-01T10:01:00.000Z",
    },
  ],
};

vi.mock("../../../apps/web/src/pages/mensajeria/api", () => ({
  obtenerHilo: vi.fn(async (_id: string) => hiloMalicioso),
  aprobarBorrador: vi.fn(async () => ({ ...hiloMalicioso.borradores[0], estado: "enviado" })),
  rechazarBorrador: vi.fn(async () => ({ ...hiloMalicioso.borradores[0], estado: "rechazado" })),
  generarBorrador: vi.fn(async () => hiloMalicioso.borradores[0]),
  registrarMensajeEntrante: vi.fn(async () => ({ ...hiloMalicioso.mensajes[0], senalesEscalamiento: [] })),
}));

function renderHilo() {
  return render(
    <MemoryRouter initialEntries={["/mensajes/c1"]}>
      <Routes>
        <Route path="/mensajes/:id" element={<HiloPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("XSS — HiloPage (apps/web/src/pages/mensajeria/HiloPage.tsx) con texto de huésped/borrador malicioso", () => {
  it("NO REPRODUCIBLE — un <script> en el texto del huésped NUNCA se ejecuta: se renderiza como texto plano, no como elemento <script>", async () => {
    const { container } = renderHilo();
    await waitFor(() => expect(screen.getByText(/Casa Sol/i)).toBeInTheDocument());

    // El navegador (jsdom) jamás ejecuta un <script> insertado como texto
    // vía JSX {texto} — confirmamos además que NO existe ningún elemento
    // <script> real en el DOM (si `dangerouslySetInnerHTML` se hubiera
    // usado, sí existiría uno).
    expect(container.querySelector("script")).toBeNull();
    expect((window as unknown as { __xss_script_ejecutado?: boolean }).__xss_script_ejecutado).toBeUndefined();

    // El texto SÍ aparece, pero como cadena literal (React escapó `<`/`>`
    // al serializar a HTML) — confirma que se trató como DATO, nunca como
    // marcado.
    // PAYLOAD_SCRIPT aparece dos veces (mensaje entrante + borrador, ver
    // hiloMalicioso más abajo) — usamos getAllByText, no getByText.
    expect(screen.getAllByText(PAYLOAD_SCRIPT).length).toBeGreaterThanOrEqual(1);
    expect(container.innerHTML).toContain("&lt;script&gt;");
    expect(container.innerHTML).not.toContain("<script>");
  });

  it("NO REPRODUCIBLE — un <img onerror=...> en el texto del huésped no crea un <img> real ni dispara el handler onerror", async () => {
    const { container } = renderHilo();
    await waitFor(() => expect(screen.getByText(/Casa Sol/i)).toBeInTheDocument());

    expect(container.querySelector("img[onerror]")).toBeNull();
    expect((window as unknown as { __xss_img_ejecutado?: boolean }).__xss_img_ejecutado).toBeUndefined();
    expect(screen.getByText(PAYLOAD_IMG_ONERROR)).toBeInTheDocument();
  });

  it("NO REPRODUCIBLE — el mismo payload en un BORRADOR generado por el agente tampoco se ejecuta (misma ruta de render, <p> con {texto})", async () => {
    const { container } = renderHilo();
    await waitFor(() => expect(screen.getByText(/Casa Sol/i)).toBeInTheDocument());
    // El borrador (b1) usa el mismo PAYLOAD_SCRIPT — confirma que
    // aparece dos veces en el documento (una por mensaje, una por
    // borrador) y en ninguna se convierte en <script> real.
    const apariciones = screen.getAllByText(PAYLOAD_SCRIPT);
    expect(apariciones.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });
});

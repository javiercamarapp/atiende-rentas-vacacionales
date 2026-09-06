import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FacturacionPage } from "./FacturacionPage";

const obtenerSuscripcionMock = vi.fn();
const obtenerMrrEstimadoMock = vi.fn();
let usuarioMock: { rol: string } | null = { rol: "admin_gestora" };

vi.mock("../../lib/sesion/SesionProvider", () => ({
  useSesion: () => ({ usuario: usuarioMock }),
}));

vi.mock("./api", () => ({
  obtenerSuscripcion: () => obtenerSuscripcionMock(),
  obtenerMrrEstimado: () => obtenerMrrEstimadoMock(),
  iniciarCheckout: vi.fn(),
  obtenerPortal: vi.fn(),
}));

function suscripcionDePrueba() {
  return {
    estado: "prueba" as const,
    planCodigo: "esencial",
    addOnsActivos: [],
    inicioPeriodoPruebaEn: "2026-09-01T00:00:00.000Z",
    finPeriodoPruebaEn: "2026-09-15T00:00:00.000Z",
    proximaRenovacionEn: null,
    proveedorPago: null,
    uso: { unidadesActivas: 2, mensajesIaMes: 10, cuentasCanal: 1 },
    desglose: {
      planCodigo: "esencial",
      unidadesFacturadas: 2,
      lineasEscalon: [{ hastaUnidades: 5, unidades: 2, precioCentavosPorUnidad: 3500, subtotalCentavos: 7000 }],
      subtotalUnidadesCentavos: 7000,
      lineasAddOns: [],
      subtotalAddOnsCentavos: 0,
      totalCentavos: 7000,
      moneda: "USD" as const,
    },
    plan: { nombre: "Esencial", etiquetaPrecio: "borrador_comercial", limites: {} },
  };
}

describe("FacturacionPage (Lote 3.3, RV16)", () => {
  it("muestra el estado, el uso y el desglose con la marca de agua de borrador comercial", async () => {
    usuarioMock = { rol: "admin_gestora" };
    obtenerSuscripcionMock.mockResolvedValue(suscripcionDePrueba());
    render(<FacturacionPage />);

    expect(await screen.findByText("Esencial")).toBeInTheDocument();
    expect(screen.getByText("En prueba")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // unidades activas
    expect(screen.getByText(/borrador comercial/i)).toBeInTheDocument();
    expect(screen.getByText(/Total estimado del periodo: \$70\.00 USD/)).toBeInTheDocument();
  });

  it("NO muestra la sección de MRR a un admin_gestora (solo Superadmin)", async () => {
    usuarioMock = { rol: "admin_gestora" };
    obtenerSuscripcionMock.mockResolvedValue(suscripcionDePrueba());
    render(<FacturacionPage />);
    await screen.findByText("Esencial");
    expect(screen.queryByText(/MRR — vista de Superadmin/i)).not.toBeInTheDocument();
  });

  it("SÍ muestra la sección de MRR (etiquetada 'estimación') a un Superadmin", async () => {
    usuarioMock = { rol: "superadmin" };
    obtenerSuscripcionMock.mockResolvedValue(suscripcionDePrueba());
    obtenerMrrEstimadoMock.mockResolvedValue({
      etiqueta: "estimacion",
      mrrCentavos: 350000,
      moneda: "USD",
      tenantsActivosContados: 5,
      calculadoEn: "2026-09-06T00:00:00.000Z",
    });
    render(<FacturacionPage />);

    expect(await screen.findByText(/MRR — vista de Superadmin/i)).toBeInTheDocument();
    expect(await screen.findByText("$3500.00 USD")).toBeInTheDocument();
    expect(screen.getByText("estimación")).toBeInTheDocument();
    expect(screen.getByText(/5 tenant\(s\) con suscripción activa/)).toBeInTheDocument();
  });
});

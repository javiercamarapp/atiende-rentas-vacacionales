import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentesPage } from "./AgentesPage";

const establecerFlagAgente = vi.fn(async (_id: string, _cuerpo: { valor: boolean; motivo: string }) => ({
  ok: true,
  flagId: "agentes.habilitado",
  valor: true,
  tenantId: null,
}));

const FLAG_INACTIVO = {
  id: "agentes.habilitado",
  descripcion: "Habilita la superficie de automatización agéntica para un tenant.",
  categoriaRiesgo: "operativo",
  valorGlobal: false,
  valorEfectivo: false,
  overrideDeTenant: false,
};

vi.mock("./api", () => ({
  listarFlagsAgentes: vi.fn(async () => ({ flags: [FLAG_INACTIVO] })),
  establecerFlagAgente: (id: string, cuerpo: { valor: boolean; motivo: string }) => establecerFlagAgente(id, cuerpo),
  auditoriaFlagAgente: vi.fn(async () => ({
    entradas: [
      {
        flagId: "agentes.habilitado",
        valor: true,
        actor: "usuario-admin-1",
        motivo: "piloto para este tenant",
        valorAnterior: false,
        en: "2026-09-01T00:00:00.000Z",
      },
    ],
  })),
  listarToolsAgentes: vi.fn(async () => ({
    tools: [
      {
        nombre: "mensajeria_proponer_borrador",
        descripcion: "Propone un borrador de respuesta al mensaje entrante del huésped.",
        efecto: "propuesta_aprobacion",
        requiereLlm: true,
        maxLlamadasPorConversacion: 5,
        rolesPermitidos: ["superadmin", "admin_gestora", "operador", "propietario"],
        nivelesColaboradorPermitidos: ["acceso_total", "calendario_mensajeria"],
      },
      {
        nombre: "inventario_consultar_disponibilidad",
        descripcion: "Consulta la disponibilidad de la unidad en curso.",
        efecto: "lectura",
        requiereLlm: false,
        maxLlamadasPorConversacion: 10,
        rolesPermitidos: ["superadmin", "admin_gestora", "operador", "propietario"],
        nivelesColaboradorPermitidos: null,
      },
    ],
  })),
  obtenerCuotaAgente: vi.fn(async () => ({
    tenantId: "t1",
    techoTokensPeriodo: 100000,
    techoLlamadasPeriodo: 500,
    tokensRestantes: 87000,
    llamadasRestantes: 480,
    periodoIniciaEn: "2026-09-01T00:00:00.000Z",
  })),
  listarTrazasAgentes: vi.fn(async () => ({
    trazas: [
      {
        id: "tr1",
        actorId: "usuario-1",
        rolActor: "operador",
        conversationId: "conv-1",
        canal: "airbnb",
        toolNombre: "inventario_consultar_disponibilidad",
        resultado: "ok",
        duracionMs: 120,
        modeloReal: null,
        costoUsdReal: 0,
        creadoEn: "2026-09-05T10:00:00.000Z",
      },
    ],
  })),
}));

let usuarioMock: { rol: string; colaboradorNivel: string | null } | null = { rol: "admin_gestora", colaboradorNivel: null };
vi.mock("../../lib/sesion/SesionProvider", () => ({
  useSesion: () => ({ usuario: usuarioMock, autenticado: usuarioMock !== null, cargandoInicial: false, login: vi.fn(), logout: vi.fn() }),
}));

/**
 * Componente (Auditoría 2, corrección P-01): antes de esta corrección no
 * existía ninguna página para el flag `agentes.habilitado`, el catálogo de
 * tools, la cuota ni las trazas — el ítem de menú quedaba deshabilitado
 * para siempre pese a un backend completo.
 */
describe("AgentesPage — corrección P-01 (producto-ux-operacion.md)", () => {
  it("muestra el banner de aprobación humana obligatoria y sin cancelación/contacto directo", async () => {
    usuarioMock = { rol: "admin_gestora", colaboradorNivel: null };
    render(<AgentesPage />);
    expect(
      screen.getByText(/requiere aprobación humana explícita/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/ninguna tool de este catálogo puede cancelar una reserva ni contactar/i)).toBeInTheDocument();
  });

  it("muestra el flag agentes.habilitado como inactivo por defecto", async () => {
    usuarioMock = { rol: "admin_gestora", colaboradorNivel: null };
    render(<AgentesPage />);
    await waitFor(() => expect(screen.getByText(/Inactivo \(default-off\)/i)).toBeInTheDocument());
  });

  it("admin_gestora puede ver el control para activar el flag con motivo obligatorio", async () => {
    usuarioMock = { rol: "admin_gestora", colaboradorNivel: null };
    render(<AgentesPage />);
    await waitFor(() => expect(screen.getByText(/Inactivo \(default-off\)/i)).toBeInTheDocument());
    const boton = screen.getByRole("button", { name: /^activar$/i });
    expect(boton).toBeDisabled(); // sin motivo todavía
    fireEvent.change(screen.getByPlaceholderText(/piloto habilitado/i), { target: { value: "piloto Q3" } });
    expect(boton).toBeEnabled();
    fireEvent.click(boton);
    await waitFor(() => expect(establecerFlagAgente).toHaveBeenCalledWith("agentes.habilitado", { valor: true, motivo: "piloto Q3" }));
  });

  it("un operador ve el estado del flag pero nunca el control para cambiarlo", async () => {
    usuarioMock = { rol: "operador", colaboradorNivel: "acceso_total" };
    render(<AgentesPage />);
    await waitFor(() => expect(screen.getByText(/Inactivo \(default-off\)/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^activar$/i })).not.toBeInTheDocument();
  });

  it("lista el catálogo de tools con su efecto y roles permitidos", async () => {
    usuarioMock = { rol: "admin_gestora", colaboradorNivel: null };
    render(<AgentesPage />);
    await waitFor(() => expect(screen.getByText("mensajeria_proponer_borrador")).toBeInTheDocument());
    expect(screen.getByText(/Propuesta — requiere aprobación humana/i)).toBeInTheDocument();
    expect(screen.getAllByText(/superadmin, admin_gestora, operador, propietario/).length).toBeGreaterThan(0);
  });

  it("muestra la cuota de IA restante del tenant", async () => {
    usuarioMock = { rol: "admin_gestora", colaboradorNivel: null };
    render(<AgentesPage />);
    await waitFor(() => expect(screen.getByText("87,000")).toBeInTheDocument());
  });

  it("lista trazas de tool-calls sin ningún dato de contacto del huésped", async () => {
    usuarioMock = { rol: "admin_gestora", colaboradorNivel: null };
    render(<AgentesPage />);
    await waitFor(() => expect(screen.getByText("ok")).toBeInTheDocument());
    expect(screen.getAllByText("inventario_consultar_disponibilidad").length).toBeGreaterThan(0);
    expect(screen.queryByText(/@/)).not.toBeInTheDocument(); // sin email
  });
});

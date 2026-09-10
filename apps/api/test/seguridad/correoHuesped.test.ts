import { describe, expect, it } from "vitest";
import {
  correoAlertaPagoFallidoHuesped,
  correoConfirmacionReservaHuesped,
  correoRecordatorioCheckinHuesped,
  pareceCorreo,
} from "../../src/seguridad/correoHuesped.js";

const URL_PUBLICA = "https://midominio.example";

describe("pareceCorreo", () => {
  it("acepta valores con forma de correo", () => {
    expect(pareceCorreo("ana@example.com")).toBe(true);
    expect(pareceCorreo("  ana@example.com  ")).toBe(true);
  });

  it("rechaza teléfonos, texto libre, null/undefined y vacío", () => {
    expect(pareceCorreo("+52 55 1234 5678")).toBe(false);
    expect(pareceCorreo("no tiene arroba")).toBe(false);
    expect(pareceCorreo(null)).toBe(false);
    expect(pareceCorreo(undefined)).toBe(false);
    expect(pareceCorreo("")).toBe(false);
  });
});

describe("correoConfirmacionReservaHuesped", () => {
  it("arma asunto/textoPlano/html consistentes con los datos de la reserva", () => {
    const { asunto, textoPlano, html } = correoConfirmacionReservaHuesped(
      { nombreHuesped: "Ana", nombreUnidad: "Depa 3B", nombrePropiedad: "Torre Sol", checkIn: "2026-10-01", checkOut: "2026-10-05" },
      URL_PUBLICA,
    );
    expect(asunto).toContain("Depa 3B");
    expect(textoPlano).toContain("2026-10-01");
    expect(textoPlano).toContain("2026-10-05");
    expect(html).toContain("Depa 3B");
  });
});

describe("correoRecordatorioCheckinHuesped", () => {
  it("arma asunto/textoPlano/html consistentes con la reserva y la anticipación", () => {
    const { asunto, textoPlano, html } = correoRecordatorioCheckinHuesped(
      { nombreHuesped: "Ana", nombreUnidad: "Depa 3B", nombrePropiedad: "Torre Sol", checkIn: "2026-10-01", diasAntes: 1 },
      URL_PUBLICA,
    );
    expect(asunto).toContain("Depa 3B");
    expect(textoPlano).toContain("2026-10-01");
    expect(html).toContain("mañana");
  });
});

describe("correoAlertaPagoFallidoHuesped", () => {
  it("arma asunto/textoPlano/html consistentes con el monto y la reserva", () => {
    const { asunto, textoPlano, html } = correoAlertaPagoFallidoHuesped(
      { nombreHuesped: "Ana", nombreUnidad: "Depa 3B", nombrePropiedad: "Torre Sol", montoFormateado: "1,250.00 MXN", checkIn: "2026-10-01" },
      URL_PUBLICA,
    );
    expect(asunto).toContain("Depa 3B");
    expect(textoPlano).toContain("1,250.00 MXN");
    expect(html).toContain("1,250.00 MXN");
  });
});

import { describe, expect, it } from "vitest";
import { correoConfirmacionReservaHuespedHtml } from "../../src/seguridad/plantillasCorreo/confirmacionReservaHuesped.js";
import { correoRecordatorioCheckinHuespedHtml } from "../../src/seguridad/plantillasCorreo/recordatorioCheckinHuesped.js";
import { correoAlertaPagoFallidoHuespedHtml } from "../../src/seguridad/plantillasCorreo/alertaPagoFallidoHuesped.js";

const URL_PUBLICA = "https://midominio.example";
const XSS = `<script>alert('xss')</script>`;
const XSS_ESCAPADO = "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;";

describe("correoConfirmacionReservaHuespedHtml", () => {
  it("incluye unidad, propiedad y fechas de check-in/check-out", () => {
    const html = correoConfirmacionReservaHuespedHtml(
      { nombreHuesped: "Ana", nombreUnidad: "Depa 3B", nombrePropiedad: "Torre Sol", checkIn: "2026-10-01", checkOut: "2026-10-05" },
      URL_PUBLICA,
    );
    expect(html).toContain("Depa 3B");
    expect(html).toContain("Torre Sol");
    expect(html).toContain("2026-10-01");
    expect(html).toContain("2026-10-05");
    expect(html).toContain("Hola Ana,");
  });

  it("sin nombreHuesped usa un saludo genérico (nunca 'Hola null')", () => {
    const html = correoConfirmacionReservaHuespedHtml(
      { nombreHuesped: null, nombreUnidad: "Depa 3B", nombrePropiedad: "Torre Sol", checkIn: "2026-10-01", checkOut: "2026-10-05" },
      URL_PUBLICA,
    );
    expect(html).toContain("Hola,");
    expect(html).not.toContain("null");
  });

  it("escapa <script> incrustado en nombreHuesped/nombreUnidad/nombrePropiedad (XSS)", () => {
    const html = correoConfirmacionReservaHuespedHtml(
      { nombreHuesped: XSS, nombreUnidad: XSS, nombrePropiedad: XSS, checkIn: "2026-10-01", checkOut: "2026-10-05" },
      URL_PUBLICA,
    );
    expect(html).not.toContain(XSS);
    expect(html).toContain(XSS_ESCAPADO);
  });
});

describe("correoRecordatorioCheckinHuespedHtml", () => {
  it("frasea la anticipación: hoy / mañana / en N días", () => {
    const base = { nombreHuesped: "Ana", nombreUnidad: "Depa 3B", nombrePropiedad: "Torre Sol", checkIn: "2026-10-01" };
    expect(correoRecordatorioCheckinHuespedHtml({ ...base, diasAntes: 0 }, URL_PUBLICA)).toContain("hoy");
    expect(correoRecordatorioCheckinHuespedHtml({ ...base, diasAntes: 1 }, URL_PUBLICA)).toContain("mañana");
    expect(correoRecordatorioCheckinHuespedHtml({ ...base, diasAntes: 3 }, URL_PUBLICA)).toContain("en 3 días");
  });

  it("escapa <script> incrustado en los campos dinámicos (XSS)", () => {
    const html = correoRecordatorioCheckinHuespedHtml(
      { nombreHuesped: XSS, nombreUnidad: XSS, nombrePropiedad: XSS, checkIn: "2026-10-01", diasAntes: 1 },
      URL_PUBLICA,
    );
    expect(html).not.toContain(XSS);
    expect(html).toContain(XSS_ESCAPADO);
  });
});

describe("correoAlertaPagoFallidoHuespedHtml", () => {
  it("incluye el monto formateado, la unidad y la fecha de check-in", () => {
    const html = correoAlertaPagoFallidoHuespedHtml(
      { nombreHuesped: "Ana", nombreUnidad: "Depa 3B", nombrePropiedad: "Torre Sol", montoFormateado: "1,250.00 MXN", checkIn: "2026-10-01" },
      URL_PUBLICA,
    );
    expect(html).toContain("1,250.00 MXN");
    expect(html).toContain("Depa 3B");
    expect(html).toContain("2026-10-01");
  });

  it("escapa <script> incrustado en los campos dinámicos, incluido el monto (XSS)", () => {
    const html = correoAlertaPagoFallidoHuespedHtml(
      { nombreHuesped: XSS, nombreUnidad: XSS, nombrePropiedad: XSS, montoFormateado: XSS, checkIn: "2026-10-01" },
      URL_PUBLICA,
    );
    expect(html).not.toContain(XSS);
    expect(html).toContain(XSS_ESCAPADO);
  });
});

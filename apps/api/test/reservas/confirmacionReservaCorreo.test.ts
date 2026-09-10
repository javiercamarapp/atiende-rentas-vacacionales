import { describe, expect, it, vi } from "vitest";
import { enviarConfirmacionReservaHuesped } from "../../src/routes/reservas.js";
import type { CorreoAEnviar, InterfazCorreo } from "../../src/seguridad/correo.js";

/**
 * `enviarConfirmacionReservaHuesped` es best-effort: NUNCA debe lanzar
 * (ver comentario de cabecera en `routes/reservas.ts`) sin importar qué
 * falle — un fallo de correo/consulta nunca debe tumbar `POST /reservas`.
 */

function ejecutorFalso(rows: unknown[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

function correoFalso(): InterfazCorreo & { enviados: CorreoAEnviar[] } {
  const enviados: CorreoAEnviar[] = [];
  return {
    enviados,
    async enviar(correo: CorreoAEnviar) {
      enviados.push(correo);
    },
  };
}

const FILA_RESERVA = {
  nombre_unidad: "Depa 3B",
  nombre_propiedad: "Torre Sol",
  check_in: "2026-10-01",
  check_out: "2026-10-05",
};

describe("enviarConfirmacionReservaHuesped", () => {
  it("con un contacto que parece correo, envía el correo de confirmación con los datos de la reserva", async () => {
    const ejecutor = ejecutorFalso([FILA_RESERVA]);
    const correo = correoFalso();

    const resultado = await enviarConfirmacionReservaHuesped(ejecutor, correo, "https://web.example", {
      ocupacionId: "ocup-1",
      huespedNombre: "Ana",
      huespedContacto: "ana@example.com",
    });

    expect(resultado).toEqual({ enviado: true });
    expect(correo.enviados).toHaveLength(1);
    expect(correo.enviados[0]!.para).toBe("ana@example.com");
    expect(correo.enviados[0]!.asunto).toContain("Depa 3B");
    expect(correo.enviados[0]!.html).toContain("Torre Sol");
    expect(correo.enviados[0]!.html).toContain("2026-10-01");
  });

  it("con un contacto que NO parece correo (teléfono), no intenta enviar nada", async () => {
    const ejecutor = ejecutorFalso([FILA_RESERVA]);
    const correo = correoFalso();

    const resultado = await enviarConfirmacionReservaHuesped(ejecutor, correo, "https://web.example", {
      ocupacionId: "ocup-1",
      huespedNombre: "Ana",
      huespedContacto: "+52 55 1234 5678",
    });

    expect(resultado).toEqual({ enviado: false });
    expect(correo.enviados).toHaveLength(0);
    expect(ejecutor.query).not.toHaveBeenCalled();
  });

  it("sin huespedContacto, no intenta enviar nada", async () => {
    const ejecutor = ejecutorFalso([FILA_RESERVA]);
    const correo = correoFalso();

    const resultado = await enviarConfirmacionReservaHuesped(ejecutor, correo, "https://web.example", {
      ocupacionId: "ocup-1",
      huespedNombre: "Ana",
      huespedContacto: null,
    });

    expect(resultado).toEqual({ enviado: false });
    expect(correo.enviados).toHaveLength(0);
  });

  it("si la consulta de la reserva no encuentra la fila, no envía nada y no lanza", async () => {
    const ejecutor = ejecutorFalso([]);
    const correo = correoFalso();

    const resultado = await enviarConfirmacionReservaHuesped(ejecutor, correo, "https://web.example", {
      ocupacionId: "ocup-inexistente",
      huespedNombre: null,
      huespedContacto: "ana@example.com",
    });

    expect(resultado).toEqual({ enviado: false });
    expect(correo.enviados).toHaveLength(0);
  });

  it("best-effort: si la consulta SQL lanza, nunca propaga el error (nunca tumba POST /reservas)", async () => {
    const ejecutor = { query: vi.fn().mockRejectedValue(new Error("conexión perdida")) };
    const correo = correoFalso();

    await expect(
      enviarConfirmacionReservaHuesped(ejecutor, correo, "https://web.example", {
        ocupacionId: "ocup-1",
        huespedNombre: "Ana",
        huespedContacto: "ana@example.com",
      }),
    ).resolves.toEqual({ enviado: false });
  });

  it("best-effort: si correo.enviar lanza, nunca propaga el error (nunca tumba POST /reservas)", async () => {
    const ejecutor = ejecutorFalso([FILA_RESERVA]);
    const correo: InterfazCorreo = {
      async enviar() {
        throw new Error("Resend caído");
      },
    };

    await expect(
      enviarConfirmacionReservaHuesped(ejecutor, correo, "https://web.example", {
        ocupacionId: "ocup-1",
        huespedNombre: "Ana",
        huespedContacto: "ana@example.com",
      }),
    ).resolves.toEqual({ enviado: false });
  });
});

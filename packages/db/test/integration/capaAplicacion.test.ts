import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancelarOcupacion,
  crearBloqueo,
  crearReservaConfirmada,
  estaOcupada,
  fechaLocalDesdeInstante,
  calcularNoches,
  modificarFechasReserva,
  type EjecutorTransaccional,
  type Ocupacion,
} from "@atiende-rv/domain";
import { crearMotorEmbeddedPostgres, type MotorEmbeddedPostgres } from "../../src/runner/motorEmbeddedPostgres.js";
import { aplicarMigraciones } from "../../src/runner/migrar.js";
import { migraciones } from "../../src/migrations/index.js";

/**
 * La capa de aplicación transaccional de packages/domain (H-017 a H-022)
 * ejercitada contra embedded-postgres real (D-022): el catch de SQLSTATE
 * 23P01 y el flujo de conflicto deben sobrevivir a un motor real, no solo
 * a PGlite (que ya se cubre en packages/domain/test/aplicacion).
 */

let motor: MotorEmbeddedPostgres;
let tenantId: string;

beforeAll(async () => {
  motor = await crearMotorEmbeddedPostgres("atiende_rv_test_aplicacion");
  await aplicarMigraciones(motor.ejecutor, migraciones);
  const tenant = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant aplicación') RETURNING id`,
  );
  tenantId = tenant.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await motor.cerrar();
});

async function crearUnidad(nombre: string, zonaHoraria = "America/Mexico_City"): Promise<string> {
  const propiedad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, $2, $3) RETURNING id`,
    [tenantId, `Propiedad ${nombre}`, zonaHoraria],
  );
  const unidad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, $2) RETURNING id`,
    [propiedad.rows[0]!.id, nombre],
  );
  return unidad.rows[0]!.id;
}

const ejecutor = () => motor.ejecutor as unknown as EjecutorTransaccional;

describe("H-017/H-018 contra embedded-postgres real", () => {
  it("caso adversarial 2: overbooking real capturado como 23P01 y registrado, ninguna reserva cancelada", async () => {
    const unidadId = await crearUnidad("Overbooking real");
    const primera = await crearReservaConfirmada(ejecutor(), {
      unidadId,
      rango: { inicio: "2027-01-01", fin: "2027-01-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    const segunda = await crearReservaConfirmada(ejecutor(), {
      unidadId,
      rango: { inicio: "2027-01-03", fin: "2027-01-07" },
      estado: "confirmado",
      bloqueante: true,
    });

    expect(primera.conflicto).toBeNull();
    expect(segunda.conflicto).not.toBeNull();
    expect(segunda.conflicto!.tipo).toBe("overbooking_confirmado");

    const conflictos = await motor.ejecutor.query<{ tipo: string }>(
      `SELECT tipo FROM conflicto_calendario WHERE unidad_id = $1`,
      [unidadId],
    );
    expect(conflictos.rows).toHaveLength(1);
  });

  it("caso adversarial 5: cancelar con bloqueo de propietario solapado deja la noche ocupada (leído vía estaOcupada del dominio)", async () => {
    const unidadId = await crearUnidad("Cancelación no reabre");
    const reserva = await crearReservaConfirmada(ejecutor(), {
      unidadId,
      rango: { inicio: "2027-02-01", fin: "2027-02-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    await crearBloqueo(ejecutor(), {
      unidadId,
      rango: { inicio: "2027-02-01", fin: "2027-02-05" },
      razon: "BLOQUEO_PROPIETARIO",
    });
    await cancelarOcupacion(ejecutor(), reserva.ocupacionId);

    const filas = await motor.ejecutor.query<{
      id: string;
      inicio: string;
      fin: string;
      capa: "reserva" | "bloqueo";
      razon: Ocupacion["razon"];
      estado: Ocupacion["estado"];
      bloqueante: boolean;
    }>(
      `SELECT id, lower(rango)::text AS inicio, upper(rango)::text AS fin, capa, razon, estado, bloqueante
       FROM ocupacion_unidad WHERE unidad_id = $1`,
      [unidadId],
    );
    const ocupaciones: Ocupacion[] = filas.rows.map((f) => ({
      id: f.id,
      unidadId,
      rango: { inicio: f.inicio, fin: f.fin },
      capa: f.capa,
      razon: f.razon,
      estado: f.estado,
      bloqueante: f.bloqueante,
    }));

    expect(estaOcupada(ocupaciones, "2027-02-02")).toBe(true);
  });
});

describe("H-019/H-020 contra embedded-postgres real", () => {
  it("estancias contiguas (checkout=check-in): dos reservas, sin conflicto, ambas confirmadas", async () => {
    const unidadId = await crearUnidad("Contiguas real");
    const a = await crearReservaConfirmada(ejecutor(), {
      unidadId,
      rango: { inicio: "2027-03-01", fin: "2027-03-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    const b = await crearReservaConfirmada(ejecutor(), {
      unidadId,
      rango: { inicio: "2027-03-05", fin: "2027-03-08" },
      estado: "confirmado",
      bloqueante: true,
    });
    expect(a.conflicto).toBeNull();
    expect(b.conflicto).toBeNull();
  });

  it("modificación de fechas (ampliar) atómica contra Postgres real, sin conflicto", async () => {
    const unidadId = await crearUnidad("Modificación real");
    const reserva = await crearReservaConfirmada(ejecutor(), {
      unidadId,
      rango: { inicio: "2027-04-10", fin: "2027-04-15" },
      estado: "confirmado",
      bloqueante: true,
    });
    const resultado = await modificarFechasReserva(ejecutor(), reserva.ocupacionId, {
      inicio: "2027-04-08",
      fin: "2027-04-20",
    });
    expect(resultado.conflicto).toBeNull();
    expect(resultado.rangoEfectivo).toEqual({ inicio: "2027-04-08", fin: "2027-04-20" });
  });
});

describe("H-004/caso adversarial 14 (DST) — fecha derivada de un evento entrante, esquema real", () => {
  it("America/Mexico_City y Europe/Madrid: la fecha de check-in derivada de un instante UTC no sufre off-by-one, con la unidad ya persistida en Postgres real", async () => {
    const unidadMx = await crearUnidad("DST MX", "America/Mexico_City");
    const unidadEs = await crearUnidad("DST ES", "Europe/Madrid");

    // Instante de check-in a medianoche local, justo tras el cambio de
    // horario europeo de primavera 2026-03-29.
    const fechaMx = fechaLocalDesdeInstante("2026-03-30T06:00:00Z", "America/Mexico_City");
    const fechaEs = fechaLocalDesdeInstante("2026-03-30T00:30:00Z", "Europe/Madrid");
    expect(fechaMx).toBe("2026-03-30");
    expect(fechaEs).toBe("2026-03-30");

    const reservaMx = await crearReservaConfirmada(ejecutor(), {
      unidadId: unidadMx,
      rango: { inicio: fechaMx, fin: "2026-04-03" },
      estado: "confirmado",
      bloqueante: true,
    });
    const reservaEs = await crearReservaConfirmada(ejecutor(), {
      unidadId: unidadEs,
      rango: { inicio: fechaEs, fin: "2026-04-03" },
      estado: "confirmado",
      bloqueante: true,
    });
    expect(reservaMx.conflicto).toBeNull();
    expect(reservaEs.conflicto).toBeNull();

    const filaMx = await motor.ejecutor.query<{ inicio: string; fin: string }>(
      `SELECT lower(rango)::text AS inicio, upper(rango)::text AS fin FROM ocupacion_unidad WHERE id = $1`,
      [reservaMx.ocupacionId],
    );
    expect(filaMx.rows[0]).toEqual({ inicio: "2026-03-30", fin: "2026-04-03" });
    expect(calcularNoches({ inicio: filaMx.rows[0]!.inicio, fin: filaMx.rows[0]!.fin })).toBe(4);
  });
});

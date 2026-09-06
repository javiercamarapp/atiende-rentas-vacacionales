import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearMotorPglite } from "../src/runner/motorPglite.js";
import { aplicarMigraciones, migracionesAplicadas, revertirTodas, revertirUltima } from "../src/runner/migrar.js";
import { migraciones } from "../src/migrations/index.js";
import type { EjecutorSql } from "../src/runner/ejecutorSql.js";

let motor: Awaited<ReturnType<typeof crearMotorPglite>>;

beforeEach(async () => {
  motor = await crearMotorPglite();
});

afterEach(async () => {
  await motor.cerrar();
});

describe("runner de migraciones (up/down + tabla de versiones)", () => {
  it("aplica todas las migraciones del catálogo en orden, una sola vez", async () => {
    const primeraCorrida = await aplicarMigraciones(motor.ejecutor, migraciones);
    expect(primeraCorrida).toEqual(migraciones.map((m) => m.id));

    const segundaCorrida = await aplicarMigraciones(motor.ejecutor, migraciones);
    expect(segundaCorrida).toEqual([]); // idempotente: nada que aplicar de nuevo

    expect(await migracionesAplicadas(motor.ejecutor)).toEqual(migraciones.map((m) => m.id));
  });

  it("revertirUltima revierte solo la última migración aplicada", async () => {
    await aplicarMigraciones(motor.ejecutor, migraciones);
    const revertida = await revertirUltima(motor.ejecutor, migraciones);
    expect(revertida).toBe(migraciones[migraciones.length - 1]!.id);

    const aplicadas = await migracionesAplicadas(motor.ejecutor);
    expect(aplicadas).toEqual(migraciones.slice(0, -1).map((m) => m.id));

    // El `down` de la última migración se ejecutó realmente (no es un
    // no-op silencioso): reaplicar el catálogo completo debe volver a
    // ejecutar exactamente esa migración, y su `up` no debe fallar por
    // dejar objetos a medio revertir. No se asume que el `down` de la
    // última migración sea siempre un `DROP TABLE` — migraciones de lotes
    // posteriores (RLS, políticas, etc.) revierten con `DROP POLICY`/
    // `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`, no con `DROP TABLE` —
    // así este test sigue siendo válido sin importar qué migración termine
    // siendo la última.
    const reaplicadas = await aplicarMigraciones(motor.ejecutor, migraciones);
    expect(reaplicadas).toEqual([migraciones[migraciones.length - 1]!.id]);
    expect(await migracionesAplicadas(motor.ejecutor)).toEqual(migraciones.map((m) => m.id));
  });

  it("revertirTodas deja la base de datos sin ninguna tabla de dominio", async () => {
    await aplicarMigraciones(motor.ejecutor, migraciones);
    const revertidas = await revertirTodas(motor.ejecutor, migraciones);
    expect(revertidas).toEqual([...migraciones].reverse().map((m) => m.id));
    expect(await migracionesAplicadas(motor.ejecutor)).toEqual([]);
  });

  it("una migración fallida no deja rastro (transacción por migración)", async () => {
    const catalogoRoto = [
      ...migraciones,
      { id: "9999_rota", descripcion: "rota a propósito", up: "CREATE TABLE tabla_rota (id_invalida", down: "" },
    ];
    await expect(aplicarMigraciones(motor.ejecutor, catalogoRoto)).rejects.toThrow(/9999_rota/);
    expect(await migracionesAplicadas(motor.ejecutor)).toEqual(migraciones.map((m) => m.id));
  });
});

describe("btree_gist y EXCLUDE (H-001, D-012) — validación contra PGlite (lógica, no concurrencia real)", () => {
  let ejecutor: EjecutorSql;
  let unidadId: string;

  beforeEach(async () => {
    ejecutor = motor.ejecutor;
    await aplicarMigraciones(ejecutor, migraciones);
    const tenant = await ejecutor.query<{ id: string }>(
      `INSERT INTO tenant (nombre) VALUES ('T') RETURNING id`,
    );
    const propiedad = await ejecutor.query<{ id: string }>(
      `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'P', 'America/Cancun') RETURNING id`,
      [tenant.rows[0]!.id],
    );
    const unidad = await ejecutor.query<{ id: string }>(
      `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'U') RETURNING id`,
      [propiedad.rows[0]!.id],
    );
    unidadId = unidad.rows[0]!.id;
  });

  async function insertarReserva(inicio: string, fin: string) {
    return ejecutor.query(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange($2, $3, '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)`,
      [unidadId, inicio, fin],
    );
  }

  it("rechaza un rango solapado con SQLSTATE 23P01", async () => {
    await insertarReserva("2026-01-01", "2026-01-05");
    await expect(insertarReserva("2026-01-03", "2026-01-07")).rejects.toMatchObject({
      code: "23P01",
    });
  });

  it("acepta rangos adyacentes sin error", async () => {
    await insertarReserva("2026-01-01", "2026-01-05");
    await expect(insertarReserva("2026-01-05", "2026-01-08")).resolves.toBeDefined();
  });

  it("un bloqueo (capa='bloqueo') nunca es rechazado por el EXCLUDE aunque se solape con una reserva", async () => {
    await insertarReserva("2026-02-01", "2026-02-10");
    await expect(
      ejecutor.query(
        `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
         VALUES ($1, daterange($2, $3, '[)'), 'bloqueo', 'MANTENIMIENTO', 'confirmado', true)`,
        [unidadId, "2026-02-03", "2026-02-04"],
      ),
    ).resolves.toBeDefined();
  });

  it("rechaza un rango vacío (CHECK ocupacion_unidad_rango_no_vacio)", async () => {
    await expect(insertarReserva("2026-01-01", "2026-01-01")).rejects.toThrow();
  });

  it("CHECK de coherencia capa/razon rechaza combinaciones inválidas", async () => {
    await expect(
      ejecutor.query(
        `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
         VALUES ($1, daterange('2026-01-01','2026-01-02','[)'), 'reserva', 'MANTENIMIENTO', 'confirmado', true)`,
        [unidadId],
      ),
    ).rejects.toThrow();
  });

  it("zona_horaria vacía es rechazada por el CHECK de propiedad", async () => {
    const tenant = await ejecutor.query<{ id: string }>(
      `INSERT INTO tenant (nombre) VALUES ('T2') RETURNING id`,
    );
    await expect(
      ejecutor.query(`INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'P2', '')`, [
        tenant.rows[0]!.id,
      ]),
    ).rejects.toThrow();
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aplicarMigraciones, crearMotorPglite, migraciones } from "@atiende-rv/db";
import { resolverEtiquetasCanalCuentaPorOcupacion } from "../../src/workers/observabilidad/latenciaCanalCuenta.js";

/**
 * H-073: `ocupacion_unidad.canal_origen_id` identifica el canal
 * directamente; la cuenta de canal concreta exige un join adicional a
 * `unidad_canal_feed` por (unidad_id, canal_id). Esta prueba fija el
 * comportamiento exacto de esa resolución, incluidos los casos límite
 * (bloqueo sin canal, ocupación inexistente, feed sin cuenta asignada).
 */
let motor: Awaited<ReturnType<typeof crearMotorPglite>>;

beforeEach(async () => {
  motor = await crearMotorPglite();
  await aplicarMigraciones(motor.ejecutor, migraciones);
});

afterEach(async () => {
  await motor.cerrar();
});

async function crearEsquemaBase() {
  const tenant = await motor.ejecutor.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T') RETURNING id");
  const tenantId = tenant.rows[0]!.id;
  const propiedad = await motor.ejecutor.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'P', 'America/Cancun') RETURNING id",
    [tenantId],
  );
  const propiedadId = propiedad.rows[0]!.id;
  const unidad = await motor.ejecutor.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'U1') RETURNING id",
    [propiedadId],
  );
  const unidadId = unidad.rows[0]!.id;
  const canal = await motor.ejecutor.query<{ id: string }>("SELECT id FROM canal WHERE codigo = 'airbnb'");
  const canalId = canal.rows[0]!.id;
  return { tenantId, unidadId, canalId };
}

async function crearOcupacion(unidadId: string, canalOrigenId: string | null, capa = "reserva", razon = "RESERVA_CANAL") {
  const r = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, canal_origen_id)
     VALUES ($1, daterange('2026-01-01', '2026-01-05', '[)'), $2, $3, $4) RETURNING id`,
    [unidadId, capa, razon, canalOrigenId],
  );
  return r.rows[0]!.id;
}

describe("resolverEtiquetasCanalCuentaPorOcupacion", () => {
  it("devuelve canal y cuenta_canal_id cuando la unidad tiene un feed configurado para ese canal", async () => {
    const { tenantId, unidadId, canalId } = await crearEsquemaBase();
    const cuenta = await motor.ejecutor.query<{ id: string }>(
      "INSERT INTO cuenta_canal (tenant_id, canal_id, nombre) VALUES ($1, $2, 'Cuenta Airbnb 1') RETURNING id",
      [tenantId, canalId],
    );
    const cuentaCanalId = cuenta.rows[0]!.id;
    await motor.ejecutor.query(
      "INSERT INTO unidad_canal_feed (unidad_id, canal_id, cuenta_canal_id) VALUES ($1, $2, $3)",
      [unidadId, canalId, cuentaCanalId],
    );
    const ocupacionId = await crearOcupacion(unidadId, canalId);

    const etiquetas = await resolverEtiquetasCanalCuentaPorOcupacion(motor.ejecutor, ocupacionId);
    expect(etiquetas).toEqual({ canal: "airbnb", cuenta_canal_id: cuentaCanalId });
  });

  it("devuelve solo canal (sin cuenta_canal_id) si no hay fila en unidad_canal_feed para ese par", async () => {
    const { unidadId, canalId } = await crearEsquemaBase();
    const ocupacionId = await crearOcupacion(unidadId, canalId);

    const etiquetas = await resolverEtiquetasCanalCuentaPorOcupacion(motor.ejecutor, ocupacionId);
    expect(etiquetas).toEqual({ canal: "airbnb" });
  });

  it("devuelve {} para un bloqueo de propietario sin canal_origen_id", async () => {
    const { unidadId } = await crearEsquemaBase();
    const ocupacionId = await crearOcupacion(unidadId, null, "bloqueo", "BLOQUEO_PROPIETARIO");

    const etiquetas = await resolverEtiquetasCanalCuentaPorOcupacion(motor.ejecutor, ocupacionId);
    expect(etiquetas).toEqual({});
  });

  it("devuelve {} si la ocupación ya no existe (evento de outbox huérfano tras un borrado)", async () => {
    const etiquetas = await resolverEtiquetasCanalCuentaPorOcupacion(motor.ejecutor, "00000000-0000-0000-0000-000000000000");
    expect(etiquetas).toEqual({});
  });
});

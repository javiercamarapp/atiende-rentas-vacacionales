import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBloqueo, crearReservaConfirmada, type EjecutorTransaccional } from "@atiende-rv/domain";
import { aplicarMigraciones, crearMotorEmbeddedPostgres, migraciones, type MotorEmbeddedPostgres } from "@atiende-rv/db";

/**
 * D-nn — auditoría dominio/sincronización/datos (fase 2).
 *
 * Hipótesis: D-002/BLUEPRINT §3.2 prometen que TODO solapamiento entre
 * capas ("reserva vs. bloqueo" o "bloqueo vs. bloqueo") se detecta y se
 * inserta en `conflicto_calendario` (tipo='capa_cruzada'), sin importar el
 * ORDEN de inserción. El ejemplo motivador citado en RV07 §7/D-002 es
 * "reserva ya existe, bloqueo de mantenimiento la solapa después" — ESE
 * caso sí está cubierto: `crearBloqueo` (packages/domain/src/aplicacion/
 * reservas.ts líneas 222-248) consulta explícitamente TODAS las filas
 * activas solapadas (de cualquier capa) tras insertar y crea
 * `conflicto_calendario` por cada una.
 *
 * Pero `crearReservaConfirmada` (mismo archivo, líneas 59-184) NO tiene el
 * equivalente: su único mecanismo de detección de conflicto es capturar la
 * excepción `23P01` del `EXCLUDE`, que SOLO dispara entre dos filas
 * `capa='reserva', bloqueante=true` — nunca entre una reserva y un bloqueo
 * (`capa='bloqueo'` nunca participa del EXCLUDE, por diseño, D-002). Por
 * tanto, si el BLOQUEO ya existe primero y la RESERVA llega después (el
 * caso más común en producción real: casi todas las reservas entran vía
 * `ejecutarCicloImport`, mientras que los bloqueos de propietario se crean
 * manualmente y con mucha menor frecuencia), el INSERT de la reserva tiene
 * éxito sin ninguna excepción de BD y sin ninguna verificación de
 * solapamiento cruzado — CERO fila en `conflicto_calendario`, CERO alerta.
 *
 * Esto es la dirección inversa, no cubierta, del ejemplo motivador de
 * D-002/RV07 §7 — y es la dirección que ocurre en el flujo real más común
 * (sincronización de canal creando una reserva sobre una unidad que ya
 * tiene un bloqueo del propietario o de mantenimiento).
 */

let motor: MotorEmbeddedPostgres;
let ejecutor: EjecutorTransaccional;
let tenantId: string;

beforeAll(async () => {
  motor = await crearMotorEmbeddedPostgres("atiende_rv_auditoria2_capa_cruzada");
  await aplicarMigraciones(motor.ejecutor, migraciones);
  ejecutor = motor.ejecutor as unknown as EjecutorTransaccional;
  const tenant = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant auditoria-2 capa cruzada') RETURNING id`,
  );
  tenantId = tenant.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await motor.cerrar();
});

async function crearUnidad(nombre: string): Promise<string> {
  const propiedad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, $2, 'America/Mexico_City') RETURNING id`,
    [tenantId, `Propiedad ${nombre}`],
  );
  const unidad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, $2) RETURNING id`,
    [propiedad.rows[0]!.id, nombre],
  );
  return unidad.rows[0]!.id;
}

async function contarConflictosCapaCruzada(unidadId: string): Promise<number> {
  const fila = await motor.ejecutor.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM conflicto_calendario WHERE unidad_id = $1 AND tipo = 'capa_cruzada'`,
    [unidadId],
  );
  return Number(fila.rows[0]!.n);
}

describe("D-nn — asimetría de detección de conflicto capa cruzada (bloqueo antes, reserva después)", () => {
  it("bloqueo de mantenimiento existente + reserva de canal que lo solapa después: NO genera conflicto ni alerta", async () => {
    const unidadId = await crearUnidad("capa-cruzada-asimetria");

    // 1) Bloqueo de mantenimiento ya existe.
    await crearBloqueo(ejecutor, {
      unidadId,
      rango: { inicio: "2027-09-01", fin: "2027-09-10" },
      razon: "MANTENIMIENTO",
    });

    // 2) Llega (vía sync) una reserva confirmada de canal que se solapa
    // completamente con el bloqueo de mantenimiento ya existente.
    const resultado = await crearReservaConfirmada(ejecutor, {
      unidadId,
      rango: { inicio: "2027-09-03", fin: "2027-09-06" },
      estado: "confirmado",
      bloqueante: true,
      canalOrigenId: null,
      externalId: "reserva-solapa-mantenimiento@canal-externo.com",
    });

    // El INSERT de la reserva tiene éxito sin excepción (bloqueo no
    // participa del EXCLUDE) — la función ni siquiera reporta el
    // solapamiento en su resultado.
    expect(resultado.conflicto).toBeNull();

    // Comportamiento PROMETIDO por D-002/BLUEPRINT §3.2 ("toda la
    // combinación reserva/bloqueo o bloqueo/bloqueo que se solape debe
    // producir una fila en conflicto_calendario tipo='capa_cruzada'"):
    // debería haber exactamente 1 conflicto capa_cruzada registrado.
    const conflictos = await contarConflictosCapaCruzada(unidadId);
    expect(conflictos).toBe(1);
  });
});

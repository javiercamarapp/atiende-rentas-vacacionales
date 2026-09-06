import { aplicarMigraciones, crearMotorPglite, migraciones } from "@atiende-rv/db";
import type { EjecutorTransaccional } from "../../src/aplicacion/ejecutor.js";

/**
 * Levanta un PGlite en memoria con el esquema completo aplicado (usa el
 * runner real de packages/db, no un fixture SQL paralelo — así las
 * pruebas de la capa de aplicación de packages/domain corren siempre
 * contra el mismo esquema versionado que produce packages/db). Devuelve
 * también un tenant/propiedad/unidad de prueba ya creados.
 */
export async function crearFixtureEsquema() {
  const { ejecutor, cerrar } = await crearMotorPglite();
  await aplicarMigraciones(ejecutor, migraciones);

  const tenant = await ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant de prueba') RETURNING id`,
  );
  const propiedad = await ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria)
     VALUES ($1, 'Propiedad de prueba', 'America/Mexico_City') RETURNING id`,
    [tenant.rows[0]!.id],
  );

  async function crearUnidad(nombre = "Unidad de prueba"): Promise<string> {
    const unidad = await ejecutor.query<{ id: string }>(
      `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, $2) RETURNING id`,
      [propiedad.rows[0]!.id, nombre],
    );
    return unidad.rows[0]!.id;
  }

  const unidadId = await crearUnidad();

  return {
    ejecutor: ejecutor as EjecutorTransaccional,
    propiedadId: propiedad.rows[0]!.id,
    unidadId,
    crearUnidad,
    cerrar,
  };
}

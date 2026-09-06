import { Hono } from "hono";
import type pg from "pg";
import { cancelarOcupacion, crearBloqueo, esRangoValido } from "@atiende-rv/domain";
import { CuerpoCrearBloqueo, ErrorDominio } from "../contrato/tipos.js";
import { conSesion } from "../db/contexto.js";
import { comoEjecutor } from "../db/ejecutorPg.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirEscrituraCalendario, exigirPuedeCancelar } from "../middleware/roles.js";
import { sesionDeAuth } from "../middleware/tenant.js";
import { traducirErrorDominio } from "./reservas.js";

export function crearRutasBloqueos(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // POST /bloqueos — propietario/mantenimiento/buffer (H-022). Nunca
  // rechazado por el EXCLUDE de base de datos (capa='bloqueo'); cualquier
  // solape con otra fila activa se registra como conflicto_calendario
  // "capa_cruzada" en vez de bloquear la operación.
  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirEscrituraCalendario(auth);
    const cuerpo = CuerpoCrearBloqueo.parse(await c.req.json());
    if (!esRangoValido(cuerpo.rango)) {
      throw new ErrorDominio("rango_invalido", "El rango de fechas debe cumplir inicio < fin");
    }

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      try {
        return await crearBloqueo(comoEjecutor(cliente), {
          unidadId: cuerpo.unidadId,
          rango: cuerpo.rango,
          razon: cuerpo.razon,
        });
      } catch (error) {
        throw traducirErrorDominio(error);
      }
    });

    return c.json(
      {
        id: resultado.ocupacionId,
        unidadId: cuerpo.unidadId,
        rango: cuerpo.rango,
        razon: cuerpo.razon,
        conflictosCapaCruzada: resultado.conflictosCapaCruzada,
      },
      201,
    );
  });

  // DELETE /bloqueos/:id — cancela SOLO la fila de bloqueo (capa='bloqueo');
  // nunca reabre noches ocupadas por otra capa/razón (H-018): delega
  // enteramente en packages/domain, que ya garantiza esto por construcción
  // (la disponibilidad se deriva por OR sobre filas activas, nunca por un
  // flag que "liberar" explícitamente).
  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    exigirPuedeCancelar(auth);
    const id = c.req.param("id");

    await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query<{ capa: string }>(
        "SELECT capa FROM ocupacion_unidad WHERE id = $1",
        [id],
      );
      if (!rows[0] || rows[0].capa !== "bloqueo") {
        throw new ErrorDominio("recurso_no_encontrado", "Bloqueo no encontrado");
      }
      try {
        await cancelarOcupacion(comoEjecutor(cliente), id);
      } catch (error) {
        throw traducirErrorDominio(error);
      }
    });

    return c.body(null, 204);
  });

  return app;
}

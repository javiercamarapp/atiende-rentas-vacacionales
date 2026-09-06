import { Hono } from "hono";
import type pg from "pg";
import { cancelarOcupacion, crearReservaConfirmada, esRangoValido, modificarFechasReserva } from "@atiende-rv/domain";
import { CuerpoCrearReserva, CuerpoModificarReserva, ErrorDominio } from "../contrato/tipos.js";
import { conSesion } from "../db/contexto.js";
import { comoEjecutor } from "../db/ejecutorPg.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirEscrituraCalendario, exigirPuedeCancelar } from "../middleware/roles.js";
import { sesionDeAuth } from "../middleware/tenant.js";

/** D-006/D-011: la API nunca cancela ni modifica una reserva cuyo origen
 * sea un canal externo — solo reservas DIRECTAS (creadas por esta misma
 * API, `canal_origen_id` apuntando al canal catálogo 'manual', o NULL).
 * Verificado contra la fila real en base de datos en cada PATCH/cancelar,
 * nunca confiando en que el cliente "sabe" que es una reserva directa. */
async function exigirReservaDirecta(cliente: pg.PoolClient, ocupacionId: string): Promise<{ unidadId: string }> {
  const { rows } = await cliente.query<{ unidad_id: string; capa: string; canal_codigo: string | null }>(
    `SELECT o.unidad_id, o.capa, c.codigo AS canal_codigo
     FROM ocupacion_unidad o
     LEFT JOIN canal c ON c.id = o.canal_origen_id
     WHERE o.id = $1`,
    [ocupacionId],
  );
  const fila = rows[0];
  if (!fila || fila.capa !== "reserva") {
    throw new ErrorDominio("recurso_no_encontrado", "Reserva no encontrada");
  }
  if (fila.canal_codigo !== null && fila.canal_codigo !== "manual") {
    throw new ErrorDominio(
      "reserva_no_directa",
      "Esta reserva proviene de un canal externo — la API nunca cancela ni modifica reservas de canal",
    );
  }
  return { unidadId: fila.unidad_id };
}

export function crearRutasReservas(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // POST /reservas — crea una reserva DIRECTA (canal 'manual'), nunca una
  // reserva "de canal": esas solo las crea el worker de sync (Lote 2).
  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirEscrituraCalendario(auth);
    const cuerpo = CuerpoCrearReserva.parse(await c.req.json());
    if (!esRangoValido(cuerpo.rango)) {
      throw new ErrorDominio("rango_invalido", "El rango de fechas debe cumplir inicio < fin");
    }

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const canalManual = await cliente.query<{ id: string }>("SELECT id FROM canal WHERE codigo = 'manual'");
      const canalManualId = canalManual.rows[0]?.id ?? null;

      let salida;
      try {
        salida = await crearReservaConfirmada(comoEjecutor(cliente), {
          unidadId: cuerpo.unidadId,
          rango: cuerpo.rango,
          estado: "confirmado",
          bloqueante: true,
          canalOrigenId: canalManualId,
          externalId: null,
        });
      } catch (error) {
        throw traducirErrorDominio(error);
      }

      if (salida.conflicto) {
        throw new ErrorDominio("unidad_no_disponible", "La unidad ya tiene una reserva confirmada en ese rango", {
          conflictoId: salida.conflicto.conflictoId,
        });
      }

      if (cuerpo.huespedNombre || cuerpo.huespedContacto) {
        // S-05: tenant_id se deriva SIEMPRE de la unidad reservada
        // (unidad_tenant_id, SECURITY DEFINER), nunca de un valor
        // declarado por el cliente — huesped_minimo tiene RLS FORCE desde
        // la migración 0093 y exige tenant_id NOT NULL.
        const huesped = await cliente.query<{ id: string }>(
          "INSERT INTO huesped_minimo (nombre, contacto, tenant_id) VALUES ($1, $2, unidad_tenant_id($3)) RETURNING id",
          [cuerpo.huespedNombre ?? null, cuerpo.huespedContacto ?? null, cuerpo.unidadId],
        );
        await cliente.query("UPDATE ocupacion_unidad SET huesped_minimo_id = $1 WHERE id = $2", [
          huesped.rows[0]!.id,
          salida.ocupacionId,
        ]);
      }

      return salida;
    });

    return c.json({ id: resultado.ocupacionId, unidadId: cuerpo.unidadId, rango: cuerpo.rango, estado: "confirmado" }, 201);
  });

  // PATCH /reservas/:id — solo directas (ver exigirReservaDirecta).
  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    exigirEscrituraCalendario(auth);
    const id = c.req.param("id");
    const cuerpo = CuerpoModificarReserva.parse(await c.req.json());
    if (!esRangoValido(cuerpo.rango)) {
      throw new ErrorDominio("rango_invalido", "El rango de fechas debe cumplir inicio < fin");
    }

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      await exigirReservaDirecta(cliente, id);
      try {
        return await modificarFechasReserva(comoEjecutor(cliente), id, cuerpo.rango);
      } catch (error) {
        throw traducirErrorDominio(error);
      }
    });

    if (resultado.conflicto) {
      throw new ErrorDominio("unidad_no_disponible", "La nueva fecha choca con otra reserva confirmada", {
        conflictoId: resultado.conflicto.conflictoId,
      });
    }

    return c.json({ id: resultado.ocupacionId, rango: resultado.rangoEfectivo });
  });

  // POST /reservas/:id/cancelar — solo directas; solo colaborador
  // 'acceso_total' (o admin/superadmin) puede cancelar (§Roles-1).
  app.post("/:id/cancelar", async (c) => {
    const auth = c.get("auth");
    exigirPuedeCancelar(auth);
    const id = c.req.param("id");

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      await exigirReservaDirecta(cliente, id);
      try {
        return await cancelarOcupacion(comoEjecutor(cliente), id);
      } catch (error) {
        throw traducirErrorDominio(error);
      }
    });

    return c.json({ id, estadoAnterior: resultado.estadoAnterior, estado: "cancelado" });
  });

  return app;
}

function traducirErrorDominio(error: unknown): ErrorDominio {
  if (error instanceof ErrorDominio) return error;
  // Lote 11B (D-ADV-01, docs/auditoria-2/defectos-adversarial.md): una
  // violación de RLS de Postgres en el propio INSERT (p. ej. `crearBloqueo`,
  // que a diferencia de `crearReservaConfirmada` no hace un SELECT previo
  // de la unidad) llega aquí como un error crudo de `pg` con
  // `code === "42501"` (insufficient_privilege) — nunca matcheaba ninguno
  // de los patrones de mensaje de abajo y caía al catch-all `error_interno`
  // (500). Se mapea a `recurso_no_encontrado` (404), NO a `tenant_forbidden`
  // (403) — mismo criterio ya usado por `POST /reservas` (Lote 3) para el
  // idéntico escenario cross-tenant vía el patrón `/no existe/`: 404 no
  // confirma ni niega que el recurso exista para el tenant ajeno (evita la
  // fuga de información de un 403 "existe pero no es tuyo"). El
  // aislamiento de datos en sí SIEMPRE fue correcto (0 filas escritas);
  // esto solo corrige la clasificación del error HTTP.
  const codigoSql = (error as { code?: unknown } | null)?.code;
  if (codigoSql === "42501") {
    return new ErrorDominio("recurso_no_encontrado", "Recurso no encontrado");
  }
  const mensaje = error instanceof Error ? error.message : "Error de dominio";
  if (/row-level security policy/i.test(mensaje)) {
    return new ErrorDominio("recurso_no_encontrado", "Recurso no encontrado");
  }
  if (/no existe/.test(mensaje)) return new ErrorDominio("recurso_no_encontrado", mensaje);
  if (/Rango inválido|inicio < fin|duración mínima/.test(mensaje)) return new ErrorDominio("rango_invalido", mensaje);
  if (/no se puede cancelar/.test(mensaje)) return new ErrorDominio("conflicto_pendiente", mensaje);
  return new ErrorDominio("error_interno", "No se pudo completar la operación");
}

export { traducirErrorDominio };

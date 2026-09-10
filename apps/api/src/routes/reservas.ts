import { Hono } from "hono";
import type pg from "pg";
import { cancelarOcupacion, crearReservaConfirmada, esRangoValido, modificarFechasReserva } from "@atiende-rv/domain";
import { CuerpoCrearReserva, CuerpoModificarReserva, ErrorDominio } from "../contrato/tipos.js";
import { conSesion } from "../db/contexto.js";
import { comoEjecutor } from "../db/ejecutorPg.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirEscrituraCalendario, exigirPuedeCancelar } from "../middleware/roles.js";
import { sesionDeAuth } from "../middleware/tenant.js";
import { correoConfirmacionReservaHuesped, pareceCorreo } from "../seguridad/correoHuesped.js";
import type { InterfazCorreo } from "../seguridad/correo.js";

/** Mínimo común para las consultas de solo lectura que necesita el correo
 * de confirmación — mismo criterio que `EjecutorConsultaMinimo` de
 * `workers/notificaciones/dispatcher.ts` (evita acoplar esta función a
 * `pg.PoolClient` concreto, así se puede probar con un fake sin Postgres). */
export interface EjecutorConsultaMinimoReservas {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface FilaReservaParaCorreo {
  nombre_unidad: string;
  nombre_propiedad: string;
  check_in: string;
  check_out: string;
}

/** Adaptador mínimo propio (en vez de `comoEjecutor`/`EjecutorTransaccional`
 * de `db/ejecutorPg.ts`, tipado a `FilaSql` — incompatible con el genérico
 * `<T>` de `EjecutorConsultaMinimoReservas`): mismo criterio de "adaptador
 * diminuto por caso de uso" que `ejecutorDeCliente` en
 * `workers/notificaciones/dispatcher.ts`/`rutas/internas/cronSync.ts`. */
function comoEjecutorMinimo(cliente: pg.PoolClient): EjecutorConsultaMinimoReservas {
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const resultado = await cliente.query(sql, params as unknown[] | undefined);
      return { rows: resultado.rows as T[] };
    },
  };
}

/**
 * Correo de confirmación de reserva al huésped (best-effort, D-huesped-01):
 * NUNCA debe tumbar `POST /reservas` — un fallo aquí (correo caído, dato
 * faltante) se registra y se traga, la reserva ya se creó y sigue siendo
 * válida sin importar si el correo salió o no. Solo se intenta cuando
 * `huespedContacto` PARECE un correo (`pareceCorreo`, `huesped_minimo.
 * contacto` es texto libre sin tipo — puede ser un teléfono) — no hay
 * ningún otro campo de "huésped no tiene correo" que consultar.
 */
export async function enviarConfirmacionReservaHuesped(
  ejecutor: EjecutorConsultaMinimoReservas,
  correo: InterfazCorreo,
  urlPublicaWeb: string,
  params: { ocupacionId: string; huespedNombre: string | null; huespedContacto: string | null | undefined },
): Promise<{ enviado: boolean }> {
  if (!pareceCorreo(params.huespedContacto)) return { enviado: false };
  try {
    const { rows } = await ejecutor.query<FilaReservaParaCorreo>(
      `SELECT u.nombre AS nombre_unidad, p.nombre AS nombre_propiedad,
              lower(o.rango)::text AS check_in, upper(o.rango)::text AS check_out
       FROM ocupacion_unidad o
       JOIN unidad u ON u.id = o.unidad_id
       JOIN propiedad p ON p.id = u.propiedad_id
       WHERE o.id = $1`,
      [params.ocupacionId],
    );
    const fila = rows[0];
    if (!fila) return { enviado: false };

    const { asunto, textoPlano, html } = correoConfirmacionReservaHuesped(
      {
        nombreHuesped: params.huespedNombre,
        nombreUnidad: fila.nombre_unidad,
        nombrePropiedad: fila.nombre_propiedad,
        checkIn: fila.check_in,
        checkOut: fila.check_out,
      },
      urlPublicaWeb,
    );
    await correo.enviar({ para: params.huespedContacto, asunto, textoPlano, html });
    return { enviado: true };
  } catch (error) {
    console.error(
      JSON.stringify({
        evento: "correo_confirmacion_reserva_fallo",
        ocupacionId: params.ocupacionId,
        mensaje: error instanceof Error ? error.message : String(error),
      }),
    );
    return { enviado: false };
  }
}

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

export interface DependenciasReservas {
  /** `InterfazCorreo`/`urlPublicaWeb` ya construidos por `app.ts`/`routes/
   * index.ts` para auth (`auth.correo`, `auth.urlPublicaWeb`) — se
   * reutilizan aquí tal cual para el correo de confirmación de reserva,
   * nunca un adaptador de correo aparte. */
  correo: InterfazCorreo;
  urlPublicaWeb: string;
}

export function crearRutasReservas(pool: pg.Pool, jwtSecret: string, deps: DependenciasReservas): Hono {
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

        // Best-effort, nunca bloquea ni revierte la reserva ya creada —
        // ver el comentario de cabecera de `enviarConfirmacionReservaHuesped`.
        await enviarConfirmacionReservaHuesped(comoEjecutorMinimo(cliente), deps.correo, deps.urlPublicaWeb, {
          ocupacionId: salida.ocupacionId,
          huespedNombre: cuerpo.huespedNombre ?? null,
          huespedContacto: cuerpo.huespedContacto ?? null,
        });
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

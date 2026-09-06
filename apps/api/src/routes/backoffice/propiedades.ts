import { Hono } from "hono";
import type pg from "pg";
import { validarZonaHorariaIana } from "@atiende-rv/domain";
import {
  CuerpoActualizarPropiedadBackoffice,
  CuerpoCrearPropiedadBackoffice,
  ErrorDominio,
} from "../../contrato/tipos.js";
import { conSesion, enTransaccion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exigirRol } from "../../middleware/roles.js";
import { ROLES_ADMIN } from "../../rolesComunes.js";
import { sesionDeAuth } from "../../middleware/tenant.js";
import { relanzarSiRlsRechazo, resolverTenantId } from "./comun.js";

interface FilaPropiedad {
  id: string;
  tenant_id: string;
  nombre: string;
  zona_horaria: string;
  moneda: string | null;
  direccion_linea1: string | null;
  direccion_ciudad: string | null;
  direccion_pais: string | null;
}

function serializar(f: FilaPropiedad) {
  return {
    id: f.id,
    tenantId: f.tenant_id,
    nombre: f.nombre,
    zonaHoraria: f.zona_horaria,
    moneda: f.moneda,
    direccion:
      f.direccion_linea1 || f.direccion_ciudad || f.direccion_pais
        ? { linea1: f.direccion_linea1, ciudad: f.direccion_ciudad, pais: f.direccion_pais }
        : null,
  };
}

const SELECT_PROPIEDAD =
  "SELECT id, tenant_id, nombre, zona_horaria, moneda, direccion_linea1, direccion_ciudad, direccion_pais FROM propiedad";

/**
 * CRUD de administración de propiedades (H-011): zona horaria IANA,
 * dirección mínima y moneda obligatorias en el alta — a diferencia de
 * `apps/api/src/routes/propiedades.ts` (Lote 3, alta mínima sin estos
 * campos), esta es la superficie completa de back office (E02 en su parte
 * de formulario CRUD, LOTES.md Lote 8). Un superadmin solo puede leer/
 * escribir propiedades de un tenant con concesión "romper cristal" vigente
 * (RLS, packages/db migración 0061) — `relanzarSiRlsRechazo` traduce ese
 * rechazo a un mensaje explícito.
 */
export function crearRutasBackofficePropiedades(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const tenantId = resolverTenantId(auth, c.req.query("tenantId"));

    const filas = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) => {
        const { rows } = await cliente.query<FilaPropiedad>(
          `${SELECT_PROPIEDAD} WHERE tenant_id = $1 ORDER BY creado_en DESC`,
          [tenantId],
        );
        return rows;
      }),
    );

    return c.json({ propiedades: filas.map(serializar) });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const cuerpo = CuerpoCrearPropiedadBackoffice.parse(await c.req.json());
    const tenantId = resolverTenantId(auth, cuerpo.tenantId);

    if (!validarZonaHorariaIana(cuerpo.zonaHoraria)) {
      throw new ErrorDominio("validacion", `Zona horaria IANA inválida: "${cuerpo.zonaHoraria}"`);
    }

    const fila = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) =>
        enTransaccion(cliente, async () => {
          const { rows } = await cliente.query<FilaPropiedad>(
            `INSERT INTO propiedad (tenant_id, nombre, zona_horaria, moneda, direccion_linea1, direccion_ciudad, direccion_pais)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, tenant_id, nombre, zona_horaria, moneda, direccion_linea1, direccion_ciudad, direccion_pais`,
            [
              tenantId,
              cuerpo.nombre,
              cuerpo.zonaHoraria,
              cuerpo.moneda,
              cuerpo.direccion.linea1,
              cuerpo.direccion.ciudad,
              cuerpo.direccion.pais,
            ],
          );
          return rows[0]!;
        }),
      ),
    );

    return c.json(serializar(fila), 201);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const id = c.req.param("id");
    const cuerpo = CuerpoActualizarPropiedadBackoffice.parse(await c.req.json());

    if (cuerpo.zonaHoraria && !validarZonaHorariaIana(cuerpo.zonaHoraria)) {
      throw new ErrorDominio("validacion", `Zona horaria IANA inválida: "${cuerpo.zonaHoraria}"`);
    }

    const fila = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) =>
        enTransaccion(cliente, async () => {
          // Auditoría 2, corrección D-DSD-07 (docs/auditoria-2/
          // dominio-sync-datos.md): cambiar zona_horaria de una propiedad
          // con `ocupacion_unidad` activas desplaza la interpretación de
          // cualquier instante UTC de canal futuro respecto a las fechas
          // de calendario ya persistidas (packages/domain/src/fechas.ts,
          // resolverFechaLocal usa la zona ACTUAL de la propiedad) — un
          // check-in/check-out puede correrse un día completo de forma
          // silenciosa. Se rechaza el cambio (409) mientras existan
          // reservas/bloqueos activos en cualquier unidad de la
          // propiedad, en vez de aceptarlo sin advertencia.
          if (cuerpo.zonaHoraria) {
            const actual = await cliente.query<{ zona_horaria: string }>(
              "SELECT zona_horaria FROM propiedad WHERE id = $1",
              [id],
            );
            if (actual.rows[0] && actual.rows[0].zona_horaria !== cuerpo.zonaHoraria) {
              const activas = await cliente.query<{ n: string }>(
                `SELECT count(*)::text AS n
                 FROM ocupacion_unidad ou
                 JOIN unidad u ON u.id = ou.unidad_id
                 WHERE u.propiedad_id = $1 AND ou.estado <> 'cancelado'`,
                [id],
              );
              const activasCount = Number(activas.rows[0]!.n);
              if (activasCount > 0) {
                throw new ErrorDominio(
                  "conflicto_pendiente",
                  `No se puede cambiar la zona horaria: hay ${activasCount} ocupación(es) activa(s) ` +
                    `(reservas/bloqueos) en unidades de esta propiedad, calculadas bajo la zona horaria ` +
                    `actual. Cancela o reprograma esas ocupaciones antes de cambiar la zona horaria.`,
                );
              }
            }
          }

          const { rows } = await cliente.query<FilaPropiedad>(
            `UPDATE propiedad SET
               nombre = COALESCE($2, nombre),
               zona_horaria = COALESCE($3, zona_horaria),
               moneda = COALESCE($4, moneda),
               direccion_linea1 = COALESCE($5, direccion_linea1),
               direccion_ciudad = COALESCE($6, direccion_ciudad),
               direccion_pais = COALESCE($7, direccion_pais)
             WHERE id = $1
             RETURNING id, tenant_id, nombre, zona_horaria, moneda, direccion_linea1, direccion_ciudad, direccion_pais`,
            [
              id,
              cuerpo.nombre ?? null,
              cuerpo.zonaHoraria ?? null,
              cuerpo.moneda ?? null,
              cuerpo.direccion?.linea1 ?? null,
              cuerpo.direccion?.ciudad ?? null,
              cuerpo.direccion?.pais ?? null,
            ],
          );
          return rows[0] ?? null;
        }),
      ),
    );
    if (!fila) throw new ErrorDominio("recurso_no_encontrado", "Propiedad no encontrada o sin permiso");

    return c.json(serializar(fila));
  });

  return app;
}

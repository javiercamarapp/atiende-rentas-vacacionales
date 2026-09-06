import { Hono } from "hono";
import type pg from "pg";
import { exigirPlantillaAprobadaParaProgramar, extraerVariables, type PlantillaMensaje } from "@atiende-rv/domain";
import { CuerpoCrearPlantilla, CuerpoProgramarMensaje, ErrorDominio } from "../../contrato/tipos.js";
import { conSesion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { sesionDeAuth } from "../../middleware/tenant.js";
import { exigirPuedeAprobarPlantilla, exigirPuedeGestionarMensajeria } from "./permisos.js";

interface FilaPlantilla {
  id: string;
  evento: string;
  idioma: string;
  canal_codigo: string | null;
  cuerpo: string;
  variables_requeridas: string[];
  activa: boolean;
  aprobada_por_tenant: boolean;
  creado_en: string;
}

function mapearPlantilla(fila: FilaPlantilla) {
  return {
    id: fila.id,
    evento: fila.evento,
    idioma: fila.idioma,
    canalCodigo: fila.canal_codigo,
    cuerpo: fila.cuerpo,
    variablesRequeridas: fila.variables_requeridas,
    activa: fila.activa,
    aprobadaPorTenant: fila.aprobada_por_tenant,
  };
}

/**
 * Editor de plantillas por evento (H-056). Crear una plantilla NUNCA la
 * deja aprobada por defecto (`aprobada_por_tenant = false`) — un paso
 * explícito y separado (`POST /:id/aprobar`, solo admin/superadmin) es
 * indispensable antes de que `mensaje_programado` pueda referenciarla
 * (migración 0041, trigger `fn_exigir_plantilla_aprobada`).
 */
export function crearRutasPlantillas(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const filas = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cliente.query<FilaPlantilla>(
        `SELECT id, evento, idioma, canal_codigo, cuerpo, variables_requeridas, activa, aprobada_por_tenant, creado_en
         FROM plantilla_mensaje ORDER BY evento, idioma`,
      ),
    );
    return c.json({ plantillas: filas.rows.map(mapearPlantilla) });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarMensajeria(auth);
    if (!auth.tenantId) throw new ErrorDominio("validacion", "Solo usuarios de un tenant pueden crear plantillas");
    const cuerpo = CuerpoCrearPlantilla.parse(await c.req.json());
    const variables = extraerVariables(cuerpo.cuerpo);

    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cliente.query<FilaPlantilla>(
        `INSERT INTO plantilla_mensaje (tenant_id, evento, idioma, canal_codigo, cuerpo, variables_requeridas)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, evento, idioma, canal_codigo, cuerpo, variables_requeridas, activa, aprobada_por_tenant, creado_en`,
        [auth.tenantId, cuerpo.evento, cuerpo.idioma, cuerpo.canalCodigo, cuerpo.cuerpo, variables],
      ),
    );
    return c.json(mapearPlantilla(fila.rows[0]!), 201);
  });

  // POST /mensajeria/plantillas/:id/aprobar — H-056: el paso EXPLÍCITO de
  // aprobación por el tenant, sin el cual la plantilla nunca puede
  // programarse (aunque esté "activa").
  app.post("/:id/aprobar", async (c) => {
    const auth = c.get("auth");
    exigirPuedeAprobarPlantilla(auth);
    const id = c.req.param("id");

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const actualizado = await cliente.query<FilaPlantilla>(
        `UPDATE plantilla_mensaje SET aprobada_por_tenant = true, aprobada_por = $2, aprobada_en = now(), actualizado_en = now()
         WHERE id = $1
         RETURNING id, evento, idioma, canal_codigo, cuerpo, variables_requeridas, activa, aprobada_por_tenant, creado_en`,
        [id, auth.usuarioId],
      );
      if (actualizado.rows.length === 0) throw new ErrorDominio("recurso_no_encontrado", "Plantilla no encontrada");
      return actualizado.rows[0]!;
    });
    return c.json(mapearPlantilla(fila));
  });

  // POST /mensajeria/plantillas/programar — programa un mensaje automático
  // (H-056) SOLO sobre una plantilla ya aprobada. `packages/db` (0041,
  // trigger) es el respaldo estructural; esta verificación de aplicación
  // da un error tipado legible antes de tocar la BD.
  app.post("/programar", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarMensajeria(auth);
    const cuerpo = CuerpoProgramarMensaje.parse(await c.req.json());

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const plantilla = await cliente.query<FilaPlantilla>(
        `SELECT id, evento, idioma, canal_codigo, cuerpo, variables_requeridas, activa, aprobada_por_tenant, creado_en
         FROM plantilla_mensaje WHERE id = $1`,
        [cuerpo.plantillaId],
      );
      if (plantilla.rows.length === 0) throw new ErrorDominio("recurso_no_encontrado", "Plantilla no encontrada");

      const dominio: PlantillaMensaje = {
        id: plantilla.rows[0]!.id,
        evento: plantilla.rows[0]!.evento as PlantillaMensaje["evento"],
        idioma: plantilla.rows[0]!.idioma as PlantillaMensaje["idioma"],
        canal: plantilla.rows[0]!.canal_codigo as PlantillaMensaje["canal"],
        cuerpo: plantilla.rows[0]!.cuerpo,
        aprobadaPorTenant: plantilla.rows[0]!.aprobada_por_tenant,
        activa: plantilla.rows[0]!.activa,
      };
      try {
        exigirPlantillaAprobadaParaProgramar(dominio);
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Plantilla no aprobada";
        throw new ErrorDominio("validacion", mensaje);
      }

      try {
        const insertado = await cliente.query<{ id: string }>(
          `INSERT INTO mensaje_programado (conversacion_id, plantilla_id, programado_para)
           VALUES ($1, $2, $3) RETURNING id`,
          [cuerpo.conversacionId, cuerpo.plantillaId, cuerpo.programadoPara],
        );
        return insertado.rows[0]!;
      } catch (error) {
        // Respaldo del trigger BD `fn_exigir_plantilla_aprobada` (0041) por
        // si esta ruta cambiara de forma y se saltara la verificación de
        // arriba — nunca debería alcanzarse en la práctica.
        const mensaje = error instanceof Error ? error.message : "No se pudo programar el mensaje";
        if (/plantilla_no_aprobada/.test(mensaje)) throw new ErrorDominio("validacion", mensaje);
        throw error;
      }
    });
    return c.json({ id: resultado.id, estado: "pendiente" }, 201);
  });

  return app;
}

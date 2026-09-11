import { Hono } from "hono";
import type pg from "pg";
import {
  CuerpoActualizarSolicitudArco,
  CuerpoCrearSolicitudArco,
  ErrorDominio,
  QuerySolicitudesArco,
  type SolicitudArcoContrato,
} from "../contrato/tipos.js";
import { conSesion, enTransaccion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { ROLES_ADMIN } from "../rolesComunes.js";
import { sesionDeAuth } from "../middleware/tenant.js";

interface FilaSolicitudArco {
  id: string;
  tipo_derecho: string;
  jurisdiccion: string;
  solicitante_nombre: string;
  solicitante_email: string;
  descripcion: string | null;
  estado: string;
  responsable_id: string | null;
  recibida_en: string;
  plazo_limite: string;
  resuelta_en: string | null;
  resolucion_notas: string | null;
}

/**
 * REQ-151 (docs/REQUISITOS.md, MUST): bandeja de solicitudes ARCO/RGPD —
 * cola de tickets de derechos del interesado con plazo por jurisdicción
 * (calculado en base de datos, packages/db migración 0133_solicitud_arco.ts,
 * columna GENERATED — esta ruta nunca lo escribe ni lo recalcula), estado
 * y responsable asignado. Herramienta de FLUJO, no de decisión sustantiva
 * (RV19-R-11): nunca decide si una solicitud procede, solo la registra y
 * da seguimiento. Mismo nivel de rol que el resto de configuración legal/
 * de cumplimiento del tenant (ROLES_ADMIN, ver notificaciones.ts/
 * facturacion.ts) — un operador nunca gestiona esta bandeja, aunque la
 * política RLS (0133) ya sería el candado real si este chequeo se
 * olvidara (H-044, defensa en profundidad).
 */
export function crearRutasSolicitudesArco(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  function mapFila(f: FilaSolicitudArco): SolicitudArcoContrato {
    return {
      id: f.id,
      tipoDerecho: f.tipo_derecho as SolicitudArcoContrato["tipoDerecho"],
      jurisdiccion: f.jurisdiccion as SolicitudArcoContrato["jurisdiccion"],
      solicitanteNombre: f.solicitante_nombre,
      solicitanteEmail: f.solicitante_email,
      descripcion: f.descripcion,
      estado: f.estado as SolicitudArcoContrato["estado"],
      responsableId: f.responsable_id,
      recibidaEn: f.recibida_en,
      plazoLimite: f.plazo_limite,
      vencida: new Date(f.plazo_limite).getTime() < Date.now() && f.estado !== "resuelta" && f.estado !== "rechazada",
      resueltaEn: f.resuelta_en,
      resolucionNotas: f.resolucion_notas,
    };
  }

  const COLUMNAS_SELECT = `id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email, descripcion,
       estado, responsable_id, recibida_en, plazo_limite, resuelta_en, resolucion_notas`;

  // GET / — bandeja paginada, ordenada por urgencia (plazo_limite
  // ascendente) igual que el índice `solicitud_arco_tenant_estado_plazo_idx`
  // de la migración — así el ticket más próximo a vencer siempre aparece
  // primero, sin importar cuándo se creó.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const query = QuerySolicitudesArco.parse({
      pagina: c.req.query("pagina"),
      tamano: c.req.query("tamano"),
      estado: c.req.query("estado"),
    });
    const offset = (query.pagina - 1) * query.tamano;

    const { entradas, total } = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const condicionEstado = query.estado ? "WHERE estado = $3" : "";
      const parametrosLista = query.estado ? [query.tamano, offset, query.estado] : [query.tamano, offset];
      const parametrosConteo = query.estado ? [query.estado] : [];
      const [filas, conteo] = await Promise.all([
        cliente.query<FilaSolicitudArco>(
          `SELECT ${COLUMNAS_SELECT} FROM solicitud_arco
           ${condicionEstado}
           ORDER BY plazo_limite ASC
           LIMIT $1 OFFSET $2`,
          parametrosLista,
        ),
        cliente.query<{ total: string }>(
          `SELECT count(*)::text AS total FROM solicitud_arco ${query.estado ? "WHERE estado = $1" : ""}`,
          parametrosConteo,
        ),
      ]);
      return { entradas: filas.rows, total: Number.parseInt(conteo.rows[0]?.total ?? "0", 10) };
    });

    return c.json({
      pagina: query.pagina,
      tamano: query.tamano,
      total,
      entradas: entradas.map((f) => mapFila(f)),
    });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const id = c.req.param("id");
    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cliente.query<FilaSolicitudArco>(`SELECT ${COLUMNAS_SELECT} FROM solicitud_arco WHERE id = $1`, [id]),
    );
    if (!fila.rows[0]) throw new ErrorDominio("recurso_no_encontrado", "Solicitud ARCO no encontrada");
    return c.json(mapFila(fila.rows[0]));
  });

  // POST / — alta del ticket. `recibida_en` siempre `now()` (el momento en
  // que el ticket ENTRA a la bandeja, no una fecha declarada por quien lo
  // da de alta) — es la fecha que fn_calcular_plazo_arco usa para derivar
  // plazo_limite, así que nunca se acepta como input de la petición.
  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    if (!auth.tenantId) throw new ErrorDominio("validacion", "Esta cuenta no pertenece a ningún tenant");
    const cuerpo = CuerpoCrearSolicitudArco.parse(await c.req.json());

    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      enTransaccion(cliente, async () => {
        if (cuerpo.responsableId) {
          const responsable = await cliente.query("SELECT id FROM usuario WHERE id = $1", [cuerpo.responsableId]);
          if (!responsable.rows[0]) {
            throw new ErrorDominio("validacion", "El responsable asignado no existe o no pertenece a este tenant");
          }
        }
        const r = await cliente.query<FilaSolicitudArco>(
          `INSERT INTO solicitud_arco
             (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email, descripcion, responsable_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${COLUMNAS_SELECT}`,
          [
            auth.tenantId,
            cuerpo.tipoDerecho,
            cuerpo.jurisdiccion,
            cuerpo.solicitanteNombre,
            cuerpo.solicitanteEmail,
            cuerpo.descripcion ?? null,
            cuerpo.responsableId ?? null,
          ],
        );
        return r.rows[0]!;
      }),
    );

    return c.json(mapFila(fila), 201);
  });

  // PATCH /:id — única ruta de mutación del ciclo de vida del ticket:
  // cambia estado, (re)asigna responsable, o añade la nota de resolución.
  // Resolver/rechazar exige resolucionNotas EN LA MISMA petición — no basta
  // con que ya exista una nota de antes (RV19-R-11: la decisión sustantiva
  // la toma un humano fuera de esta herramienta, pero esta herramienta
  // exige que quede documentada en el momento en que se cierra el ticket).
  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const id = c.req.param("id");
    const cuerpo = CuerpoActualizarSolicitudArco.parse(await c.req.json());

    const cierraTicket = cuerpo.estado === "resuelta" || cuerpo.estado === "rechazada";
    const reabreTicket = cuerpo.estado === "recibida" || cuerpo.estado === "en_proceso";
    if (cierraTicket && !cuerpo.resolucionNotas) {
      throw new ErrorDominio(
        "validacion",
        "Debe indicar resolucionNotas al marcar una solicitud ARCO como resuelta o rechazada",
      );
    }

    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      enTransaccion(cliente, async () => {
        const actual = await cliente.query("SELECT id FROM solicitud_arco WHERE id = $1", [id]);
        if (!actual.rows[0]) throw new ErrorDominio("recurso_no_encontrado", "Solicitud ARCO no encontrada");

        if (cuerpo.responsableId) {
          const responsable = await cliente.query("SELECT id FROM usuario WHERE id = $1", [cuerpo.responsableId]);
          if (!responsable.rows[0]) {
            throw new ErrorDominio("validacion", "El responsable asignado no existe o no pertenece a este tenant");
          }
        }

        const r = await cliente.query<FilaSolicitudArco>(
          `UPDATE solicitud_arco SET
             estado = COALESCE($2, estado),
             responsable_id = CASE WHEN $3 THEN $4 ELSE responsable_id END,
             resolucion_notas = COALESCE($5, resolucion_notas),
             resuelta_en = CASE WHEN $6 THEN now() WHEN $7 THEN NULL ELSE resuelta_en END,
             actualizado_en = now()
           WHERE id = $1
           RETURNING ${COLUMNAS_SELECT}`,
          [
            id,
            cuerpo.estado ?? null,
            cuerpo.responsableId !== undefined,
            cuerpo.responsableId ?? null,
            cuerpo.resolucionNotas ?? null,
            cierraTicket,
            reabreTicket,
          ],
        );
        return r.rows[0]!;
      }),
    );

    return c.json(mapFila(fila));
  });

  return app;
}

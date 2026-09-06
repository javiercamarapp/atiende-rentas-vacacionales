import { Hono } from "hono";
import type pg from "pg";
import { detectarSenalesEscalamiento } from "@atiende-rv/domain";
import { CuerpoCrearConversacion, CuerpoRegistrarMensajeEntrante, ErrorDominio } from "../../contrato/tipos.js";
import { conSesion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { sesionDeAuth } from "../../middleware/tenant.js";
import {
  mapearBorrador,
  mapearConversacionResumen,
  mapearMensaje,
  resumenSinPii,
  type FilaBorrador,
  type FilaConversacionResumen,
  type FilaMensaje,
} from "./mapeo.js";
import { exigirPuedeGestionarMensajeria } from "./permisos.js";

const CONVERSACION_RESUMEN_SELECT = `
  c.id, c.unidad_id, u.nombre AS unidad_nombre, ca.codigo AS canal_codigo,
  (SELECT max(m.creado_en) FROM mensaje m WHERE m.conversacion_id = c.id) AS ultimo_mensaje_en,
  (SELECT count(*) FROM borrador_mensaje b WHERE b.conversacion_id = c.id AND b.estado = 'pendiente_aprobacion') AS borradores_pendientes
`;

/**
 * Bandeja + hilo (H-059 entregable: "bandeja, hilo con borradores
 * pendientes y Aprobar/Rechazar"). RLS (packages/db, migración 0043) ya
 * restringe qué conversaciones puede ver cada rol — este router no
 * reimplementa ese filtro, solo pagina/agrega.
 */
export function crearRutasConversaciones(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // GET /mensajeria/conversaciones — bandeja.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    const filas = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cliente.query<FilaConversacionResumen>(
        `SELECT ${CONVERSACION_RESUMEN_SELECT}
         FROM conversacion c
         JOIN unidad u ON u.id = c.unidad_id
         JOIN canal ca ON ca.id = c.canal_id
         ORDER BY ultimo_mensaje_en DESC NULLS LAST`,
      ),
    );
    return c.json({ conversaciones: filas.rows.map(mapearConversacionResumen) });
  });

  // POST /mensajeria/conversaciones — crea una conversación (H-...
  // "conversación por reserva/huésped").
  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarMensajeria(auth);
    const cuerpo = CuerpoCrearConversacion.parse(await c.req.json());

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const canal = await cliente.query<{ id: string }>(`SELECT id FROM canal WHERE codigo = $1`, [
        cuerpo.canalCodigo,
      ]);
      if (canal.rows.length === 0) throw new ErrorDominio("validacion", "Canal desconocido");

      // S-05 (IDOR cross-tenant): `huespedMinimoId` viene del cliente y
      // `huesped_minimo` no tiene ninguna relación de FOREIGN KEY que por
      // sí sola lo impida (Postgres hace bypass de RLS al validar FKs) —
      // sin este chequeo explícito, cualquier UUID de huésped de OTRO
      // tenant se aceptaba sin error y terminaba expuesto en el borrador
      // generado para esta conversación (H-AUD2-02). Se valida
      // pertenencia al MISMO tenant que la unidad de la conversación,
      // usando la misma función unidad_tenant_id() que ya protege
      // ocupacion_unidad/conversacion.
      if (cuerpo.huespedMinimoId) {
        const huesped = await cliente.query<{ id: string }>(
          `SELECT id FROM huesped_minimo WHERE id = $1 AND tenant_id = unidad_tenant_id($2)`,
          [cuerpo.huespedMinimoId, cuerpo.unidadId],
        );
        if (huesped.rows.length === 0) {
          throw new ErrorDominio("recurso_no_encontrado", "Huésped no encontrado para esta unidad");
        }
      }

      const insertado = await cliente.query<{ id: string }>(
        `INSERT INTO conversacion (unidad_id, ocupacion_unidad_id, canal_id, huesped_minimo_id, idioma)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          cuerpo.unidadId,
          cuerpo.ocupacionUnidadId ?? null,
          canal.rows[0]!.id,
          cuerpo.huespedMinimoId ?? null,
          cuerpo.idioma,
        ],
      );
      const conNombre = await cliente.query<FilaConversacionResumen>(
        `SELECT ${CONVERSACION_RESUMEN_SELECT} FROM conversacion c
         JOIN unidad u ON u.id = c.unidad_id JOIN canal ca ON ca.id = c.canal_id
         WHERE c.id = $1`,
        [insertado.rows[0]!.id],
      );
      return conNombre.rows[0]!;
    });
    return c.json(mapearConversacionResumen(fila), 201);
  });

  // GET /mensajeria/conversaciones/:id — hilo con mensajes + borradores
  // (incluidos los pendientes de aprobación).
  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const conversacion = await cliente.query<FilaConversacionResumen>(
        `SELECT ${CONVERSACION_RESUMEN_SELECT} FROM conversacion c
         JOIN unidad u ON u.id = c.unidad_id JOIN canal ca ON ca.id = c.canal_id
         WHERE c.id = $1`,
        [id],
      );
      if (conversacion.rows.length === 0) return null;
      const mensajes = await cliente.query<FilaMensaje>(
        `SELECT id, conversacion_id, direccion, origen, texto, redactado, creado_en
         FROM mensaje WHERE conversacion_id = $1 ORDER BY creado_en`,
        [id],
      );
      const borradores = await cliente.query<FilaBorrador>(
        `SELECT id, conversacion_id, texto, canal_codigo, estado, generado_por, redactado,
                aprobado_por, rechazado_por, motivo_rechazo, creado_en
         FROM borrador_mensaje WHERE conversacion_id = $1 ORDER BY creado_en`,
        [id],
      );
      return { conversacion: conversacion.rows[0]!, mensajes: mensajes.rows, borradores: borradores.rows };
    });
    if (!resultado) throw new ErrorDominio("recurso_no_encontrado", "Conversación no encontrada");

    return c.json({
      ...mapearConversacionResumen(resultado.conversacion),
      mensajes: resultado.mensajes.map(mapearMensaje),
      borradores: resultado.borradores.map(mapearBorrador),
    });
  });

  // POST /mensajeria/conversaciones/:id/mensajes — registra un mensaje
  // ENTRANTE (H-... "mensaje entrante vía simulador o manual"). Nunca
  // acepta `direccion` en el cuerpo: un mensaje saliente solo se crea al
  // aprobar un borrador (borradores.ts). El texto se almacena TAL CUAL —
  // dato no confiable (RV19-R-16) — nunca se interpreta ni ejecuta aquí.
  app.post("/:id/mensajes", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarMensajeria(auth);
    const id = c.req.param("id");
    const cuerpo = CuerpoRegistrarMensajeEntrante.parse(await c.req.json());

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const existe = await cliente.query(`SELECT id FROM conversacion WHERE id = $1`, [id]);
      if (existe.rows.length === 0) throw new ErrorDominio("recurso_no_encontrado", "Conversación no encontrada");

      const insertado = await cliente.query<FilaMensaje>(
        `INSERT INTO mensaje (conversacion_id, direccion, origen, texto)
         VALUES ($1, 'entrante', $2, $3)
         RETURNING id, conversacion_id, direccion, origen, texto, redactado, creado_en`,
        [id, cuerpo.origen, cuerpo.texto],
      );
      const mensaje = insertado.rows[0]!;

      // H-060: señales de escalamiento — puramente informativas, nunca
      // ejecutan ninguna acción (packages/domain/src/mensajeria/escalamiento.ts).
      const senales = detectarSenalesEscalamiento(cuerpo.texto);
      for (const tipo of senales) {
        await cliente.query(`INSERT INTO senal_escalamiento (mensaje_id, tipo) VALUES ($1, $2)`, [mensaje.id, tipo]);
      }
      return { mensaje, senales };
    });

    // Log de aplicación SIN PII: nunca el texto crudo del huésped.
    console.log(
      JSON.stringify({
        evento: "mensaje_entrante_registrado",
        conversacionId: id,
        origen: cuerpo.origen,
        senalesEscalamiento: resultado.senales,
        ...resumenSinPii(cuerpo.texto),
      }),
    );

    return c.json({ ...mapearMensaje(resultado.mensaje), senalesEscalamiento: resultado.senales }, 201);
  });

  return app;
}

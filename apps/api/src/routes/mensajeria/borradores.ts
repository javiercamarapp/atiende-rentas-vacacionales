import { Hono } from "hono";
import type pg from "pg";
import {
  AprobacionRequeridaError,
  ContenidoProhibidoError,
  GeneradorBorradorPlantillas,
  MensajeExcedeLongitudError,
  TransicionBorradorInvalidaError,
  aprobarBorrador,
  intentarEnvioAutomatico,
  marcarEnviadoTrasAprobacion,
  rechazarBorrador,
  validarMensajeSaliente,
  type CanalMensajeriaCodigo,
  type ContextoBorrador,
} from "@atiende-rv/domain";
import { SimuladorMensajeria } from "@atiende-rv/sim";
import { agentesHabilitadoParaTenant, invocarRondaAgente } from "../../agentes/servicio.js";
import { CuerpoCrearBorrador, CuerpoRechazarBorrador, ErrorDominio } from "../../contrato/tipos.js";
import { conSesion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { sesionDeAuth } from "../../middleware/tenant.js";
import { mapearBorrador, resumenSinPii, type FilaBorrador } from "./mapeo.js";
import { exigirPuedeGestionarMensajeria } from "./permisos.js";

const BORRADOR_SELECT = `id, conversacion_id, texto, canal_codigo, estado, generado_por, redactado,
                          aprobado_por, rechazado_por, motivo_rechazo, creado_en`;

function traducirErrorMensajeria(error: unknown): ErrorDominio {
  if (error instanceof ErrorDominio) return error;
  if (error instanceof MensajeExcedeLongitudError) return new ErrorDominio("mensaje_excede_limite", error.message);
  if (error instanceof ContenidoProhibidoError) return new ErrorDominio("contenido_no_permitido", error.message);
  if (error instanceof AprobacionRequeridaError) return new ErrorDominio("aprobacion_requerida", error.message);
  if (error instanceof TransicionBorradorInvalidaError) return new ErrorDominio("validacion", error.message);
  const mensaje = error instanceof Error ? error.message : "Error de mensajería";
  if (/no existe|no encontrad/.test(mensaje)) return new ErrorDominio("recurso_no_encontrado", mensaje);
  return new ErrorDominio("error_interno", "No se pudo completar la operación de mensajería");
}

interface FilaContexto {
  canal_codigo: CanalMensajeriaCodigo;
  // Solo necesarios para construir el `ToolContext` del motor de intención
  // real cuando `usarIa: true` (fix/mensajeria-nativa-por-canal) — D-008:
  // estos identificadores SIEMPRE se resuelven aquí, en el servidor, a
  // partir de la conversación autenticada, nunca del cuerpo de la request.
  unidad_id: string;
  propiedad_id: string;
  huesped_id: string | null;
  ocupacion_unidad_id: string | null;
  propiedad_nombre: string;
  huesped_nombre: string | null;
  fecha_check_in: string | null;
  fecha_check_out: string | null;
  ocupacion_estado: string | null;
}

const CONTEXTO_SELECT = `
  ca.codigo AS canal_codigo,
  u.id AS unidad_id,
  p.id AS propiedad_id,
  h.id AS huesped_id,
  c.ocupacion_unidad_id AS ocupacion_unidad_id,
  p.nombre AS propiedad_nombre,
  h.nombre AS huesped_nombre,
  lower(o.rango)::text AS fecha_check_in,
  (upper(o.rango) - interval '1 day')::date::text AS fecha_check_out,
  o.estado AS ocupacion_estado
`;

/**
 * Cola de aprobación humana (H-059, D-006). NINGUNA ruta de este archivo
 * envía un mensaje sin que exista, en la misma transacción, una
 * transición explícita `aprobado → enviado` (`marcarEnviadoTrasAprobacion`)
 * — no existe un endpoint "enviar" separado que un cliente pueda invocar
 * directamente sin pasar por `/aprobar`.
 */
export function crearRutasBorradores(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // POST /mensajeria/conversaciones/:conversacionId/borradores — genera un
  // borrador determinista (H-059) a partir del último mensaje entrante (o
  // del indicado) usando GeneradorBorradorPlantillas — sin LLM, sin ninguna
  // API de IA. El texto del huésped se pasa como DATO estructurado
  // (RV19-R-16), nunca como instrucción.
  app.post("/conversaciones/:conversacionId/borradores", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarMensajeria(auth);
    const conversacionId = c.req.param("conversacionId");
    const cuerpo = CuerpoCrearBorrador.parse(await c.req.json().catch(() => ({})));

    // fix/mensajeria-nativa-por-canal: `usarIa` conecta el motor de
    // intención REAL de Lote 9 (`invocarRondaAgente` → `EjecutorTools` →
    // `proveedorClaude.ts` si está habilitado, o el proveedor simulado si
    // no) a esta misma cola de aprobación humana — mismo chequeo de flag
    // que `POST /agentes/unidades/:unidadId/mensajes`, para no degradar en
    // silencio al motor determinista cuando un operador pidió
    // explícitamente el motor de IA.
    if (cuerpo.usarIa) {
      if (!auth.tenantId) throw new ErrorDominio("recurso_no_encontrado", "Sesión sin tenant asociado");
      if (!agentesHabilitadoParaTenant(auth.tenantId)) {
        throw new ErrorDominio(
          "agentes_deshabilitado",
          "La automatización agéntica está desactivada para este tenant (flag agentes.habilitado)",
        );
      }
    }

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const contexto = await cliente.query<FilaContexto>(
        `SELECT ${CONTEXTO_SELECT}
         FROM conversacion c
         JOIN canal ca ON ca.id = c.canal_id
         JOIN unidad u ON u.id = c.unidad_id
         JOIN propiedad p ON p.id = u.propiedad_id
         LEFT JOIN huesped_minimo h ON h.id = c.huesped_minimo_id
         LEFT JOIN ocupacion_unidad o ON o.id = c.ocupacion_unidad_id
         WHERE c.id = $1`,
        [conversacionId],
      );
      if (contexto.rows.length === 0) throw new ErrorDominio("recurso_no_encontrado", "Conversación no encontrada");
      const fila = contexto.rows[0]!;

      let textoEntrada = "";
      if (cuerpo.mensajeEntranteId) {
        const mensaje = await cliente.query<{ texto: string }>(
          `SELECT texto FROM mensaje WHERE id = $1 AND conversacion_id = $2 AND direccion = 'entrante'`,
          [cuerpo.mensajeEntranteId, conversacionId],
        );
        if (mensaje.rows.length === 0) throw new ErrorDominio("recurso_no_encontrado", "Mensaje entrante no encontrado");
        textoEntrada = mensaje.rows[0]!.texto;
      }

      if (cuerpo.usarIa) {
        // Motor de intención real (Lote 9): la MISMA orquestación que
        // `POST /agentes/unidades/:unidadId/mensajes` (loop-guard, cuota,
        // matriz rol×tool, defensa de "confirmación no verificada" — ver
        // `packages/domain/src/agentes/ejecutor.ts`), aquí conectada por
        // primera vez a `borrador_mensaje` en vez de devolver la salida
        // cruda al llamador sin pasar por la cola de aprobación.
        const resultadoAgente = await invocarRondaAgente(cliente, process.env, {
          contexto: {
            tenantId: auth.tenantId!,
            unidadId: fila.unidad_id,
            propiedadId: fila.propiedad_id,
            huespedId: fila.huesped_id,
            reservaId: fila.ocupacion_unidad_id,
            conversationId: conversacionId,
            canal: fila.canal_codigo,
          },
          actor: { usuarioId: auth.usuarioId, rol: auth.rol, colaboradorNivel: auth.colaboradorNivel },
          mensajeHuesped: textoEntrada ? { origen: "mensaje_huesped", texto: textoEntrada } : null,
          contextoResumen: {
            propiedadNombre: fila.propiedad_nombre,
            fechaCheckIn: fila.fecha_check_in,
            fechaCheckOut: fila.fecha_check_out,
          },
        });

        if (resultadoAgente.tipo === "presupuesto_agotado") {
          throw new ErrorDominio("cuota_ia_agotada", resultadoAgente.mensaje);
        }
        if (resultadoAgente.tipo === "bloqueado") {
          throw new ErrorDominio("tool_bloqueada", resultadoAgente.mensaje, { motivo: resultadoAgente.motivo });
        }
        // D-006/D-007: la tool de propuesta (`mensajeria_proponer_borrador`)
        // NUNCA envía nada por sí misma — devuelve texto que esta ruta
        // inserta como 'pendiente_aprobacion', exactamente igual que el
        // camino determinista de abajo. Si el modelo invocó una tool
        // distinta (ej. consultar disponibilidad) para esta ronda, su
        // salida no es texto de respuesta al huésped — se rechaza
        // explícitamente en vez de insertarla como si lo fuera.
        if (typeof resultadoAgente.salida !== "string" || resultadoAgente.salida.length === 0) {
          throw new ErrorDominio(
            "validacion",
            "El motor de intención no produjo un borrador de texto para este mensaje (probablemente invocó " +
              "una tool distinta a mensajeria_proponer_borrador) — genera el borrador manualmente o reintenta",
          );
        }

        const insertadoAgente = await cliente.query<FilaBorrador>(
          `INSERT INTO borrador_mensaje (conversacion_id, mensaje_entrante_id, canal_codigo, texto, generado_por)
           VALUES ($1, $2, $3, $4, 'agente_llm')
           RETURNING ${BORRADOR_SELECT}`,
          [conversacionId, cuerpo.mensajeEntranteId ?? null, fila.canal_codigo, resultadoAgente.salida],
        );
        return {
          fila: insertadoAgente.rows[0]!,
          generado: {
            necesitaEscalamiento: resultadoAgente.necesitaEscalamiento,
            senales: resultadoAgente.motivoEscalamiento ? [resultadoAgente.motivoEscalamiento] : [],
          },
        };
      }

      const ctxBorrador: ContextoBorrador = {
        nombreHuesped: fila.huesped_nombre,
        propiedadNombre: fila.propiedad_nombre,
        fechaCheckIn: fila.fecha_check_in,
        fechaCheckOut: fila.fecha_check_out,
        reservaConfirmada: cuerpo.reservaConfirmada || fila.ocupacion_estado === "confirmado",
        canal: fila.canal_codigo,
      };

      const generador = new GeneradorBorradorPlantillas();
      const generado = generador.generar({ texto: textoEntrada, idioma: "es" }, ctxBorrador);

      const insertado = await cliente.query<FilaBorrador>(
        `INSERT INTO borrador_mensaje (conversacion_id, mensaje_entrante_id, canal_codigo, texto, generado_por)
         VALUES ($1, $2, $3, $4, 'motor_borrador')
         RETURNING ${BORRADOR_SELECT}`,
        [conversacionId, cuerpo.mensajeEntranteId ?? null, fila.canal_codigo, generado.texto],
      );
      return { fila: insertado.rows[0]!, generado };
    });

    console.log(
      JSON.stringify({
        evento: "borrador_generado",
        conversacionId,
        estado: "pendiente_aprobacion",
        necesitaEscalamiento: resultado.generado.necesitaEscalamiento,
        senales: resultado.generado.senales,
        ...resumenSinPii(resultado.fila.texto),
      }),
    );

    return c.json(
      { ...mapearBorrador(resultado.fila), necesitaEscalamiento: resultado.generado.necesitaEscalamiento },
      201,
    );
  });

  // POST /mensajeria/borradores/:id/aprobar — ÚNICA ruta que puede
  // terminar en un mensaje saliente real. Aplica la política de canal
  // (H-057/H-058) sobre el texto aprobado, transiciona el borrador
  // (pendiente_aprobacion → aprobado → enviado, sin saltos) e inserta el
  // mensaje saliente, todo en la misma transacción de sesión.
  app.post("/borradores/:id/aprobar", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarMensajeria(auth);
    const id = c.req.param("id");

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const fila = await cliente.query<FilaBorrador & { reserva_confirmada: boolean }>(
        `SELECT b.id, b.conversacion_id, b.texto, b.canal_codigo, b.estado, b.generado_por, b.redactado,
                b.aprobado_por, b.rechazado_por, b.motivo_rechazo, b.creado_en,
                COALESCE(o.estado = 'confirmado', false) AS reserva_confirmada
         FROM borrador_mensaje b
         JOIN conversacion c ON c.id = b.conversacion_id
         LEFT JOIN ocupacion_unidad o ON o.id = c.ocupacion_unidad_id
         WHERE b.id = $1`,
        [id],
      );
      if (fila.rows.length === 0) throw new ErrorDominio("recurso_no_encontrado", "Borrador no encontrado");
      const borrador = fila.rows[0]!;

      try {
        aprobarBorrador({ id: borrador.id, estado: borrador.estado }, auth.usuarioId);

        const validado = validarMensajeSaliente({
          canal: borrador.canal_codigo,
          texto: borrador.texto,
          reservaConfirmada: borrador.reserva_confirmada,
        });

        const canal = new SimuladorMensajeria(borrador.canal_codigo);
        const envio = await canal.enviarMensajeAprobado({
          borradorId: borrador.id,
          texto: validado.texto,
          aprobadoPor: auth.usuarioId,
        });

        // Solo AHORA, con aprobado_por poblado, se permite 'enviado'.
        marcarEnviadoTrasAprobacion({ id: borrador.id, estado: "aprobado" });

        const mensajeSaliente = await cliente.query<{ id: string }>(
          `INSERT INTO mensaje (conversacion_id, direccion, origen, texto, redactado)
           VALUES ($1, 'saliente', 'simulador', $2, $3) RETURNING id`,
          [borrador.conversacion_id, validado.texto, validado.redactado],
        );

        const actualizado = await cliente.query<FilaBorrador>(
          `UPDATE borrador_mensaje
           SET estado = 'enviado', aprobado_por = $2, aprobado_en = now(),
               texto = $3, redactado = $4, mensaje_enviado_id = $5, actualizado_en = now()
           WHERE id = $1 RETURNING ${BORRADOR_SELECT}`,
          [id, auth.usuarioId, validado.texto, validado.redactado, mensajeSaliente.rows[0]!.id],
        );
        return { borrador: actualizado.rows[0]!, envio, redactado: validado.redactado };
      } catch (error) {
        throw traducirErrorMensajeria(error);
      }
    });

    console.log(
      JSON.stringify({
        evento: "borrador_aprobado_y_enviado",
        borradorId: id,
        aprobadoPor: auth.usuarioId,
        canal: resultado.borrador.canal_codigo,
        redactado: resultado.redactado,
        enviadoEn: resultado.envio.enviadoEn,
      }),
    );

    return c.json(mapearBorrador(resultado.borrador));
  });

  // POST /mensajeria/borradores/:id/rechazar
  app.post("/borradores/:id/rechazar", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarMensajeria(auth);
    const id = c.req.param("id");
    const cuerpo = CuerpoRechazarBorrador.parse(await c.req.json());

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const actual = await cliente.query<FilaBorrador>(`SELECT ${BORRADOR_SELECT} FROM borrador_mensaje WHERE id = $1`, [
        id,
      ]);
      if (actual.rows.length === 0) throw new ErrorDominio("recurso_no_encontrado", "Borrador no encontrado");

      try {
        rechazarBorrador({ id, estado: actual.rows[0]!.estado }, auth.usuarioId, cuerpo.motivo);
      } catch (error) {
        throw traducirErrorMensajeria(error);
      }

      const actualizado = await cliente.query<FilaBorrador>(
        `UPDATE borrador_mensaje
         SET estado = 'rechazado', rechazado_por = $2, rechazado_en = now(), motivo_rechazo = $3, actualizado_en = now()
         WHERE id = $1 RETURNING ${BORRADOR_SELECT}`,
        [id, auth.usuarioId, cuerpo.motivo],
      );
      return actualizado.rows[0]!;
    });

    console.log(
      JSON.stringify({ evento: "borrador_rechazado", borradorId: id, rechazadoPor: auth.usuarioId }),
    );
    return c.json(mapearBorrador(fila));
  });

  // POST /mensajeria/borradores/:id/intento-automatico — punto de prueba
  // explícito del entregable "borrador no se envía sin aprobación: intento
  // automático → error tipado y auditoría" (DEFINICION-DE-HECHO). Simula
  // lo que haría un worker/scheduler que intentara enviar SIN que un
  // humano haya pulsado "aprobar" — SIEMPRE es rechazado, sin excepción,
  // incluso si el borrador ya está aprobado (D-006: no existe ruta de
  // envío directo para procesos automáticos, `intentarEnvioAutomatico`).
  app.post("/borradores/:id/intento-automatico", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarMensajeria(auth);
    const id = c.req.param("id");

    await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const fila = await cliente.query<{ id: string; estado: FilaBorrador["estado"] }>(
        `SELECT id, estado FROM borrador_mensaje WHERE id = $1`,
        [id],
      );
      if (fila.rows.length === 0) throw new ErrorDominio("recurso_no_encontrado", "Borrador no encontrado");

      // Deja un rastro de auditoría real (trigger `auditoria_borrador_mensaje`,
      // migración 0044) del intento, aunque no cambie el estado.
      await cliente.query(`UPDATE borrador_mensaje SET actualizado_en = now() WHERE id = $1`, [id]);

      try {
        intentarEnvioAutomatico({ id: fila.rows[0]!.id, estado: fila.rows[0]!.estado });
      } catch (error) {
        console.error(
          JSON.stringify({
            evento: "intento_envio_automatico_rechazado",
            borradorId: id,
            motivo: "sin_aprobacion_humana_en_el_instante_del_envio",
          }),
        );
        throw traducirErrorMensajeria(error);
      }
    });

    // intentarEnvioAutomatico siempre lanza — este punto es inalcanzable,
    // pero TypeScript exige un retorno explícito.
    return c.json({ error: "inalcanzable" }, 500);
  });

  return app;
}

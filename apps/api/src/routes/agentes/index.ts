import { Hono } from "hono";
import type pg from "pg";
import { toolsDisponiblesParaActor, type ActorAgente } from "@atiende-rv/domain/agentes";
import { agentesHabilitadoParaTenant, invocarRondaAgente, registroFlagsAgentesInstancia } from "../../agentes/servicio.js";
import { obtenerCuotaTenant, listarTrazasTenant, resolverContextoUnidad } from "../../agentes/repositorio.js";
import { CuerpoInvocarAgente, ErrorDominio, QueryTrazasAgente } from "../../contrato/tipos.js";
import { conSesion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exigirRol } from "../../middleware/roles.js";
import { sesionDeAuth } from "../../middleware/tenant.js";
import { crearRutasAgentesFlags } from "./flags.js";

/**
 * Lote 9 (BACKLOG E14, H-077 a H-085): endpoints para invocar tools desde
 * la sesión autenticada, consultar el catálogo disponible para el rol
 * actual, la cuota de IA del tenant y la trazabilidad de tool-calls.
 * Montado en `apps/api/src/routes/index.ts` como `/agentes` (punto de
 * fusión compartido, una sola línea añadida — LOTES.md, nota de
 * cabecera).
 *
 * Ningún endpoint de este archivo acepta `tenantId`/`propiedadId`/
 * `huespedId`/`reservaId` como campo del CUERPO de la request (D-008): el
 * único identificador de negocio en la URL es `:unidadId`, resuelto igual
 * que en `pricing.ts`/`limpieza` — un parámetro de ruta normal de una API
 * REST autenticada, nunca un argumento que el modelo elige o construye.
 */
export function crearRutasAgentes(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // Corrección Auditoría 2 (P-01): `/agentes/flags` expone el estado del
  // flag `agentes.habilitado` (y `agentes.proveedor_real_habilitado`) con
  // toggle admin-only + auditoría — ver flags.ts para el detalle de roles.
  app.route("/flags", crearRutasAgentesFlags(registroFlagsAgentesInstancia()));

  app.get("/tools", async (c) => {
    const auth = c.get("auth");
    const actor: ActorAgente = { usuarioId: auth.usuarioId, rol: auth.rol, colaboradorNivel: auth.colaboradorNivel };
    // `rolesPermitidos`/`nivelesColaboradorPermitidos` añadidos en la
    // corrección P-01 (Auditoría 2): la página de "Automatización
    // agéntica" necesita mostrar qué roles pueden usar cada tool, no solo
    // cuáles puede usar el actor actual (que para superadmin/admin_gestora
    // ya coincide con el catálogo casi completo).
    const tools = toolsDisponiblesParaActor(actor).map((tool) => ({
      nombre: tool.nombre,
      descripcion: tool.descripcion,
      efecto: tool.efecto,
      requiereLlm: tool.requiereLlm,
      maxLlamadasPorConversacion: tool.limites.maxLlamadasPorConversacion,
      rolesPermitidos: tool.rolesPermitidos,
      nivelesColaboradorPermitidos: tool.nivelesColaboradorPermitidos ?? null,
    }));
    return c.json({ tools });
  });

  app.get("/cuota", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora", "operador");
    if (!auth.tenantId) throw new ErrorDominio("recurso_no_encontrado", "Sesión sin tenant asociado");
    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) => obtenerCuotaTenant(cliente, auth.tenantId!));
    if (!fila) throw new ErrorDominio("recurso_no_encontrado", "Este tenant no tiene un presupuesto de IA configurado");
    return c.json({
      tenantId: fila.tenantId,
      techoTokensPeriodo: fila.techoTokensPeriodo,
      techoLlamadasPeriodo: fila.techoLlamadasPeriodo,
      tokensRestantes: Math.max(0, fila.techoTokensPeriodo - fila.tokensLiquidadosPeriodo),
      llamadasRestantes: Math.max(0, fila.techoLlamadasPeriodo - fila.llamadasLiquidadasPeriodo),
      periodoIniciaEn: fila.periodoIniciaEn,
    });
  });

  app.get("/trazas", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora", "operador");
    if (!auth.tenantId) throw new ErrorDominio("recurso_no_encontrado", "Sesión sin tenant asociado");
    const query = QueryTrazasAgente.parse({ pagina: c.req.query("pagina"), tamano: c.req.query("tamano") });
    const trazas = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      listarTrazasTenant(cliente, auth.tenantId!, { pagina: query.pagina, tamano: query.tamano }),
    );
    return c.json({ trazas });
  });

  app.post("/unidades/:unidadId/mensajes", async (c) => {
    const auth = c.get("auth");
    if (!auth.tenantId) throw new ErrorDominio("recurso_no_encontrado", "Sesión sin tenant asociado");
    if (!agentesHabilitadoParaTenant(auth.tenantId)) {
      throw new ErrorDominio("agentes_deshabilitado", "La automatización agéntica está desactivada para este tenant (flag agentes.habilitado)");
    }
    const unidadId = c.req.param("unidadId");
    const cuerpo = CuerpoInvocarAgente.parse(await c.req.json());

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const unidad = await resolverContextoUnidad(cliente, unidadId);
      if (!unidad) throw new ErrorDominio("recurso_no_encontrado", "Unidad no encontrada");

      return invocarRondaAgente(cliente, process.env, {
        contexto: {
          tenantId: unidad.tenantId,
          unidadId: unidad.unidadId,
          propiedadId: unidad.propiedadId,
          huespedId: null,
          reservaId: null,
          conversationId: cuerpo.conversationId ?? `panel-${unidadId}`,
          canal: cuerpo.canal,
        },
        actor: { usuarioId: auth.usuarioId, rol: auth.rol, colaboradorNivel: auth.colaboradorNivel },
        mensajeHuesped: { origen: "mensaje_huesped", texto: cuerpo.texto },
        contextoResumen: {},
      });
    });

    if (resultado.tipo === "presupuesto_agotado") {
      throw new ErrorDominio("cuota_ia_agotada", resultado.mensaje);
    }
    if (resultado.tipo === "bloqueado") {
      throw new ErrorDominio("tool_bloqueada", resultado.mensaje, { motivo: resultado.motivo });
    }
    return c.json({
      tipo: resultado.tipo,
      salida: resultado.salida,
      necesitaEscalamiento: resultado.necesitaEscalamiento,
      motivoEscalamiento: resultado.motivoEscalamiento,
    });
  });

  return app;
}

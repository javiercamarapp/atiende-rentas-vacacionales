import { Hono } from "hono";
import { CATALOGO_FLAGS_POR_DEFECTO, RegistroFlags } from "@atiende-rv/domain";
import { CuerpoEstablecerFlag, ErrorDominio } from "../../contrato/tipos.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exigirRol } from "../../middleware/roles.js";

/**
 * Gestión de feature flags por tenant (H-089 reutilizado desde el back
 * office, packages/domain/src/flags). El registro es en memoria por
 * proceso — límite documentado explícitamente en
 * packages/domain/src/flags/tipos.ts ("la persistencia real... es
 * responsabilidad de la capa que lo use"); esta ruta es esa capa mínima
 * para Fase 2, exclusiva de superadmin. Cada cambio queda en
 * `registroFlags.auditoria()` con actor, motivo y timestamp (nunca
 * silencioso) — expuesto vía `GET /:id/auditoria`.
 *
 * Exportado como singleton de módulo (no un valor por request) porque un
 * `RegistroFlags` en memoria solo tiene sentido si sobrevive entre
 * requests del mismo proceso; instanciarlo por request perdería todo
 * cambio al terminar esa request.
 */
export const registroFlagsBackoffice = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);

export function crearRutasBackofficeFlags(jwtSecret: string, registro: RegistroFlags = registroFlagsBackoffice): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin");
    const tenantId = c.req.query("tenantId");

    return c.json({
      flags: registro.listar().map((def) => ({
        id: def.id,
        descripcion: def.descripcion,
        categoriaRiesgo: def.categoriaRiesgo,
        valorGlobal: registro.valor(def.id),
        valorEfectivo: registro.valor(def.id, tenantId),
        overrideDeTenant: tenantId ? registro.valor(def.id, tenantId) !== registro.valor(def.id) : false,
      })),
    });
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin");
    const flagId = c.req.param("id");
    const cuerpo = CuerpoEstablecerFlag.parse(await c.req.json());

    try {
      const entrada = registro.establecer({
        flagId,
        valor: cuerpo.valor,
        tenantId: cuerpo.tenantId,
        actor: auth.usuarioId,
        motivo: cuerpo.motivo,
      });
      return c.json({ ok: true, flagId, valor: entrada.valor, tenantId: entrada.tenantId ?? null });
    } catch (error) {
      throw new ErrorDominio("recurso_no_encontrado", (error as Error).message);
    }
  });

  app.get("/:id/auditoria", (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin");
    const flagId = c.req.param("id");
    try {
      return c.json({ entradas: registro.auditoria(flagId) });
    } catch (error) {
      throw new ErrorDominio("recurso_no_encontrado", (error as Error).message);
    }
  });

  return app;
}

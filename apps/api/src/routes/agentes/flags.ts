import { Hono } from "hono";
import type { RegistroFlags } from "@atiende-rv/domain";
import { CuerpoEstablecerFlag, ErrorDominio } from "../../contrato/tipos.js";
import { exigirRol } from "../../middleware/roles.js";

/**
 * Corrección Auditoría 2 (P-01, producto-ux-operacion.md): expone por HTTP
 * el `RegistroFlags` de agentes (`agentes.habilitado`,
 * `agentes.proveedor_real_habilitado`, `packages/domain/src/agentes/
 * flags.ts`) que hasta esta corrección solo existía como singleton de
 * proceso (`registroFlagsAgentesInstancia()` en `apps/api/src/agentes/
 * servicio.ts`) sin ninguna ruta que lo leyera ni lo mutara — ni el propio
 * `GET /flags` de back office lo conocía, porque ese usa un
 * `RegistroFlags` DISTINTO (`registroFlagsBackoffice`, catálogo
 * `CATALOGO_FLAGS_POR_DEFECTO`). Sin esto, la página de "Automatización
 * agéntica" no tendría forma real de mostrar ni cambiar el flag — sería
 * una UI decorativa sobre un botón que no hace nada.
 *
 * Roles: lectura para cualquier rol que ya puede ver cuota/trazas de
 * agentes (`superadmin`/`admin_gestora`/`operador`, mismo criterio que
 * `GET /agentes/cuota` y `GET /agentes/trazas`); el TOGGLE (`PATCH`) queda
 * reservado a roles de administración de tenant (`superadmin`/
 * `admin_gestora`) — un operador puede ver el estado pero nunca
 * encenderlo/apagarlo, coherente con "toggle solo para admin" del encargo
 * de esta corrección.
 */
const ROLES_LECTURA_FLAGS_AGENTES = ["superadmin", "admin_gestora", "operador"] as const;
const ROLES_ESCRITURA_FLAGS_AGENTES = ["superadmin", "admin_gestora"] as const;

export function crearRutasAgentesFlags(registro: RegistroFlags): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_LECTURA_FLAGS_AGENTES);
    const tenantId = auth.tenantId ?? undefined;

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
    exigirRol(auth, ...ROLES_ESCRITURA_FLAGS_AGENTES);
    const flagId = c.req.param("id");
    const cuerpo = CuerpoEstablecerFlag.parse(await c.req.json());

    try {
      const entrada = registro.establecer({
        flagId,
        valor: cuerpo.valor,
        // Un admin de tenant no puede cambiar el flag GLOBAL de otro
        // tenant: si no manda `tenantId` explícito, el cambio se acota al
        // propio tenant de su sesión (nunca cae al valor global salvo que
        // sea superadmin sin tenant, ej. desde el panel de plataforma).
        tenantId: cuerpo.tenantId ?? auth.tenantId ?? undefined,
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
    exigirRol(auth, ...ROLES_ESCRITURA_FLAGS_AGENTES);
    const flagId = c.req.param("id");
    try {
      return c.json({ entradas: registro.auditoria(flagId) });
    } catch (error) {
      throw new ErrorDominio("recurso_no_encontrado", (error as Error).message);
    }
  });

  return app;
}

import { Hono } from "hono";
import { z } from "zod";
import type pg from "pg";
import { ColaboradorNivel, ErrorDominio, RolUsuario } from "../contrato/tipos.js";
import { conSesion, enTransaccion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { sesionDeAuth } from "../middleware/tenant.js";
import { hashContrasena } from "../seguridad/contrasenas.js";

const CuerpoCrearUsuario = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    rol: RolUsuario,
    colaboradorNivel: ColaboradorNivel.optional(),
    ownerId: z.string().uuid().optional(),
  })
  .refine((v) => v.rol !== "operador" || v.colaboradorNivel !== undefined, {
    message: "colaboradorNivel es requerido cuando rol='operador'",
  })
  .refine((v) => v.rol === "propietario" || v.ownerId === undefined, {
    message: "ownerId solo aplica cuando rol='propietario'",
  });

/** H-043: alta de colaboradores/roles internos dentro del propio tenant.
 * Exclusivo de admin_gestora/superadmin (H-044: nadie más puede escalar su
 * propio rol ni el de otro usuario a través de este endpoint — RLS
 * `usuario_escritura`/`usuario_actualizacion` respalda esto). */
export function crearRutasUsuarios(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    if (!auth.tenantId) {
      throw new ErrorDominio("validacion", "Superadmin debe operar con un tenant explícito (fuera de alcance de este lote)");
    }
    const cuerpo = CuerpoCrearUsuario.parse(await c.req.json());
    const passwordHash = await hashContrasena(cuerpo.password);

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const { rows } = await cliente.query<{ id: string }>(
          `INSERT INTO usuario (tenant_id, email, rol, colaborador_nivel, owner_id, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [auth.tenantId, cuerpo.email, cuerpo.rol, cuerpo.colaboradorNivel ?? null, cuerpo.ownerId ?? null, passwordHash],
        );
        return rows[0]!;
      }),
    );

    return c.json({ id: fila.id, email: cuerpo.email, rol: cuerpo.rol, colaboradorNivel: cuerpo.colaboradorNivel ?? null }, 201);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query(
        "SELECT id, email, rol, colaborador_nivel, activo FROM usuario ORDER BY creado_en DESC",
      );
      return rows;
    });
    return c.json({
      usuarios: filas.map((f) => ({
        id: f.id,
        email: f.email,
        rol: f.rol,
        colaboradorNivel: f.colaborador_nivel,
        activo: f.activo,
      })),
    });
  });

  return app;
}

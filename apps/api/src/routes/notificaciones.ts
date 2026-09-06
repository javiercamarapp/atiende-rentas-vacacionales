import { Hono } from "hono";
import type pg from "pg";
import { CuerpoPreferenciaNotificacion, CuerpoWebhookTenant, ErrorDominio, type PreferenciaNotificacionContrato, type RespuestaWebhookTenant, type RespuestaWebhookTenantCreado } from "../contrato/tipos.js";
import { conSesion, enTransaccion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { ROLES_ADMIN } from "../rolesComunes.js";
import { sesionDeAuth } from "../middleware/tenant.js";
import { cifrarSecretoWebhook } from "../workers/notificaciones/cifradoSecreto.js";
import { randomBytes } from "node:crypto";

/**
 * H-054 (BACKLOG E08/E15, REQ-117, §Limpieza-2): CRUD de preferencias de
 * notificación (por usuario, sobre su propia sesión — nunca sobre otro
 * usuario) y configuración del webhook saliente firmado (por tenant,
 * ROLES_ADMIN — mismo nivel que el resto de configuración de integración,
 * ver `pricing.ts`/`canales.ts`). El envío real (correo/webhook) lo hace
 * `workers/notificaciones/dispatcher.ts`, invocado desde los puntos que
 * generan un evento notificable (hoy: `POST /pricing/.../paridad`, H-071)
 * — esta ruta solo administra configuración, nunca envía nada ella misma.
 */
export function crearRutasNotificaciones(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/preferencias", async (c) => {
    const auth = c.get("auth");
    const preferencias = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cliente.query<{ tipo_evento: string; canal: string; activo: boolean }>(
        "SELECT tipo_evento, canal, activo FROM preferencia_notificacion_usuario WHERE usuario_id = $1",
        [auth.usuarioId],
      ),
    );
    const cuerpo: PreferenciaNotificacionContrato[] = preferencias.rows.map((r) => ({
      tipoEvento: r.tipo_evento as PreferenciaNotificacionContrato["tipoEvento"],
      canal: r.canal as PreferenciaNotificacionContrato["canal"],
      activo: r.activo,
    }));
    return c.json({ preferencias: cuerpo });
  });

  // Upsert de UNA preferencia — siempre sobre el usuario autenticado
  // (nunca recibe un usuarioId en el cuerpo: no hay forma de que un
  // usuario cambie las preferencias de otro por esta ruta).
  app.put("/preferencias", async (c) => {
    const auth = c.get("auth");
    const cuerpo = CuerpoPreferenciaNotificacion.parse(await c.req.json());
    await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      enTransaccion(cliente, async () => {
        await cliente.query(
          `INSERT INTO preferencia_notificacion_usuario (usuario_id, tipo_evento, canal, activo)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (usuario_id, tipo_evento, canal) DO UPDATE SET activo = EXCLUDED.activo, actualizado_en = now()`,
          [auth.usuarioId, cuerpo.tipoEvento, cuerpo.canal, cuerpo.activo],
        );
      }),
    );
    return c.json({ ok: true });
  });

  app.get("/webhook", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    if (!auth.tenantId) throw new ErrorDominio("validacion", "Esta cuenta no pertenece a ningún tenant");
    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cliente.query<{ url: string; activo: boolean }>("SELECT url, activo FROM webhook_tenant WHERE tenant_id = $1", [auth.tenantId]),
    );
    const respuesta: RespuestaWebhookTenant = fila.rows[0]
      ? { url: fila.rows[0].url, activo: fila.rows[0].activo, configurado: true }
      : { url: "", activo: false, configurado: false };
    return c.json(respuesta);
  });

  // Crea o ROTA el webhook del tenant — genera un secreto HMAC nuevo cada
  // vez (nunca lo reutiliza), lo cifra en reposo (AES-256-GCM,
  // `cifradoSecreto.ts`) y lo devuelve EN CLARO una única vez en esta
  // respuesta. Nunca se puede recuperar después (GET /webhook no lo
  // incluye) — si se pierde, hay que rotar de nuevo.
  app.post("/webhook", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    if (!auth.tenantId) throw new ErrorDominio("validacion", "Esta cuenta no pertenece a ningún tenant");
    const cuerpo = CuerpoWebhookTenant.parse(await c.req.json());
    const secretoHmac = randomBytes(32).toString("hex");
    const { secretoCifrado, secretoIv, secretoTag } = cifrarSecretoWebhook(secretoHmac);

    await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      enTransaccion(cliente, async () => {
        await cliente.query(
          `INSERT INTO webhook_tenant (tenant_id, url, secreto_cifrado, secreto_iv, secreto_tag, activo)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (tenant_id) DO UPDATE SET
             url = EXCLUDED.url, secreto_cifrado = EXCLUDED.secreto_cifrado, secreto_iv = EXCLUDED.secreto_iv,
             secreto_tag = EXCLUDED.secreto_tag, activo = EXCLUDED.activo, actualizado_en = now()`,
          [auth.tenantId, cuerpo.url, secretoCifrado, secretoIv, secretoTag, cuerpo.activo],
        );
      }),
    );

    const respuesta: RespuestaWebhookTenantCreado = { url: cuerpo.url, activo: cuerpo.activo, configurado: true, secretoHmac };
    return c.json(respuesta, 201);
  });

  app.delete("/webhook", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    if (!auth.tenantId) throw new ErrorDominio("validacion", "Esta cuenta no pertenece a ningún tenant");
    await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      enTransaccion(cliente, async () => {
        await cliente.query("DELETE FROM webhook_tenant WHERE tenant_id = $1", [auth.tenantId]);
      }),
    );
    return c.json({ ok: true });
  });

  return app;
}

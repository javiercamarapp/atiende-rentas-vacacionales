import { Hono } from "hono";
import type pg from "pg";
import { evaluarEstadoConexion } from "@atiende-rv/domain";
import { CuerpoCrearCuentaCanal, ErrorDominio } from "../contrato/tipos.js";
import { conSesion, enTransaccion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { sesionDeAuth } from "../middleware/tenant.js";
import type { KeyringCifradoCanal } from "../seguridad/cifrado.js";

/** Ventana de "sync reciente" para considerar honestamente `producción`
 * (D-017): 6 horas — más laxa que la latencia declarada de Airbnb (~3h)
 * para no marcar `partner_pendiente` una integración sana en un ciclo de
 * polling lento, pero corta para nunca describir como productiva una
 * integración que dejó de sincronizar hace días. */
const VENTANA_SYNC_RECIENTE_MS = 6 * 60 * 60 * 1000;

interface FilaCuentaCanal {
  id: string;
  nombre: string;
  canal_codigo: string;
  es_simulador: boolean;
  es_sandbox: boolean;
  partner_aprobado: boolean;
  credenciales_cifradas: Buffer | null;
  ultima_sincronizacion_exitosa_en: string | null;
}

function estadoDeFila(fila: FilaCuentaCanal): string {
  return evaluarEstadoConexion({
    credencialesPresentes: fila.credenciales_cifradas !== null,
    esSimulador: fila.es_simulador,
    ultimaSincronizacionExitosaEn: fila.ultima_sincronizacion_exitosa_en,
    ventanaMaximaMs: VENTANA_SYNC_RECIENTE_MS,
    partnerAprobado: fila.partner_aprobado,
    esSandbox: fila.es_sandbox,
  });
}

export function crearRutasCanales(pool: pg.Pool, jwtSecret: string, keyring: KeyringCifradoCanal): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // GET /canales — cuentas de canal del tenant con estado de conexión
  // honesto (D-017/D-019): nunca "producción" para un simulador, nunca sin
  // evidencia de sync real reciente.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query<FilaCuentaCanal>(
        `SELECT cc.id, cc.nombre, ca.codigo AS canal_codigo, cc.es_simulador, cc.es_sandbox,
                cc.partner_aprobado, cc.credenciales_cifradas, cc.ultima_sincronizacion_exitosa_en
         FROM cuenta_canal cc
         JOIN canal ca ON ca.id = cc.canal_id
         ORDER BY cc.creado_en DESC`,
      );
      return rows;
    });

    return c.json({
      cuentas: filas.map((f) => ({
        id: f.id,
        canalCodigo: f.canal_codigo,
        nombre: f.nombre,
        estadoConexion: estadoDeFila(f),
        esSimulador: f.es_simulador,
        ultimaSincronizacionExitosaEn: f.ultima_sincronizacion_exitosa_en,
      })),
    });
  });

  // POST /cuentas-canal — admin_gestora/superadmin únicamente; cifra las
  // credenciales con AES-256-GCM antes de escribirlas (H-046).
  app.post("/cuentas", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const cuerpo = CuerpoCrearCuentaCanal.parse(await c.req.json());
    const tenantId = cuerpo.tenantId ?? auth.tenantId;
    if (!tenantId) {
      throw new ErrorDominio("validacion", "tenantId es requerido para superadmin");
    }

    const cifrado = cuerpo.credenciales
      ? keyring.cifrar(JSON.stringify(cuerpo.credenciales))
      : null;

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const canal = await cliente.query<{ id: string }>("SELECT id FROM canal WHERE codigo = $1", [
          cuerpo.canalCodigo,
        ]);
        if (!canal.rows[0]) {
          throw new ErrorDominio("validacion", `Canal desconocido: "${cuerpo.canalCodigo}"`);
        }
        const { rows } = await cliente.query<{ id: string }>(
          `INSERT INTO cuenta_canal
             (tenant_id, propiedad_id, canal_id, nombre, es_simulador,
              credenciales_cifradas, credenciales_iv, credenciales_tag, credenciales_clave_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            tenantId,
            cuerpo.propiedadId ?? null,
            canal.rows[0].id,
            cuerpo.nombre,
            cuerpo.esSimulador ?? false,
            cifrado?.cifrado ?? null,
            cifrado?.iv ?? null,
            cifrado?.tag ?? null,
            cifrado?.claveVersion ?? null,
          ],
        );
        return rows[0]!;
      }),
    );

    return c.json({ id: fila.id }, 201);
  });

  // POST /canales/:id/sync — encola un evento en outbox_evento; la
  // ejecución real (llamar al ChannelAdapter/simulador correspondiente) la
  // hace el worker de Lote 2 consumiendo esa cola, nunca esta API.
  app.post("/:id/sync", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora", "operador");
    const cuentaCanalId = c.req.param("id");

    await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const existente = await cliente.query("SELECT id FROM cuenta_canal WHERE id = $1", [cuentaCanalId]);
        if (existente.rows.length === 0) {
          throw new ErrorDominio("recurso_no_encontrado", "Cuenta de canal no encontrada");
        }
        await cliente.query(
          `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
           VALUES (NULL, 'sync_manual_solicitado', $1::jsonb)`,
          [JSON.stringify({ cuentaCanalId, solicitadoPor: auth.usuarioId })],
        );
      }),
    );

    return c.json({ encolado: true }, 202);
  });

  return app;
}

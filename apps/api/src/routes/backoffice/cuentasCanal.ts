import { Hono } from "hono";
import type pg from "pg";
import { evaluarEstadoConexion } from "@atiende-rv/domain";
import { CuerpoCrearCuentaCanalBackoffice, ErrorDominio } from "../../contrato/tipos.js";
import { cargarConfiguracion } from "../../config/env.js";
import { conSesion, enTransaccion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exigirRol } from "../../middleware/roles.js";
import { sesionDeAuth } from "../../middleware/tenant.js";
import type { KeyringCifradoCanal } from "../../seguridad/cifrado.js";
import { relanzarSiRlsRechazo, resolverTenantId } from "./comun.js";

const VENTANA_SYNC_RECIENTE_MS = 6 * 60 * 60 * 1000;

interface FilaCuentaCanal {
  id: string;
  nombre: string;
  canal_codigo: string;
  tipo_conexion: string | null;
  motivo_partner_pendiente: string | null;
  es_simulador: boolean;
  es_sandbox: boolean;
  partner_aprobado: boolean;
  credenciales_cifradas: Buffer | null;
  ultima_sincronizacion_exitosa_en: string | null;
}

function serializar(f: FilaCuentaCanal) {
  return {
    id: f.id,
    canalCodigo: f.canal_codigo,
    nombre: f.nombre,
    // H-012/D-017: tipo de conexión honesto declarado en el alta —
    // "ical"/"partner_pendiente"/"simulador" — nunca inferido a partir de
    // banderas sueltas para no dejar un estado indefinido en la UI.
    tipoConexion: f.tipo_conexion,
    // Auditoría 2, corrección D-DSD-13: falta pasar `tipoConexion` al
    // dominio (que ya soporta este campo opcional) — sin esto, una cuenta
    // `tipo_conexion='ical'` sana se reportaba como `partner_pendiente`
    // porque `partner_aprobado` nunca se establece para esa vía.
    estadoConexion: evaluarEstadoConexion({
      credencialesPresentes: f.credenciales_cifradas !== null,
      esSimulador: f.es_simulador,
      ultimaSincronizacionExitosaEn: f.ultima_sincronizacion_exitosa_en,
      ventanaMaximaMs: VENTANA_SYNC_RECIENTE_MS,
      partnerAprobado: f.partner_aprobado,
      esSandbox: f.es_sandbox,
      tipoConexion: f.tipo_conexion === "ical" ? "ical" : "api",
    }),
    // §RV19/21-13: NUNCA se devuelve la credencial en claro ni cifrada —
    // solo si está "configurada" o no.
    credencialesConfiguradas: f.credenciales_cifradas !== null,
    motivoPartnerPendiente: f.motivo_partner_pendiente,
    esSimulador: f.es_simulador,
  };
}

const SELECT_CUENTA_CANAL = `
  SELECT cc.id, cc.nombre, ca.codigo AS canal_codigo, cc.tipo_conexion, cc.motivo_partner_pendiente,
         cc.es_simulador, cc.es_sandbox, cc.partner_aprobado, cc.credenciales_cifradas,
         cc.ultima_sincronizacion_exitosa_en
  FROM cuenta_canal cc
  JOIN canal ca ON ca.id = cc.canal_id
`;

/**
 * Alta de cuentas de canal con tipo de conexión HONESTO (H-011/H-012,
 * D-017/D-019, regla de oro DEFINICION-DE-HECHO §1): iCal import/export,
 * partner pendiente (exige `motivoPartnerPendiente` — validado también en
 * el `zod` del contrato) o simulador — bloqueado fuera de `development`/
 * `test` (nunca se presenta un simulador como conexión productiva).
 * Credenciales cifradas (Lote 3, AES-256-GCM) y NUNCA devueltas: la
 * lectura solo expone `credencialesConfiguradas: boolean`.
 */
export function crearRutasBackofficeCuentasCanal(pool: pg.Pool, jwtSecret: string, keyring: KeyringCifradoCanal): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora", "operador");
    const tenantId = resolverTenantId(auth, c.req.query("tenantId"));

    const filas = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) => {
        const { rows } = await cliente.query<FilaCuentaCanal>(
          `${SELECT_CUENTA_CANAL} WHERE cc.tenant_id = $1 ORDER BY cc.creado_en DESC`,
          [tenantId],
        );
        return rows;
      }),
    );

    return c.json({ cuentas: filas.map(serializar) });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const cuerpo = CuerpoCrearCuentaCanalBackoffice.parse(await c.req.json());
    const tenantId = resolverTenantId(auth, cuerpo.tenantId);

    if (cuerpo.tipoConexion === "simulador") {
      const entorno = cargarConfiguracion().entorno;
      if (entorno === "production") {
        throw new ErrorDominio(
          "validacion",
          "Un simulador nunca se presenta como conexión productiva (D-019): bloqueado fuera de development/test",
        );
      }
    }

    const cifrado = cuerpo.credenciales ? keyring.cifrar(JSON.stringify(cuerpo.credenciales)) : null;

    const fila = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) =>
        enTransaccion(cliente, async () => {
          const canal = await cliente.query<{ id: string }>("SELECT id FROM canal WHERE codigo = $1", [
            cuerpo.canalCodigo,
          ]);
          if (!canal.rows[0]) {
            throw new ErrorDominio("validacion", `Canal desconocido: "${cuerpo.canalCodigo}"`);
          }
          const { rows } = await cliente.query<{ id: string }>(
            `INSERT INTO cuenta_canal
               (tenant_id, propiedad_id, canal_id, nombre, tipo_conexion, motivo_partner_pendiente,
                es_simulador, credenciales_cifradas, credenciales_iv, credenciales_tag, credenciales_clave_version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
              tenantId,
              cuerpo.propiedadId ?? null,
              canal.rows[0].id,
              cuerpo.nombre,
              cuerpo.tipoConexion,
              cuerpo.motivoPartnerPendiente ?? null,
              cuerpo.tipoConexion === "simulador",
              cifrado?.cifrado ?? null,
              cifrado?.iv ?? null,
              cifrado?.tag ?? null,
              cifrado?.claveVersion ?? null,
            ],
          );
          return rows[0]!;
        }),
      ),
    );

    const filaCompleta = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query<FilaCuentaCanal>(`${SELECT_CUENTA_CANAL} WHERE cc.id = $1`, [fila.id]);
      return rows[0]!;
    });

    return c.json(serializar(filaCompleta), 201);
  });

  return app;
}

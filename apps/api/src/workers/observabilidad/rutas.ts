import { Hono } from "hono";
import type pg from "pg";
import type { EjecutorSql, FilaSql } from "@atiende-rv/db";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exponerFormatoPrometheus, resumenLatenciaEtiquetada, RegistroMetricas } from "./metricas.js";
import { contarPendientesOutbox, edadPendienteMasViejoMs } from "./outboxWorker.js";
import { reconocerAlerta, resolverAlerta } from "./alertas.js";
import { crearRutasCronSyncIcal } from "../../rutas/internas/cronSync.js";

/**
 * `/metrics` (Prometheus text) y `/health/detallado` (Lote 10, H-035),
 * más un CRUD mínimo de alertas con ack (H-037). Sub-router independiente
 * — `app.ts` (Lote 3) lo monta con UNA línea (`app.route("/", rutasObservabilidad(...))`),
 * el mismo patrón de fusión que `registrarRutas` usa para cada dominio.
 *
 * Corrección Auditoría 2 (P-02/producto-ux-operacion.md): `/alertas*`
 * exige sesión igual que el resto de la API (`requiereAutenticacion`) —
 * antes de esta corrección estas 3 rutas se montaban ANTES de
 * `registrarRutas` sin ningún middleware de auth, así que `GET /alertas`
 * era de lectura pública sin token y `POST /alertas/:id/ack` siempre
 * devolvía 401 (dependía de `c.get("auth")`, nunca poblado). `/metrics` y
 * `/health/detallado` se dejan exactamente como estaban — son sondas de
 * infraestructura sin sesión de usuario, mismo comportamiento previo.
 */
export interface DependenciasRutasObservabilidad {
  metricas: RegistroMetricas;
  pool: pg.Pool;
  jwtSecret: string;
}

interface FilaAlerta extends FilaSql {
  id: string;
  tipo: string;
  severidad: string;
  canal_id: string | null;
  unidad_id: string | null;
  mensaje: string;
  metadata: unknown;
  accion_reversible: string | null;
  estado: string;
  creado_en: string;
  reconocida_por: string | null;
  reconocida_en: string | null;
  resuelta_en: string | null;
}

export function crearEjecutorSoloLectura(pool: pg.Pool): EjecutorSql {
  return {
    async query(sql, params) {
      const resultado = await pool.query(sql, params as unknown[] | undefined);
      return { rows: resultado.rows, rowCount: resultado.rowCount };
    },
    async exec(sql) {
      await pool.query(sql);
    },
  };
}

export function rutasObservabilidad(deps: DependenciasRutasObservabilidad): Hono {
  const app = new Hono();
  const ejecutor = crearEjecutorSoloLectura(deps.pool);

  app.get("/metrics", (c) => c.text(exponerFormatoPrometheus(deps.metricas), 200, { "content-type": "text/plain; version=0.0.4" }));

  app.get("/health/detallado", async (c) => {
    let dbOk = true;
    let tamanoColaOutbox: number | null = null;
    let edadPendienteMasViejo: number | null = null;
    try {
      tamanoColaOutbox = await contarPendientesOutbox(ejecutor);
      edadPendienteMasViejo = await edadPendienteMasViejoMs(ejecutor);
    } catch {
      dbOk = false;
    }

    return c.json({
      status: dbOk ? "ok" : "degradado",
      db: { conectada: dbOk },
      outbox: { tamanoCola: tamanoColaOutbox, edadPendienteMasViejoMs: edadPendienteMasViejo },
      metricas: deps.metricas.snapshot(),
      // H-073: misma información que `metricas.latenciaInternaMs`/
      // `latenciaExternaDeclaradaSegundos`, ya separada y etiquetada
      // explícitamente para que ningún consumidor (UI o humano) confunda
      // "medido" con "declarado" — ver `metricas.ts:resumenLatenciaEtiquetada`.
      latenciaResumen: resumenLatenciaEtiquetada(deps.metricas),
    });
  });

  const rutasAlertas = new Hono();
  rutasAlertas.use("*", requiereAutenticacion(deps.jwtSecret));

  rutasAlertas.get("/", async (c) => {
    const estado = c.req.query("estado");
    const resultado = await ejecutor.query<FilaAlerta>(
      estado
        ? `SELECT * FROM alerta WHERE estado = $1 ORDER BY creado_en DESC LIMIT 200`
        : `SELECT * FROM alerta ORDER BY creado_en DESC LIMIT 200`,
      estado ? [estado] : [],
    );
    return c.json({ alertas: resultado.rows });
  });

  rutasAlertas.post("/:id/ack", async (c) => {
    const auth = c.get("auth");
    await reconocerAlerta(ejecutor, c.req.param("id"), auth.usuarioId);
    return c.json({ ok: true });
  });

  rutasAlertas.post("/:id/resolver", async (c) => {
    await resolverAlerta(ejecutor, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.route("/alertas", rutasAlertas);

  // GET /internal/cron/sync-ical (H-cron-sync, paquete cron-sync): dispara
  // el motor de sync iCal para todos los canales activos de todos los
  // tenants — ver apps/api/src/rutas/internas/cronSync.ts para el diseño
  // completo (protegido por CRON_SECRET, nunca por requiereAutenticacion:
  // lo invoca Vercel Cron, no un usuario logueado). Montada aquí, sin
  // tocar app.ts, reutilizando el mismo punto de fusión que el resto de
  // esta función (`app.route("/", rutasObservabilidad(...))` en app.ts).
  app.route("/internal/cron", crearRutasCronSyncIcal({ pool: deps.pool, metricas: deps.metricas }));

  return app;
}

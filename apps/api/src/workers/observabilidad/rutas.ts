import { Hono } from "hono";
import type pg from "pg";
import type { EjecutorSql, FilaSql } from "@atiende-rv/db";
import { exponerFormatoPrometheus, RegistroMetricas } from "./metricas.js";
import { contarPendientesOutbox, edadPendienteMasViejoMs } from "./outboxWorker.js";
import { reconocerAlerta, resolverAlerta } from "./alertas.js";

/**
 * `/metrics` (Prometheus text) y `/health/detallado` (Lote 10, H-035),
 * más un CRUD mínimo de alertas con ack (H-037). Sub-router independiente
 * — `app.ts` (Lote 3) lo monta con UNA línea (`app.route("/", rutasObservabilidad(...))`),
 * el mismo patrón de fusión que `registrarRutas` usa para cada dominio.
 */
export interface DependenciasRutasObservabilidad {
  metricas: RegistroMetricas;
  pool: pg.Pool;
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
    });
  });

  app.get("/alertas", async (c) => {
    const estado = c.req.query("estado");
    const resultado = await ejecutor.query<FilaAlerta>(
      estado
        ? `SELECT * FROM alerta WHERE estado = $1 ORDER BY creado_en DESC LIMIT 200`
        : `SELECT * FROM alerta ORDER BY creado_en DESC LIMIT 200`,
      estado ? [estado] : [],
    );
    return c.json({ alertas: resultado.rows });
  });

  app.post("/alertas/:id/ack", async (c) => {
    const auth = c.get("auth" as never) as { usuarioId?: string } | undefined;
    const usuarioId = auth?.usuarioId;
    if (!usuarioId) {
      return c.json({ error: { codigo: "no_autenticado", mensaje: "Se requiere sesión para reconocer una alerta" } }, 401);
    }
    await reconocerAlerta(ejecutor, c.req.param("id"), usuarioId);
    return c.json({ ok: true });
  });

  app.post("/alertas/:id/resolver", async (c) => {
    await resolverAlerta(ejecutor, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}

import { Hono, type Context } from "hono";
import type pg from "pg";
import { calcularMetricasPeriodo } from "@atiende-rv/domain/finanzas";
import { ErrorDominio, QueryReportePeriodo } from "../contrato/tipos.js";
import { conSesion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { sesionDeAuth } from "../middleware/tenant.js";

/**
 * Reporting (Lote 7, BACKLOG E12, RV17 §12). Regla no negociable: SOLO
 * lectura de tablas ya pobladas por otros lotes (`ocupacion_unidad`,
 * `reserva_financiero`, `unidad`, `propiedad`, `canal`) — ninguna lógica de
 * cálculo financiero se duplica aquí; los agregados se derivan con SQL
 * (`SUM`/`COUNT`) y las métricas estándar (ocupación/ADR/RevPAR) se
 * calculan con `@atiende-rv/domain/finanzas` (`calcularMetricasPeriodo`),
 * nunca reimplementadas inline.
 */
export function crearRutasReportes(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // GET /reportes/ocupacion — ocupación/ADR/RevPAR por unidad en el rango.
  app.get("/ocupacion", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora", "contador", "operador");
    const query = QueryReportePeriodo.parse({
      desde: c.req.query("desde"),
      hasta: c.req.query("hasta"),
      propiedadId: c.req.query("propiedadId") || undefined,
    });
    if (query.desde >= query.hasta) throw new ErrorDominio("rango_invalido", "'desde' debe ser anterior a 'hasta'");

    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query(
        `SELECT u.id AS unidad_id, u.nombre AS unidad_nombre, p.id AS propiedad_id, p.nombre AS propiedad_nombre,
                COALESCE(SUM(
                  CASE WHEN ou.capa = 'reserva' AND ou.bloqueante AND ou.estado <> 'cancelado'
                    THEN upper(ou.rango * daterange($1::date, $2::date, '[)')) - lower(ou.rango * daterange($1::date, $2::date, '[)'))
                    ELSE 0 END
                ), 0) AS noches_ocupadas,
                COALESCE(SUM(
                  CASE WHEN ou.capa = 'reserva' AND ou.bloqueante AND ou.estado <> 'cancelado'
                    THEN COALESCE(rf.monto_bruto_centavos, 0)
                    ELSE 0 END
                ), 0) AS ingresos_brutos_centavos
         FROM unidad u
         JOIN propiedad p ON p.id = u.propiedad_id
         LEFT JOIN ocupacion_unidad ou ON ou.unidad_id = u.id AND ou.rango && daterange($1::date, $2::date, '[)')
         LEFT JOIN reserva_financiero rf ON rf.ocupacion_unidad_id = ou.id
         WHERE ($3::uuid IS NULL OR p.id = $3)
         GROUP BY u.id, u.nombre, p.id, p.nombre
         ORDER BY p.nombre, u.nombre`,
        [query.desde, query.hasta, query.propiedadId ?? null],
      );
      return rows;
    });

    const nochesDelPeriodo = diasEntre(query.desde, query.hasta);
    const reporte = filas.map((f) => {
      const nochesOcupadas = Number(f.noches_ocupadas);
      const metricas = calcularMetricasPeriodo({
        ingresosBrutosCentavos: Number(f.ingresos_brutos_centavos),
        nochesOcupadas,
        nochesDisponibles: nochesDelPeriodo,
      });
      return {
        unidadId: f.unidad_id,
        unidadNombre: f.unidad_nombre,
        propiedadId: f.propiedad_id,
        propiedadNombre: f.propiedad_nombre,
        nochesOcupadas,
        nochesDisponibles: nochesDelPeriodo,
        ocupacionBasisPoints: metricas.ocupacionBasisPoints,
        adrCentavos: metricas.adrCentavos,
        revparCentavos: metricas.revparCentavos,
      };
    });

    if (c.req.query("formato") === "csv") {
      return respuestaCsv(
        c,
        "reporte-ocupacion.csv",
        ["unidadNombre", "propiedadNombre", "nochesOcupadas", "nochesDisponibles", "ocupacionBasisPoints", "adrCentavos", "revparCentavos"],
        reporte,
      );
    }
    return c.json({ desde: query.desde, hasta: query.hasta, unidades: reporte });
  });

  // GET /reportes/ingresos — ingresos agrupados por canal, propiedad y mes.
  app.get("/ingresos", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora", "contador");
    const query = QueryReportePeriodo.parse({
      desde: c.req.query("desde"),
      hasta: c.req.query("hasta"),
      propiedadId: c.req.query("propiedadId") || undefined,
    });
    if (query.desde >= query.hasta) throw new ErrorDominio("rango_invalido", "'desde' debe ser anterior a 'hasta'");

    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query(
        `SELECT to_char(date_trunc('month', lower(ou.rango)), 'YYYY-MM') AS mes,
                COALESCE(ca.codigo, 'directa') AS canal_codigo,
                p.id AS propiedad_id, p.nombre AS propiedad_nombre,
                SUM(rf.monto_bruto_centavos) AS ingresos_brutos_centavos,
                SUM(rf.neto_centavos) AS neto_centavos,
                COUNT(*) AS reservas
         FROM reserva_financiero rf
         JOIN ocupacion_unidad ou ON ou.id = rf.ocupacion_unidad_id
         JOIN unidad u ON u.id = ou.unidad_id
         JOIN propiedad p ON p.id = u.propiedad_id
         LEFT JOIN canal ca ON ca.id = ou.canal_origen_id
         WHERE ou.estado <> 'cancelado'
           AND lower(ou.rango) < $2::date AND upper(ou.rango) > $1::date
           AND ($3::uuid IS NULL OR p.id = $3)
         GROUP BY mes, canal_codigo, p.id, p.nombre
         ORDER BY mes, propiedad_nombre, canal_codigo`,
        [query.desde, query.hasta, query.propiedadId ?? null],
      );
      return rows;
    });

    const reporte = filas.map((f) => ({
      mes: f.mes,
      canalCodigo: f.canal_codigo,
      propiedadId: f.propiedad_id,
      propiedadNombre: f.propiedad_nombre,
      ingresosBrutosCentavos: Number(f.ingresos_brutos_centavos),
      netoCentavos: Number(f.neto_centavos),
      reservas: Number(f.reservas),
    }));

    if (c.req.query("formato") === "csv") {
      return respuestaCsv(
        c,
        "reporte-ingresos.csv",
        ["mes", "canalCodigo", "propiedadNombre", "ingresosBrutosCentavos", "netoCentavos", "reservas"],
        reporte,
      );
    }
    return c.json({ desde: query.desde, hasta: query.hasta, filas: reporte });
  });

  return app;
}

function diasEntre(desde: string, hasta: string): number {
  const inicio = Date.parse(`${desde}T00:00:00Z`);
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((fin - inicio) / (24 * 60 * 60 * 1000));
}

// Auditoría 2, corrección Q-08 (calidad-codigo.md): último `any` del
// repo fuera de finanzas.ts (ya tipado en la corrección Q-01) — `Context`
// de Hono es fácilmente tipable, no había motivo real para `any` aquí.
function respuestaCsv(c: Context, nombreArchivo: string, columnas: string[], filas: Record<string, unknown>[]) {
  const encabezado = columnas.join(",");
  const cuerpo = filas
    .map((fila) => columnas.map((col) => csvEscapar(String(fila[col] ?? ""))).join(","))
    .join("\n");
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
  return c.body(`${encabezado}\n${cuerpo}\n`);
}

function csvEscapar(valor: string): string {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

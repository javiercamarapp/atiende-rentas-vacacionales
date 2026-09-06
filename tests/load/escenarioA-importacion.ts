import * as http from "node:http";
import { aplicarMigraciones, crearMotorEmbeddedPostgres, migraciones } from "@atiende-rv/db";
import { estaOcupada, type Ocupacion } from "@atiende-rv/domain";
import { ejecutarCicloImport } from "@atiende-rv/adapters";
import { emitirResultado, envolverConexion, infoHardware, resumenLatencias } from "./comun.js";

/**
 * Escenario (a) — BACKLOG H-093: importación concurrente de N feeds iCal
 * midiendo LATENCIA INTERNA evento→noche cerrada (RV21 §2.2: solo la
 * latencia que el producto controla, nunca la latencia por canal externo
 * que RV21 documenta como horas y fuera del control del producto) y
 * verificando ausencia de overbooking bajo carga concurrente real (N
 * conexiones `pg` independientes, no una sola conexión serializando
 * queries).
 *
 * Uso: tsx tests/load/escenarioA-importacion.ts [unidades] [canalesPorUnidad]
 * Por defecto: 50 unidades × 3 canales = 150 ciclos de import concurrentes
 * (el ejemplo de LOTES.md/el encargo) — configurable porque el número
 * exacto NO es un requisito duro, es un tamaño de muestra razonable para
 * una máquina de desarrollo.
 */

const NUM_UNIDADES = Number(process.argv[2] ?? 50);
const CANALES_POR_UNIDAD = Number(process.argv[3] ?? 3);

async function main() {
  const motor = await crearMotorEmbeddedPostgres("atiende_rv_load_importacion");
  await aplicarMigraciones(motor.ejecutor, migraciones);

  const tenant = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant carga importación') RETURNING id`,
  );
  const tenantId = tenant.rows[0]!.id;
  const propiedad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop carga', 'America/Mexico_City') RETURNING id`,
    [tenantId],
  );
  const propiedadId = propiedad.rows[0]!.id;
  const canales = await motor.ejecutor.query<{ id: string; codigo: string }>(`SELECT id, codigo FROM canal LIMIT 3`);
  const canalIds = canales.rows.map((r) => r.id);

  // N unidades reales.
  const unidadIds: string[] = [];
  for (let i = 0; i < NUM_UNIDADES; i++) {
    const u = await motor.ejecutor.query<{ id: string }>(
      `INSERT INTO unidad (propiedad_id, nombre, duracion_minima_noches) VALUES ($1, $2, 1) RETURNING id`,
      [propiedadId, `Unidad carga ${i}`],
    );
    unidadIds.push(u.rows[0]!.id);
  }

  // Un único servidor HTTP sirve contenido DISTINTO por request según
  // query params (?u=<indiceUnidad>&c=<indiceCanal>) — más liviano que
  // levantar N×canales servidores, y ejercita igual de bien el ciclo
  // completo de fetch SSRF-safe → parseo → aplicación transaccional.
  function feedIcsPara(indiceUnidad: number, indiceCanal: number): string {
    // Rangos disjuntos por (unidad, canal): nunca se solapan entre sí,
    // así que bajo operación correcta CERO conflictos — el objetivo de
    // este escenario es medir throughput/latencia bajo concurrencia real,
    // no inyectar conflictos (eso ya lo cubre el caso adversarial 2).
    const offsetDias = indiceUnidad * 20 + indiceCanal * 3;
    const base = new Date(Date.UTC(2028, 0, 1));
    const inicio = new Date(base.getTime() + offsetDias * 86_400_000);
    const fin = new Date(inicio.getTime() + 2 * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
    const uid = `carga-${indiceUnidad}-${indiceCanal}@simulador.local`;
    return (
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CargaLote11A//EN\r\n` +
      `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20280101T000000Z\r\n` +
      `DTSTART;VALUE=DATE:${fmt(inicio)}\r\nDTEND;VALUE=DATE:${fmt(fin)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`
    );
  }

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://simulador.local");
    const u = Number(url.searchParams.get("u"));
    const c = Number(url.searchParams.get("c"));
    const cuerpo = feedIcsPara(u, c);
    res.writeHead(200, { "Content-Type": "text/calendar; charset=utf-8" });
    res.end(cuerpo);
  });
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const direccion = servidor.address();
  if (!direccion || typeof direccion === "string") throw new Error("no se pudo levantar el servidor de carga");
  const puerto = direccion.port;

  const resolverPersonalizado = (hostname: string): string[] => {
    if (hostname !== "simulador.local") throw new Error(`hostname inesperado: ${hostname}`);
    return ["127.0.0.1"];
  };

  const tareas: Array<Promise<{ latenciaMs: number; ok: boolean; unidadId: string; indiceCanal: number }>> = [];

  const inicioTotal = Date.now();
  for (let i = 0; i < NUM_UNIDADES; i++) {
    for (let j = 0; j < CANALES_POR_UNIDAD; j++) {
      const unidadId = unidadIds[i]!;
      const canalId = canalIds[j % canalIds.length]!;
      const conexion = await motor.nuevaConexion(); // conexión pg INDEPENDIENTE por tarea (concurrencia real)
      const ejecutor = envolverConexion(conexion);
      const tarea = (async () => {
        const t0 = Date.now();
        const resultado = await ejecutarCicloImport(
          { ejecutor, unidadId, canalId, zonaHorariaPropiedad: "America/Mexico_City" },
          {
            url: `http://simulador.local:${puerto}/feed.ics?u=${i}&c=${j}`,
            resolverPersonalizado,
            permitirHttpSimuladorLocal: true,
          },
        );
        const latenciaMs = Date.now() - t0;
        await conexion.end();
        return { latenciaMs, ok: resultado.eventosAplicados === 1, unidadId, indiceCanal: j };
      })();
      tareas.push(tarea);
    }
  }

  const resultados = await Promise.all(tareas);
  const duracionTotalMs = Date.now() - inicioTotal;

  await new Promise<void>((resolve) => servidor.close(() => resolve()));

  const fallidos = resultados.filter((r) => !r.ok);
  const latencias = resultados.map((r) => r.latenciaMs);

  // Verificación de "sin overbooking": ningún par de filas activas de la
  // MISMA unidad se solapa (el EXCLUDE de BD ya lo garantiza por
  // construcción, pero se verifica explícitamente aquí sobre los datos
  // reales resultantes, más el conteo de conflicto_calendario, que debe
  // ser 0 dado que los rangos generados son disjuntos por diseño).
  let overbookingDetectado = false;
  for (const unidadId of unidadIds) {
    const filas = await motor.ejecutor.query<{
      id: string;
      inicio: string;
      fin: string;
      capa: Ocupacion["capa"];
      razon: Ocupacion["razon"];
      estado: Ocupacion["estado"];
      bloqueante: boolean;
    }>(
      `SELECT id, lower(rango)::text AS inicio, upper(rango)::text AS fin, capa, razon, estado, bloqueante
       FROM ocupacion_unidad WHERE unidad_id = $1`,
      [unidadId],
    );
    const ocupaciones: Ocupacion[] = filas.rows.map((f) => ({
      id: f.id,
      unidadId,
      rango: { inicio: f.inicio, fin: f.fin },
      capa: f.capa,
      razon: f.razon,
      estado: f.estado,
      bloqueante: f.bloqueante,
    }));
    // Con rangos disjuntos por diseño, cada noche activa debe tener
    // EXACTAMENTE una fila que la cubra — si hubiera 2+, sería
    // overbooking silencioso.
    for (const o of ocupaciones) {
      const cubiertasPorOtra = ocupaciones.filter(
        (otro) => otro.id !== o.id && estaOcupada([otro], o.rango.inicio),
      );
      if (cubiertasPorOtra.length > 0) overbookingDetectado = true;
    }
  }
  const conflictos = await motor.ejecutor.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM conflicto_calendario WHERE unidad_id = ANY($1::uuid[])`,
    [unidadIds],
  );

  await motor.cerrar();

  emitirResultado({
    escenario: "A-importacion-concurrente",
    supuestos: [
      "Latencia medida es INTERNA (fetch simulado local → COMMIT en ocupacion_unidad), NUNCA latencia por canal externo (RV21 §2.2 exige reportarlas por separado; la latencia por canal real de Airbnb (~3h) / Vrbo (~30min) es un dato de RV03/RV21, no algo que este script pueda medir).",
      "El servidor iCal es local (127.0.0.1, mismo proceso/máquina) — no incluye latencia de red real de Internet ni la cadencia de refresco real de ningún canal.",
      `Cada (unidad, canal) usa una conexión pg INDEPENDIENTE (motor.nuevaConexion()) para que la concurrencia sea real, no serializada sobre un único socket.`,
      "Rangos de fechas disjuntos por diseño entre las N×canales tareas — este escenario mide throughput/latencia bajo concurrencia SIN conflicto inyectado; la detección de conflicto bajo doble-reserva real es responsabilidad de tests/adversarial/calendario (caso 2), no de este escenario de carga.",
    ],
    parametros: { unidades: NUM_UNIDADES, canalesPorUnidad: CANALES_POR_UNIDAD, totalCiclos: resultados.length },
    hardware: infoHardware(),
    duracionTotalMs,
    throughputCiclosPorSegundo: Math.round((resultados.length / duracionTotalMs) * 1000 * 100) / 100,
    latenciaInternaMs: resumenLatencias(latencias),
    ciclosFallidos: fallidos.length,
    overbookingDetectado,
    conflictosCalendarioRegistrados: Number(conflictos.rows[0]!.n),
  });
}

main().catch((error) => {
  console.error("[escenarioA-importacion] error fatal:", error);
  process.exit(1);
});

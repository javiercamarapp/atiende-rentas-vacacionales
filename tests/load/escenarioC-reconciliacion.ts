import { aplicarMigraciones, crearMotorEmbeddedPostgres, migraciones } from "@atiende-rv/db";
import { cancelarOcupacion, crearBloqueo, crearReservaConfirmada, estaOcupada, type Ocupacion } from "@atiende-rv/domain";
import { reconciliarCompleto, type UidActivoInterno } from "@atiende-rv/adapters";
import { emitirResultado, infoHardware } from "./comun.js";

/**
 * Escenario (c) — BACKLOG H-093: reconciliación completa con DRIFT
 * sembrado deliberadamente (H-032, RV07 §14/§15). Mide:
 *  1. El tiempo de la función pura `reconciliarCompleto` (sin IO) sobre un
 *     volumen realista de UIDs activos — el algoritmo es O(n) por
 *     `Array.filter` + `Set.has`, así que el interés real no es si es
 *     "rápido" (trivialmente lo es) sino confirmar que detecta el drift
 *     exacto sembrado, sin falsos positivos/negativos, a escala.
 *  2. El tiempo END-TO-END de aplicar `cancelarOcupacion` (transaccional,
 *     con IO real contra embedded-postgres) a cada candidato detectado.
 *  3. El invariante H-018/caso adversarial 5 A ESCALA: cancelar una
 *     reserva "a la deriva" nunca reabre una noche que otra causa
 *     (bloqueo de propietario deliberadamente solapado en una fracción de
 *     los casos) sigue cubriendo.
 *
 * Uso: tsx tests/load/escenarioC-reconciliacion.ts [unidades] [reservasPorUnidad] [pctDrift]
 */

const UNIDADES = Number(process.argv[2] ?? 50);
const RESERVAS_POR_UNIDAD = Number(process.argv[3] ?? 10);
const PCT_DRIFT = Number(process.argv[4] ?? 0.1); // 10% por defecto

async function main() {
  const motor = await crearMotorEmbeddedPostgres("atiende_rv_load_reconciliacion");
  await aplicarMigraciones(motor.ejecutor, migraciones);

  const tenant = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant carga reconciliación') RETURNING id`,
  );
  const propiedad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop reconciliación', 'America/Mexico_City') RETURNING id`,
    [tenant.rows[0]!.id],
  );
  const canal = await motor.ejecutor.query<{ id: string }>(`SELECT id FROM canal LIMIT 1`);
  const canalId = canal.rows[0]!.id;

  interface Semilla {
    unidadId: string;
    ocupacionId: string;
    uid: string;
    rango: { inicio: string; fin: string };
    tieneBloqueoSuperpuesto: boolean;
  }
  const semillas: Semilla[] = [];

  const t0Seed = Date.now();
  for (let u = 0; u < UNIDADES; u++) {
    const unidad = await motor.ejecutor.query<{ id: string }>(
      `INSERT INTO unidad (propiedad_id, nombre, duracion_minima_noches) VALUES ($1, $2, 1) RETURNING id`,
      [propiedad.rows[0]!.id, `Unidad reconc ${u}`],
    );
    const unidadId = unidad.rows[0]!.id;
    for (let r = 0; r < RESERVAS_POR_UNIDAD; r++) {
      const offsetDias = r * 10;
      const base = new Date(Date.UTC(2028, 3, 1));
      const inicio = new Date(base.getTime() + offsetDias * 86_400_000);
      const fin = new Date(inicio.getTime() + 3 * 86_400_000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const rango = { inicio: fmt(inicio), fin: fmt(fin) };
      const uid = `reconc-${u}-${r}@canal-externo.com`;
      const creado = await crearReservaConfirmada(motor.ejecutor, {
        unidadId,
        rango,
        estado: "confirmado",
        bloqueante: true,
        canalOrigenId: canalId,
        externalId: uid,
      });
      semillas.push({ unidadId, ocupacionId: creado.ocupacionId, uid, rango, tieneBloqueoSuperpuesto: false });
    }
  }
  const duracionSeedMs = Date.now() - t0Seed;

  // Selecciona el X% que hará "drift" (desapareció del feed externo sin
  // que el sistema se enterara — cancelación del canal que nunca llegó,
  // o el propio canal la eliminó silenciosamente).
  const totalActivos = semillas.length;
  const numDrift = Math.round(totalActivos * PCT_DRIFT);
  const indicesDrift = new Set<number>();
  // Selección determinística (cada k-ésimo elemento) — reproducible, no
  // aleatoria, para que el reporte sea verificable exactamente.
  const paso = Math.max(1, Math.floor(totalActivos / numDrift));
  for (let i = 0; indicesDrift.size < numDrift && i < totalActivos; i += paso) indicesDrift.add(i);

  // Para 1 de cada 3 de los que van a "driftar", siembra ADEMÁS un
  // bloqueo de propietario que se solapa exactamente con esa reserva —
  // el invariante H-018 a verificar: cancelar la reserva NO debe reabrir
  // esa noche.
  let contadorConBloqueo = 0;
  for (const i of indicesDrift) {
    if (contadorConBloqueo % 3 === 0) {
      const s = semillas[i]!;
      await crearBloqueo(motor.ejecutor, {
        unidadId: s.unidadId,
        rango: s.rango,
        razon: "BLOQUEO_PROPIETARIO",
      });
      s.tieneBloqueoSuperpuesto = true;
    }
    contadorConBloqueo++;
  }

  const activosInternos: UidActivoInterno[] = semillas.map((s) => ({
    ocupacionUnidadId: s.ocupacionId,
    uidCanal: s.uid,
  }));
  const uidsPresentesEnFeedActual = new Set(
    semillas.filter((_, i) => !indicesDrift.has(i)).map((s) => s.uid),
  );

  const t0Reconciliar = Date.now();
  const resultado = reconciliarCompleto(activosInternos, uidsPresentesEnFeedActual);
  const duracionReconciliarMs = Date.now() - t0Reconciliar;

  const driftDetectadoCorrecto = resultado.drift === indicesDrift.size;

  // Aplica la cancelación real (transaccional, IO) a cada candidato.
  const t0Cancelar = Date.now();
  for (const candidato of resultado.candidatosACancelarPorAusencia) {
    await cancelarOcupacion(motor.ejecutor, candidato.ocupacionUnidadId);
  }
  const duracionCancelarMs = Date.now() - t0Cancelar;

  // Verifica H-018 a escala: para cada semilla marcada como drift, la
  // noche de inicio de su rango debe seguir ocupada SI Y SOLO SI tenía un
  // bloqueo superpuesto sembrado.
  let violacionesH018 = 0;
  for (const i of indicesDrift) {
    const s = semillas[i]!;
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
      [s.unidadId],
    );
    const ocupaciones: Ocupacion[] = filas.rows.map((f) => ({
      id: f.id,
      unidadId: s.unidadId,
      rango: { inicio: f.inicio, fin: f.fin },
      capa: f.capa,
      razon: f.razon,
      estado: f.estado,
      bloqueante: f.bloqueante,
    }));
    const siguemOcupada = estaOcupada(ocupaciones, s.rango.inicio);
    const esperado = s.tieneBloqueoSuperpuesto;
    if (siguemOcupada !== esperado) violacionesH018++;
  }

  await motor.cerrar();

  emitirResultado({
    escenario: "C-reconciliacion-con-drift",
    supuestos: [
      "reconciliarCompleto es una función PURA sin IO — el tiempo medido es CPU pura sobre arrays/Set en memoria, no representa latencia de red ni de base de datos.",
      "El drift se siembra DETERMINÍSTICAMENTE (cada k-ésimo elemento), no aleatoriamente — el número exacto reportado es reproducible.",
      "duracionCancelarMs SÍ incluye IO real (una transacción por cancelación, mismo camino que producción) — es la parte relevante para estimar el costo de aplicar un lote de reconciliación real.",
    ],
    parametros: {
      unidades: UNIDADES,
      reservasPorUnidad: RESERVAS_POR_UNIDAD,
      totalActivos,
      pctDriftSolicitado: PCT_DRIFT,
      numDriftSembrado: indicesDrift.size,
    },
    hardware: infoHardware(),
    duracionSeedMs,
    duracionReconciliarPuraMs: duracionReconciliarMs,
    duracionCancelarLoteMs: duracionCancelarMs,
    promedioMsPorCancelacion: Math.round((duracionCancelarMs / Math.max(1, resultado.candidatosACancelarPorAusencia.length)) * 100) / 100,
    driftDetectado: resultado.drift,
    driftDetectadoCorrecto,
    violacionesH018,
    invarianteH018Ok: violacionesH018 === 0,
  });
}

main().catch((error) => {
  console.error("[escenarioC-reconciliacion] error fatal:", error);
  process.exit(1);
});

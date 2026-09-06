import {
  calcularHashContenido,
  cancelarOcupacion,
  crearReservaConfirmada,
  modificarFechasReserva,
  resolverVersion,
  type EjecutorTransaccional,
  type RangoFechas,
  type VersionEvento,
} from "@atiende-rv/domain";
import { fetchIcsSeguro, type OpcionesFetchIcs } from "../net/fetchSsrf.js";
import { IcsParseError, parsearIcs, type LimitesParserIcs, type VEventNormalizado } from "../ical/parser.js";
import { resolverFechaLocal } from "../ical/resolverFecha.js";
import { detectarEco } from "./antiEco.js";
import {
  aplicarResultadoCiclo,
  ESTADO_FEED_INICIAL,
  type AlertaCuarentena,
  type EstadoFeedCanal,
  type ResultadoCicloFetch,
} from "./cuarentena.js";
import {
  construirUidExportado,
  exportarFeedIcs,
  type BloqueoExportable,
  type FeedExportado,
} from "../ical/exportador.js";

/**
 * Motor de sincronización iCal (H-029 a H-034): orquesta fetch SSRF-safe →
 * parseo con límites → anti-eco 3 capas → resolución de versión del
 * dominio (UID→SEQUENCE→DTSTAMP+hash) → aplicación transaccional
 * (`@atiende-rv/domain`) → cuarentena → métricas, todo persistido contra
 * las tablas de la migración 0020/0021.
 */

export interface ContextoSincronizacion {
  ejecutor: EjecutorTransaccional;
  unidadId: string;
  canalId: string;
  zonaHorariaPropiedad: string;
  limites?: LimitesParserIcs;
}

export interface ResultadoImportarCiclo {
  resultado: ResultadoCicloFetch;
  eventosEnFeed: number;
  eventosAplicados: number;
  ecosDescartados: number;
  revisionesUidReciclado: number;
  conflictosDetectados: number;
  alertaCuarentena: AlertaCuarentena | null;
}

interface FilaFeed {
  [columna: string]: unknown;
  ultima_sincronizacion_exitosa_en: string | null;
  en_cuarentena_desde: string | null;
  intentos_fallidos_consecutivos: number;
  motivo_cuarentena: string | null;
  etag_import: string | null;
  ultima_modificacion_http_import: string | null;
}

async function obtenerEstadoFeed(
  ctx: ContextoSincronizacion,
): Promise<{ estado: EstadoFeedCanal; etag: string | null; lastModified: string | null }> {
  const fila = await ctx.ejecutor.query<FilaFeed>(
    `SELECT ultima_sincronizacion_exitosa_en, en_cuarentena_desde, intentos_fallidos_consecutivos,
            motivo_cuarentena, etag_import, ultima_modificacion_http_import
     FROM unidad_canal_feed WHERE unidad_id = $1 AND canal_id = $2`,
    [ctx.unidadId, ctx.canalId],
  );
  const f = fila.rows[0];
  if (!f) {
    return { estado: ESTADO_FEED_INICIAL, etag: null, lastModified: null };
  }
  return {
    estado: {
      ultimaSincronizacionExitosaEn: f.ultima_sincronizacion_exitosa_en,
      enCuarentenaDesde: f.en_cuarentena_desde,
      intentosFallidosConsecutivos: f.intentos_fallidos_consecutivos,
      motivoCuarentena: f.motivo_cuarentena,
    },
    etag: f.etag_import,
    lastModified: f.ultima_modificacion_http_import,
  };
}

async function persistirEstadoFeed(
  ctx: ContextoSincronizacion,
  estado: EstadoFeedCanal,
  etag: string | null,
  lastModified: string | null,
  drift?: number,
): Promise<void> {
  await ctx.ejecutor.query(
    `INSERT INTO unidad_canal_feed
       (unidad_id, canal_id, ultima_sincronizacion_exitosa_en, en_cuarentena_desde,
        intentos_fallidos_consecutivos, motivo_cuarentena, etag_import, ultima_modificacion_http_import,
        drift_ultima_reconciliacion_completa, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 0), now())
     ON CONFLICT (unidad_id, canal_id) DO UPDATE SET
       ultima_sincronizacion_exitosa_en = EXCLUDED.ultima_sincronizacion_exitosa_en,
       en_cuarentena_desde = EXCLUDED.en_cuarentena_desde,
       intentos_fallidos_consecutivos = EXCLUDED.intentos_fallidos_consecutivos,
       motivo_cuarentena = EXCLUDED.motivo_cuarentena,
       etag_import = EXCLUDED.etag_import,
       ultima_modificacion_http_import = EXCLUDED.ultima_modificacion_http_import,
       drift_ultima_reconciliacion_completa =
         COALESCE($9, unidad_canal_feed.drift_ultima_reconciliacion_completa),
       actualizado_en = now()`,
    [
      ctx.unidadId,
      ctx.canalId,
      estado.ultimaSincronizacionExitosaEn,
      estado.enCuarentenaDesde,
      estado.intentosFallidosConsecutivos,
      estado.motivoCuarentena,
      etag,
      lastModified,
      drift ?? null,
    ],
  );
}

interface FilaVersionPrevia {
  [columna: string]: unknown;
  sequence: number | null;
  dtstamp: string;
  hash_contenido: string;
  ocupacion_unidad_id: string | null;
}

async function obtenerVersionPrevia(
  ctx: ContextoSincronizacion,
  uid: string,
): Promise<{ version: VersionEvento; ocupacionUnidadId: string | null } | null> {
  const fila = await ctx.ejecutor.query<FilaVersionPrevia>(
    `SELECT sequence, dtstamp::text AS dtstamp, hash_contenido, ocupacion_unidad_id
     FROM evento_canal_importado WHERE unidad_id = $1 AND canal_id = $2 AND uid_evento = $3`,
    [ctx.unidadId, ctx.canalId, uid],
  );
  const f = fila.rows[0];
  if (!f) return null;
  return {
    version: { uid, sequence: f.sequence, dtstamp: f.dtstamp, hash: f.hash_contenido },
    ocupacionUnidadId: f.ocupacion_unidad_id,
  };
}

async function upsertEventoImportado(
  ctx: ContextoSincronizacion,
  entrada: VersionEvento,
  ocupacionUnidadId: string | null,
  ultimaAccion: "aplicar" | "descartar" | "sin_cambio" | "revisar_uid_reciclado" | "eco",
  sobrescribirVersion: boolean,
): Promise<void> {
  if (sobrescribirVersion) {
    await ctx.ejecutor.query(
      `INSERT INTO evento_canal_importado
         (unidad_id, canal_id, uid_evento, sequence, dtstamp, hash_contenido, ocupacion_unidad_id, ultima_accion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (unidad_id, canal_id, uid_evento) DO UPDATE SET
         sequence = EXCLUDED.sequence,
         dtstamp = EXCLUDED.dtstamp,
         hash_contenido = EXCLUDED.hash_contenido,
         ocupacion_unidad_id = EXCLUDED.ocupacion_unidad_id,
         ultima_accion = EXCLUDED.ultima_accion,
         actualizado_en = now()`,
      [ctx.unidadId, ctx.canalId, entrada.uid, entrada.sequence, entrada.dtstamp, entrada.hash, ocupacionUnidadId, ultimaAccion],
    );
  } else {
    await ctx.ejecutor.query(
      `UPDATE evento_canal_importado SET ultima_accion = $4, actualizado_en = now()
       WHERE unidad_id = $1 AND canal_id = $2 AND uid_evento = $3`,
      [ctx.unidadId, ctx.canalId, entrada.uid, ultimaAccion],
    );
  }
}

async function hashesExportadosRecientes(ctx: ContextoSincronizacion): Promise<string[]> {
  const fila = await ctx.ejecutor.query<{ hash_contenido: string }>(
    `SELECT be.hash_contenido FROM bloqueo_exportado be
     JOIN ocupacion_unidad ou ON ou.id = be.ocupacion_unidad_id
     WHERE ou.unidad_id = $1 AND be.canal_id = $2`,
    [ctx.unidadId, ctx.canalId],
  );
  return fila.rows.map((r) => r.hash_contenido);
}

async function canalesExportadosDeRango(
  ctx: ContextoSincronizacion,
  rango: RangoFechas,
): Promise<string[]> {
  const fila = await ctx.ejecutor.query<{ canal_id: string }>(
    `SELECT be.canal_id FROM bloqueo_exportado be
     JOIN ocupacion_unidad ou ON ou.id = be.ocupacion_unidad_id
     WHERE ou.unidad_id = $1 AND ou.rango = daterange($2, $3, '[)')`,
    [ctx.unidadId, rango.inicio, rango.fin],
  );
  return fila.rows.map((r) => r.canal_id);
}

function extraerRango(evento: VEventNormalizado, zonaHoraria: string): RangoFechas {
  return {
    inicio: resolverFechaLocal(evento.dtstart, zonaHoraria),
    fin: resolverFechaLocal(evento.dtend, zonaHoraria),
  };
}

/** Ejecuta un ciclo completo de import para (unidad, canal): fetch →
 * cuarentena en caso de fallo → parseo → anti-eco → resolución de versión
 * → aplicación transaccional. Nunca libera disponibilidad ante fallo
 * (D-005) ni crea un segundo bloqueo a partir de un eco (D-004). */
export async function ejecutarCicloImport(
  ctx: ContextoSincronizacion,
  opcionesFetch: Omit<OpcionesFetchIcs, "etag" | "ultimaModificacionHttp">,
): Promise<ResultadoImportarCiclo> {
  const { estado: estadoPrevio, etag, lastModified } = await obtenerEstadoFeed(ctx);
  const ahoraIso = new Date().toISOString();

  let resultadoCiclo: ResultadoCicloFetch;
  let eventos: VEventNormalizado[] = [];
  let nuevoEtag = etag;
  let nuevoLastModified = lastModified;

  try {
    const respuesta = await fetchIcsSeguro({ ...opcionesFetch, etag, ultimaModificacionHttp: lastModified });
    if (respuesta.noModificado) {
      resultadoCiclo = "no_modificado";
    } else if (respuesta.status < 200 || respuesta.status >= 300) {
      // Caso adversarial 11 (feed inaccesible): cualquier estado HTTP fuera
      // de 2xx/304 se trata como fallo de red, nunca como "sin eventos"
      // (D-005) — un 4xx/5xx no es sintácticamente un feed vacío válido.
      resultadoCiclo = "fallo_red";
    } else {
      nuevoEtag = respuesta.etag ?? etag;
      nuevoLastModified = respuesta.ultimaModificacionHttp ?? lastModified;
      try {
        const calendario = parsearIcs(respuesta.cuerpo ?? "", ctx.limites);
        eventos = calendario.eventos;
        resultadoCiclo = eventos.length === 0 ? "exito_vacio" : "exito_con_eventos";
      } catch (error) {
        if (error instanceof IcsParseError) {
          resultadoCiclo = "fallo_parseo";
        } else {
          throw error;
        }
      }
    }
  } catch {
    // Cualquier fallo de red/DNS/SSRF/timeout se trata uniformemente como
    // "fallo_red" para efectos de cuarentena (D-005) — el motivo detallado
    // (SsrfError vs. timeout vs. DNS) ya quedó descartado por el guard de
    // `fetchIcsSeguro` antes de llegar aquí; lo único que importa para la
    // máquina de cuarentena es que el ciclo no produjo datos confiables.
    resultadoCiclo = "fallo_red";
  }

  const { estado: nuevoEstado, alerta } = aplicarResultadoCiclo(estadoPrevio, resultadoCiclo, ahoraIso, {
    umbralIntentosFallidos: 3,
    huboEventosActivosPreviamente: estadoPrevio.ultimaSincronizacionExitosaEn !== null,
  });
  await persistirEstadoFeed(ctx, nuevoEstado, nuevoEtag, nuevoLastModified);

  const resumen: ResultadoImportarCiclo = {
    resultado: resultadoCiclo,
    eventosEnFeed: eventos.length,
    eventosAplicados: 0,
    ecosDescartados: 0,
    revisionesUidReciclado: 0,
    conflictosDetectados: 0,
    alertaCuarentena: alerta,
  };

  if (resultadoCiclo !== "exito_con_eventos") {
    return resumen;
  }

  const hashesRecientes = await hashesExportadosRecientes(ctx);

  for (const evento of eventos) {
    const rango = extraerRango(evento, ctx.zonaHorariaPropiedad);
    const hash = calcularHashContenido({
      unidadId: ctx.unidadId,
      dtstart: rango.inicio,
      dtend: rango.fin,
      razon: "RESERVA_CANAL",
    });

    const canalesExportados = await canalesExportadosDeRango(ctx, rango);
    const eco = detectarEco({
      uidEntrante: evento.uid,
      hashContenidoEntrante: hash,
      canalId: ctx.canalId,
      hashesExportadosRecientes: hashesRecientes,
      canalesExportadosDeRangoCoincidente: canalesExportados,
    });

    // Hash de VERSIÓN (para `resolverVersion`/idempotencia), distinto del
    // hash de anti-eco de arriba: un CANCEL sobre el mismo rango de fechas
    // ya importado es un cambio de contenido real (la reserva deja de
    // reclamar esas noches) aunque `(unidad, dtstart, dtend)` no cambien —
    // sin este distintivo, `resolverVersion` lo trataría como "hash
    // idéntico al almacenado" (sin_cambio) y el CANCEL nunca se aplicaría.
    // El hash de anti-eco de arriba NO lleva este distintivo a propósito:
    // lo que nosotros exportamos siempre lleva STATUS:CONFIRMED (ver
    // `exportador.ts`), así que un eco genuino de nuestro propio export
    // sigue coincidiendo exactamente.
    const hashVersion = calcularHashContenido({
      unidadId: ctx.unidadId,
      dtstart: rango.inicio,
      dtend: rango.fin,
      razon: evento.status === "CANCELLED" ? "RESERVA_CANAL:CANCELLED" : "RESERVA_CANAL",
    });
    const entrante: VersionEvento = {
      uid: evento.uid,
      sequence: evento.sequence,
      dtstamp: evento.dtstamp,
      hash: hashVersion,
    };

    if (eco.esEco) {
      resumen.ecosDescartados++;
      await upsertEventoImportado(ctx, entrante, null, "eco", true);
      continue;
    }

    const previa = await obtenerVersionPrevia(ctx, evento.uid);
    const resolucion = resolverVersion(previa?.version ?? null, entrante);

    if (resolucion.accion === "sin_cambio" || resolucion.accion === "descartar") {
      await upsertEventoImportado(ctx, entrante, previa?.ocupacionUnidadId ?? null, resolucion.accion, false);
      continue;
    }

    if (resolucion.accion === "revisar_uid_reciclado") {
      resumen.revisionesUidReciclado++;
      await ctx.ejecutor.query(
        `INSERT INTO outbox_evento (tipo_evento, payload)
         VALUES ('revisar_uid_reciclado', $1::jsonb)`,
        [JSON.stringify({ unidadId: ctx.unidadId, canalId: ctx.canalId, uid: evento.uid, motivo: resolucion.motivo })],
      );
      await upsertEventoImportado(ctx, entrante, previa?.ocupacionUnidadId ?? null, "revisar_uid_reciclado", false);
      continue;
    }

    // accion === 'aplicar'
    if (evento.status === "CANCELLED") {
      if (previa?.ocupacionUnidadId) {
        await cancelarOcupacion(ctx.ejecutor, previa.ocupacionUnidadId);
      }
      await upsertEventoImportado(ctx, entrante, previa?.ocupacionUnidadId ?? null, "aplicar", true);
      resumen.eventosAplicados++;
      continue;
    }

    if (previa?.ocupacionUnidadId) {
      const modificado = await modificarFechasReserva(ctx.ejecutor, previa.ocupacionUnidadId, rango);
      if (modificado.conflicto) resumen.conflictosDetectados++;
      await upsertEventoImportado(ctx, entrante, previa.ocupacionUnidadId, "aplicar", true);
    } else {
      const estadoOcupacion = evento.status === "TENTATIVE" ? "provisional" : "confirmado";
      const creado = await crearReservaConfirmada(ctx.ejecutor, {
        unidadId: ctx.unidadId,
        rango,
        estado: estadoOcupacion,
        bloqueante: true,
        canalOrigenId: ctx.canalId,
        externalId: evento.uid,
      });
      if (creado.conflicto) resumen.conflictosDetectados++;
      await upsertEventoImportado(ctx, entrante, creado.ocupacionId, "aplicar", true);
    }
    resumen.eventosAplicados++;
  }

  return resumen;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

interface FilaOcupacionActiva {
  [columna: string]: unknown;
  id: string;
  inicio: string;
  fin: string;
  razon: BloqueoExportable["razon"];
}

interface FilaExportPrevio {
  [columna: string]: unknown;
  hash_contenido: string;
  sequence: number;
}

export async function exportarFeedParaCanal(
  ctx: ContextoSincronizacion,
  nombreCalendario: string,
): Promise<FeedExportado> {
  const activas = await ctx.ejecutor.query<FilaOcupacionActiva>(
    `SELECT id, lower(rango)::text AS inicio, upper(rango)::text AS fin, razon
     FROM ocupacion_unidad
     WHERE unidad_id = $1 AND estado <> 'cancelado' AND bloqueante`,
    [ctx.unidadId],
  );

  const bloqueos: BloqueoExportable[] = [];
  for (const fila of activas.rows) {
    const previo = await ctx.ejecutor.query<FilaExportPrevio>(
      `SELECT hash_contenido, sequence FROM bloqueo_exportado WHERE ocupacion_unidad_id = $1 AND canal_id = $2`,
      [fila.id, ctx.canalId],
    );
    const hashNuevo = calcularHashContenido({
      unidadId: ctx.unidadId,
      dtstart: fila.inicio,
      dtend: fila.fin,
      razon: fila.razon,
    });
    const sequenceAnterior = previo.rows[0]?.sequence ?? -1;
    const hashAnterior = previo.rows[0]?.hash_contenido ?? null;
    const sequence = hashAnterior === hashNuevo ? Math.max(sequenceAnterior, 0) : sequenceAnterior + 1;

    bloqueos.push({
      ocupacionUnidadId: fila.id,
      unidadId: ctx.unidadId,
      rango: { inicio: fila.inicio, fin: fila.fin },
      razon: fila.razon,
      sequence,
    });
  }

  const feed = exportarFeedIcs(nombreCalendario, bloqueos);

  for (const bloqueo of bloqueos) {
    const uid = construirUidExportado(bloqueo.ocupacionUnidadId);
    const hash = feed.hashesPorOcupacion.get(bloqueo.ocupacionUnidadId)!;
    await ctx.ejecutor.query(
      `INSERT INTO bloqueo_exportado (ocupacion_unidad_id, canal_id, uid_exportado, hash_contenido, sequence, exportado_en)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (ocupacion_unidad_id, canal_id) DO UPDATE SET
         uid_exportado = EXCLUDED.uid_exportado,
         hash_contenido = EXCLUDED.hash_contenido,
         sequence = EXCLUDED.sequence,
         exportado_en = now()`,
      [bloqueo.ocupacionUnidadId, ctx.canalId, uid, hash, bloqueo.sequence],
    );
  }

  return feed;
}

export async function contarBloqueosActivos(
  ejecutor: EjecutorTransaccional,
  unidadId: string,
): Promise<number> {
  const fila = await ejecutor.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ocupacion_unidad
     WHERE unidad_id = $1 AND estado <> 'cancelado' AND bloqueante AND capa = 'reserva'`,
    [unidadId],
  );
  return Number(fila.rows[0]!.n);
}

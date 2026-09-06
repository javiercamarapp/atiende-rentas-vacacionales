import {
  calcularHashContenido,
  cancelarOcupacion,
  crearReservaConfirmada,
  esRangoValido,
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
import { reconciliarCompleto, type UidActivoInterno } from "./reconciliacion.js";
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
  /** D-DSD-06: eventos individuales del feed descartados por ser
   * semánticamente inválidos (rango invertido/vacío, típicamente una
   * `DURATION` negativa o cero — RFC 5545 §3.3.6 la acepta
   * sintácticamente) o por cualquier otro error inesperado al
   * procesarlos. Nunca abortan el resto del ciclo — los demás eventos
   * válidos del mismo feed se siguen aplicando con normalidad. */
  eventosDescartadosPorError: number;
  /** D-DSD-09/D-DSD-11: drift de la reconciliación completa (RV07 §15,
   * RV07-R-06) computado en ESTE ciclo — cuántos UIDs que el sistema creía
   * activos ya no aparecen en el feed actual, sin `CANCEL` explícito.
   * `undefined` cuando el ciclo no llegó a tener un feed completo que
   * reconciliar (fallo de red/parseo, sin cambios, feed vacío) — en esos
   * casos el valor persistido en `drift_ultima_reconciliacion_completa`
   * se conserva tal cual estaba. */
  driftReconciliacionCompleta?: number;
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
  rango_inicio: string | null;
  rango_fin: string | null;
}

async function obtenerVersionPrevia(
  ctx: ContextoSincronizacion,
  uid: string,
): Promise<{ version: VersionEvento; ocupacionUnidadId: string | null } | null> {
  // D-DSD-03: el LEFT JOIN trae el rango vigente de la ocupación asociada
  // (cuando existe) para que `resolverVersion` pueda usarlo como señal
  // independiente del hash en la heurística de "UID reciclado" sin
  // SEQUENCE comparable — sin este dato, esa rama no puede distinguir un
  // reciclado real de una modificación legítima de la misma reserva.
  const fila = await ctx.ejecutor.query<FilaVersionPrevia>(
    `SELECT eci.sequence, eci.dtstamp::text AS dtstamp, eci.hash_contenido, eci.ocupacion_unidad_id,
            lower(ou.rango)::text AS rango_inicio, upper(ou.rango)::text AS rango_fin
     FROM evento_canal_importado eci
     LEFT JOIN ocupacion_unidad ou ON ou.id = eci.ocupacion_unidad_id
     WHERE eci.unidad_id = $1 AND eci.canal_id = $2 AND eci.uid_evento = $3`,
    [ctx.unidadId, ctx.canalId, uid],
  );
  const f = fila.rows[0];
  if (!f) return null;
  const rango: RangoFechas | undefined =
    f.rango_inicio !== null && f.rango_fin !== null ? { inicio: f.rango_inicio, fin: f.rango_fin } : undefined;
  return {
    version: { uid, sequence: f.sequence, dtstamp: f.dtstamp, hash: f.hash_contenido, rango },
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

/** D-DSD-09/D-DSD-11: UIDs que el sistema cree activos AHORA MISMO para
 * (unidad, canal) — la fila de `evento_canal_importado` sigue apuntando a
 * una `ocupacion_unidad` que no está cancelada. Se calcula DESPUÉS del
 * bucle de aplicación incremental del ciclo (línea de llamada más abajo),
 * así que ya refleja cualquier `CANCELLED` explícito que ese mismo ciclo
 * acabe de procesar — `reconciliarCompleto` (packages/adapters/src/sync/
 * reconciliacion.ts) solo necesita encontrar los que quedan sin ningún
 * `CANCEL` explícito y que además ya no aparecen en el feed actual. */
async function obtenerUidsActivosInternos(ctx: ContextoSincronizacion): Promise<UidActivoInterno[]> {
  const fila = await ctx.ejecutor.query<{ uid_canal: string; ocupacion_unidad_id: string }>(
    `SELECT eci.uid_evento AS uid_canal, eci.ocupacion_unidad_id
     FROM evento_canal_importado eci
     JOIN ocupacion_unidad ou ON ou.id = eci.ocupacion_unidad_id
     WHERE eci.unidad_id = $1 AND eci.canal_id = $2 AND ou.estado <> 'cancelado'`,
    [ctx.unidadId, ctx.canalId],
  );
  return fila.rows.map((r) => ({ ocupacionUnidadId: r.ocupacion_unidad_id, uidCanal: r.uid_canal }));
}

// D-DSD-04: SIN filtro por canal a propósito — un bloqueo que exportamos a
// un canal puede regresarnos reflejado a través de un canal DISTINTO
// (D-004: "...o de otro canal a través de él"), así que la comparación de
// anti-eco por hash debe cubrir todo lo que exportamos para esta unidad,
// sin importar a qué canal.
async function hashesExportadosRecientes(ctx: ContextoSincronizacion): Promise<string[]> {
  const fila = await ctx.ejecutor.query<{ hash_contenido: string }>(
    `SELECT be.hash_contenido FROM bloqueo_exportado be
     JOIN ocupacion_unidad ou ON ou.id = be.ocupacion_unidad_id
     WHERE ou.unidad_id = $1`,
    [ctx.unidadId],
  );
  return fila.rows.map((r) => r.hash_contenido);
}

// Ya devuelve TODOS los canales a los que se exportó el rango coincidente
// (sin filtrar por `ctx.canalId`) — `detectarEco` (D-DSD-04) solo necesita
// saber si la lista es no vacía (se exportó a algún canal), no si incluye
// el canal actual.
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

/**
 * D-DSD-12: `crearReservaConfirmada` (efecto de dominio, su propio
 * COMMIT) y `upsertEventoImportado` (bookkeeping de versión en
 * `evento_canal_importado`, escritura SEPARADA y posterior) no son
 * atómicos entre sí. Si el proceso muere entre ambos COMMIT, el reproceso
 * del mismo ciclo ve `previa === null` (sin bookkeeping) para un UID cuyo
 * efecto YA se aplicó — sin esta verificación, `ejecutarCicloImport`
 * volvería a llamar `crearReservaConfirmada` con el mismo rango, generando
 * una segunda fila `conflicto_pendiente` y una alerta `overbooking_confirmado`
 * FALSA contra la reserva consigo misma (dato falso al usuario).
 *
 * Antes de crear una reserva nueva, se busca una ocupación activa ya
 * existente con la MISMA identidad natural que `evento_canal_importado`
 * usa para deduplicar `(unidad, canal, uid)` — vía `canal_origen_id` +
 * `external_id` en `ocupacion_unidad` — y el MISMO rango exacto (si el
 * rango difiere, no se asume recuperación de crash: podría ser un UID
 * reciclado genuino para una reserva distinta, y se deja que el camino
 * normal de `crearReservaConfirmada`/EXCLUDE decida). Cuando coincide, se
 * recupera el bookkeeping apuntando a la ocupación existente en vez de
 * duplicar el efecto.
 */
async function buscarOcupacionActivaParaRecuperarBookkeeping(
  ctx: ContextoSincronizacion,
  externalId: string,
  rango: RangoFechas,
): Promise<string | null> {
  const fila = await ctx.ejecutor.query<{ id: string }>(
    `SELECT id FROM ocupacion_unidad
     WHERE unidad_id = $1 AND canal_origen_id = $2 AND external_id = $3 AND estado <> 'cancelado'
       AND rango = daterange($4, $5, '[)')
     ORDER BY creado_en ASC
     LIMIT 1`,
    [ctx.unidadId, ctx.canalId, externalId, rango.inicio, rango.fin],
  );
  return fila.rows[0]?.id ?? null;
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

  // D-DSD-10: `huboEventosActivosPreviamente` debe reflejar "¿esta unidad
  // tenía eventos ACTIVOS de ESTE canal antes de este ciclo?", no "¿hubo
  // algún ciclo exitoso previo, sea cual sea su resultado?" —
  // `ultimaSincronizacionExitosaEn` también se fija en un `exito_vacio`
  // (cuarentena.ts), así que un canal que NUNCA tuvo una sola reserva
  // (feed legítimamente vacío ciclo tras ciclo) disparaba una alerta
  // "vacío inesperado" falsa a partir del segundo ciclo — fatiga de
  // alertas para el caso más común e inocuo (unidad recién conectada).
  const huboEventosActivosPreviamente = (await contarBloqueosActivosDelCanal(ctx)) > 0;

  const { estado: nuevoEstado, alerta } = aplicarResultadoCiclo(estadoPrevio, resultadoCiclo, ahoraIso, {
    umbralIntentosFallidos: 3,
    huboEventosActivosPreviamente,
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
    eventosDescartadosPorError: 0,
  };

  if (resultadoCiclo !== "exito_con_eventos") {
    return resumen;
  }

  const hashesRecientes = await hashesExportadosRecientes(ctx);

  for (const evento of eventos) {
    try {
      await procesarEventoDelCiclo(ctx, evento, hashesRecientes, resumen);
    } catch (error) {
      // D-DSD-06: un evento individual del feed (rango invertido/vacío
      // por una DURATION negativa/cero, RFC 5545 §3.3.6 lo acepta
      // sintácticamente, u otro error inesperado al procesarlo) NUNCA
      // aborta el resto del ciclo — se descarta y se reporta para
      // revisión humana, análogo a "revisar_uid_reciclado", dejando que
      // los demás eventos válidos del mismo feed se apliquen con
      // normalidad.
      resumen.eventosDescartadosPorError++;
      await ctx.ejecutor.query(
        `INSERT INTO outbox_evento (tipo_evento, payload)
         VALUES ('revisar_evento_fallido', $1::jsonb)`,
        [
          JSON.stringify({
            unidadId: ctx.unidadId,
            canalId: ctx.canalId,
            uid: evento.uid,
            error: error instanceof Error ? error.message : String(error),
          }),
        ],
      );
    }
  }

  // D-DSD-09/D-DSD-11: reconciliación completa (RV07-R-06) — se computa en
  // CADA ciclo con eventos, no en un job aparte: ya se tiene el feed
  // completo recién parseado en memoria (`eventos`), así que comparar
  // contra el conjunto de UIDs que el sistema cree activos internamente
  // no cuesta ninguna llamada de red adicional. Antes, `persistirEstadoFeed`
  // nunca recibía un `drift` real (quinto argumento omitido) y
  // `reconciliarCompleto` no tenía ningún llamador fuera de pruebas — un
  // UID que un canal deja de listar sin `CANCEL` explícito nunca se
  // detectaba en el sistema en ejecución normal.
  const activosInternos = await obtenerUidsActivosInternos(ctx);
  const uidsPresentesEnFeed = new Set(eventos.map((e) => e.uid));
  const reconciliacion = reconciliarCompleto(activosInternos, uidsPresentesEnFeed);
  resumen.driftReconciliacionCompleta = reconciliacion.drift;

  // Persistencia explícita del drift real (nunca `undefined`/`null` aquí:
  // un drift que bajó a 0 tras resolverse debe sobrescribir el valor
  // anterior, no conservarlo vía el COALESCE de `persistirEstadoFeed`).
  await persistirEstadoFeed(ctx, nuevoEstado, nuevoEtag, nuevoLastModified, reconciliacion.drift);

  // D-006/RV07 §15: los candidatos a cancelación implícita NUNCA se
  // cancelan automáticamente — se encolan para revisión humana, mismo
  // patrón que 'revisar_uid_reciclado'/'revisar_evento_fallido'.
  for (const candidato of reconciliacion.candidatosACancelarPorAusencia) {
    await ctx.ejecutor.query(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
       VALUES ($1, 'revisar_drift_reconciliacion', $2::jsonb)`,
      [
        candidato.ocupacionUnidadId,
        JSON.stringify({ unidadId: ctx.unidadId, canalId: ctx.canalId, uid: candidato.uidCanal }),
      ],
    );
  }

  return resumen;
}

async function procesarEventoDelCiclo(
  ctx: ContextoSincronizacion,
  evento: VEventNormalizado,
  hashesRecientes: readonly string[],
  resumen: ResultadoImportarCiclo,
): Promise<void> {
  const rango = extraerRango(evento, ctx.zonaHorariaPropiedad);

  // D-DSD-06: validar el rango ANTES de cualquier consulta SQL que lo use
  // — `canalesExportadosDeRango` (más abajo) arma un `daterange()` crudo
  // que Postgres rechazaría con `22000` (rango invertido) antes de que el
  // dominio pueda intervenir. Un evento sintácticamente válido según el
  // parser (p. ej. `DURATION:-P1D` o `PT0S`, aceptadas por el ABNF de RFC
  // 5545 §3.3.6 pero semánticamente inválidas) se descarta aquí mismo,
  // individualmente.
  if (!esRangoValido(rango)) {
    throw new Error(
      `evento con rango inválido (dtstart >= dtend): [${rango.inicio}, ${rango.fin})`,
    );
  }

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
    // D-DSD-03: rango real del evento entrante, para la heurística de
    // "UID reciclado" sin SEQUENCE comparable (ver obtenerVersionPrevia).
    rango,
  };

  if (eco.esEco) {
    resumen.ecosDescartados++;
    await upsertEventoImportado(ctx, entrante, null, "eco", true);
    return;
  }

  const previa = await obtenerVersionPrevia(ctx, evento.uid);
  const resolucion = resolverVersion(previa?.version ?? null, entrante);

  if (resolucion.accion === "sin_cambio" || resolucion.accion === "descartar") {
    await upsertEventoImportado(ctx, entrante, previa?.ocupacionUnidadId ?? null, resolucion.accion, false);
    return;
  }

  if (resolucion.accion === "revisar_uid_reciclado") {
    resumen.revisionesUidReciclado++;
    await ctx.ejecutor.query(
      `INSERT INTO outbox_evento (tipo_evento, payload)
       VALUES ('revisar_uid_reciclado', $1::jsonb)`,
      [JSON.stringify({ unidadId: ctx.unidadId, canalId: ctx.canalId, uid: evento.uid, motivo: resolucion.motivo })],
    );
    await upsertEventoImportado(ctx, entrante, previa?.ocupacionUnidadId ?? null, "revisar_uid_reciclado", false);
    return;
  }

  // accion === 'aplicar'
  if (evento.status === "CANCELLED") {
    if (previa?.ocupacionUnidadId) {
      await cancelarOcupacion(ctx.ejecutor, previa.ocupacionUnidadId);
    }
    await upsertEventoImportado(ctx, entrante, previa?.ocupacionUnidadId ?? null, "aplicar", true);
    resumen.eventosAplicados++;
    return;
  }

  if (previa?.ocupacionUnidadId) {
    const modificado = await modificarFechasReserva(ctx.ejecutor, previa.ocupacionUnidadId, rango);
    if (modificado.conflicto) resumen.conflictosDetectados++;
    await upsertEventoImportado(ctx, entrante, previa.ocupacionUnidadId, "aplicar", true);
  } else {
    // D-DSD-12: recuperación de bookkeeping perdido antes de crear una
    // reserva nueva (ver buscarOcupacionActivaParaRecuperarBookkeeping).
    const ocupacionRecuperada = await buscarOcupacionActivaParaRecuperarBookkeeping(ctx, evento.uid, rango);
    if (ocupacionRecuperada) {
      await upsertEventoImportado(ctx, entrante, ocupacionRecuperada, "aplicar", true);
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
  }
  resumen.eventosAplicados++;
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

/** D-DSD-10: igual que `contarBloqueosActivos`, pero acotado al canal de
 * ESTE ciclo (`canal_origen_id`) — la señal correcta para
 * `huboEventosActivosPreviamente` es "¿esta unidad tenía eventos activos
 * DE ESTE CANAL?", no el total de la unidad (que podría tener reservas
 * activas de otros canales sin relación con si ESTE feed está
 * legítimamente vacío). */
async function contarBloqueosActivosDelCanal(ctx: ContextoSincronizacion): Promise<number> {
  const fila = await ctx.ejecutor.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ocupacion_unidad
     WHERE unidad_id = $1 AND canal_origen_id = $2 AND estado <> 'cancelado' AND bloqueante AND capa = 'reserva'`,
    [ctx.unidadId, ctx.canalId],
  );
  return Number(fila.rows[0]!.n);
}

import { ejecutarCicloImport, type ContextoSincronizacion, type OpcionesFetchIcs, type ResultadoImportarCiclo } from "@atiende-rv/adapters";
import type { RegistroMetricas } from "./metricas.js";
import type { Trazador } from "./otel.js";

/**
 * Envuelve `ejecutarCicloImport` de `@atiende-rv/adapters` (motor de sync
 * de Lote 2) con instrumentación OTel-like (Lote 10, H-035/H-036) SIN
 * tocar ni un archivo de `packages/adapters` — ese paquete es exclusivo de
 * Lote 2. El span PRODUCER cubre el ciclo completo (fetch→parseo→anti-eco→
 * aplicación→cuarentena); no hay acceso a spans internos por evento
 * porque el motor no los expone todavía (documentado como límite
 * conocido — instrumentar CADA evento requeriría que Lote 2 exponga hooks,
 * fuera del alcance de este lote).
 */
export interface OpcionesCicloSyncInstrumentado {
  ctx: ContextoSincronizacion;
  opcionesFetch: Omit<OpcionesFetchIcs, "etag" | "ultimaModificacionHttp">;
  canalNombre: string;
  trazador: Trazador;
  metricas: RegistroMetricas;
  /** H-073: latencia DECLARADA por el canal (nunca medida), típicamente
   * `AirbnbChannelAdapter.latenciaDeclarada`/`VrboChannelAdapter.
   * latenciaDeclarada` de `@atiende-rv/adapters` — opcional para no
   * romper llamadas existentes que no la pasen; sin ella, el gauge
   * `latenciaExternaDeclaradaSegundos` simplemente no se actualiza en
   * este ciclo. */
  latenciaDeclarada?: { minutosEstimados: number; confianza: string };
}

export async function ejecutarCicloSyncInstrumentado(
  opciones: OpcionesCicloSyncInstrumentado,
): Promise<ResultadoImportarCiclo> {
  const { ctx, opcionesFetch, canalNombre, trazador, metricas, latenciaDeclarada } = opciones;
  const span = trazador.iniciarSpan("sync.ciclo.import", {
    kind: "PRODUCER",
    atributos: { canal: canalNombre, canal_id: ctx.canalId, unidad_id: ctx.unidadId },
  });

  try {
    const resultado = await ejecutarCicloImport(ctx, opcionesFetch);

    span.agregarAtributos({
      eventos_en_feed: resultado.eventosEnFeed,
      eventos_aplicados: resultado.eventosAplicados,
      ecos_descartados: resultado.ecosDescartados,
      conflictos_detectados: resultado.conflictosDetectados,
      resultado: resultado.resultado,
    });

    if (resultado.conflictosDetectados > 0) {
      metricas.conflictos.incrementar({ canal: canalNombre }, resultado.conflictosDetectados);
    }
    if (resultado.alertaCuarentena) {
      metricas.cuarentenas.incrementar({ canal: canalNombre });
    }
    const fueExitoso = resultado.resultado === "exito_con_eventos" || resultado.resultado === "exito_vacio" || resultado.resultado === "no_modificado";
    if (!fueExitoso) {
      metricas.erroresSync.incrementar({ canal: canalNombre, error_class: resultado.resultado });
      metricas.reintentosSync.incrementar({ canal: canalNombre });
    } else {
      metricas.edadUltimaSyncSegundos.set(0, { canal: canalNombre, unidad_id: ctx.unidadId });
    }

    if (latenciaDeclarada) {
      metricas.latenciaExternaDeclaradaSegundos.set(latenciaDeclarada.minutosEstimados * 60, {
        canal: canalNombre,
        confianza: latenciaDeclarada.confianza,
      });
    }

    span.terminar();
    return resultado;
  } catch (error) {
    metricas.erroresSync.incrementar({ canal: canalNombre, error_class: "excepcion_no_manejada" });
    span.terminar({ error });
    throw error;
  }
}

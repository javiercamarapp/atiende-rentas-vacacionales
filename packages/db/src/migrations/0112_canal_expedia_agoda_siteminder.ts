import type { Migracion } from "../runner/tipos.js";

// Lote 3.4 (Fase 3, RV22): agrega filas al catálogo mínimo `canal`
// (migración 0004) para los canales de México que ahora tienen un
// `ChannelAdapter` real de código (Agoda, Expedia, SiteMinder) — sin este
// `canal.id`, `ocupacion_unidad.canal_origen_id` no tiene ningún valor
// válido al que apuntar cuando una reserva llega de uno de estos canales
// (p. ej. una reserva de Expedia aplicada vía `crearReservaConfirmada`,
// como en `tests/adversarial/canales/casos.test.ts`). Solo INSERT — no
// modifica la forma de la tabla `canal` ni sus filas existentes.
export const migracion0112CanalExpediaAgodaSiteminder: Migracion = {
  id: "0112_canal_expedia_agoda_siteminder",
  descripcion: "canal: agrega agoda/expedia/siteminder (RV22, canales México con adaptador de código)",
  up: `
    INSERT INTO canal (codigo, nombre) VALUES
      ('agoda', 'Agoda'),
      ('expedia', 'Expedia'),
      ('siteminder', 'SiteMinder pmsXchange (puente)');
  `,
  down: `
    DELETE FROM canal WHERE codigo IN ('agoda', 'expedia', 'siteminder');
  `,
};

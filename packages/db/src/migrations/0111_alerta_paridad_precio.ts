import type { Migracion } from "../runner/tipos.js";

// H-071 (BACKLOG E11, RV13-R-04/R-06, Lote 3.0): el comparador de paridad
// de precios (`packages/domain/src/pricing/paridad.ts`) puede persistir
// una violación detectada como una fila más de `alerta` (0081, Lote 10) —
// reutiliza el mismo estado activa/reconocida/resuelta y el mismo CRUD de
// `/alertas*` en vez de construir una tabla paralela solo para pricing.
// `paridad_precio` es un tipo puramente informativo: el motor de reglas
// de `alertas.ts` NUNCA la dispara automáticamente y no tiene
// `accion_reversible` asociada — la crea explícitamente la ruta HTTP de
// `POST /pricing/unidades/:unidadId/paridad` cuando el comparador
// encuentra una violación fuera de tolerancia (nunca publica nada, ver
// `paridad.ts`).
export const migracion0111AlertaParidadPrecio: Migracion = {
  id: "0111_alerta_paridad_precio",
  descripcion: "alerta: agrega el tipo 'paridad_precio' (H-071) al CHECK existente de la columna tipo",
  up: `
    ALTER TABLE alerta DROP CONSTRAINT alerta_tipo_check;
    ALTER TABLE alerta ADD CONSTRAINT alerta_tipo_check CHECK (
      tipo IN (
        'sync_sin_exito',
        'feed_en_cuarentena',
        'conflicto_pendiente',
        'outbox_atascada',
        'drift',
        'token_canal_revocado',
        'paridad_precio'
      )
    );
  `,
  down: `
    ALTER TABLE alerta DROP CONSTRAINT alerta_tipo_check;
    ALTER TABLE alerta ADD CONSTRAINT alerta_tipo_check CHECK (
      tipo IN (
        'sync_sin_exito',
        'feed_en_cuarentena',
        'conflicto_pendiente',
        'outbox_atascada',
        'drift',
        'token_canal_revocado'
      )
    );
  `,
};

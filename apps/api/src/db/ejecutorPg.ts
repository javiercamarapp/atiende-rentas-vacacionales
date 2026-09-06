import type { PoolClient } from "pg";
import type { EjecutorTransaccional } from "@atiende-rv/domain";

/**
 * Adapta un `pg.PoolClient` al contrato estructural `EjecutorTransaccional`
 * que espera `packages/domain/src/aplicacion/reservas.ts` (packages/domain
 * no depende de `pg` en runtime — ver el comentario de ese archivo — así
 * que basta con este adaptador diminuto, sin tocar el paquete de dominio).
 */
export function comoEjecutor(cliente: PoolClient): EjecutorTransaccional {
  return {
    async query(sql, params) {
      const resultado = await cliente.query(sql, params as unknown[] | undefined);
      return { rows: resultado.rows, rowCount: resultado.rowCount };
    },
    async exec(sql) {
      await cliente.query(sql);
    },
  };
}

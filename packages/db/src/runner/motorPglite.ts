import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import type { EjecutorSql } from "./ejecutorSql.js";

/**
 * PGlite en memoria con btree_gist precargado. Uso: pruebas unitarias/
 * lógica rápidas (D-022). NUNCA usar para validar concurrencia real del
 * EXCLUDE — PGlite serializa toda escritura (medido: 1344 ms vs 302 ms de
 * embedded-postgres para la misma prueba, D-009/D-022) y por tanto no
 * puede dar falsos negativos de contención, pero tampoco puede probar que
 * el rechazo por SQLSTATE 23P01 sobrevive a una carrera real entre dos
 * procesos/conexiones concurrentes.
 */
export async function crearMotorPglite(): Promise<{
  ejecutor: EjecutorSql;
  cerrar: () => Promise<void>;
}> {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;

  const ejecutor: EjecutorSql = {
    async query(sql, params) {
      const resultado = await db.query(sql, params as unknown[] | undefined);
      return { rows: resultado.rows as never[], rowCount: resultado.affectedRows ?? null };
    },
    async exec(sql) {
      await db.exec(sql);
    },
  };

  return {
    ejecutor,
    cerrar: () => db.close(),
  };
}

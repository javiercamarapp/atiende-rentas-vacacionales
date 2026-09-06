import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import type { EjecutorSql } from "./ejecutorSql.js";

export interface MotorEmbeddedPostgres {
  ejecutor: EjecutorSql;
  /**
   * Crea una conexión `pg.Client` NUEVA e independiente contra la misma
   * base de datos del cluster embebido. Imprescindible para las pruebas de
   * concurrencia real (H-005): dos transacciones concurrentes deben venir
   * de dos conexiones de socket distintas, nunca de la misma conexión
   * serializando internamente sus propias queries.
   */
  nuevaConexion: () => Promise<pg.Client>;
  cerrar: () => Promise<void>;
}

function puertoAleatorioEnRango(): number {
  return 30000 + Math.floor(Math.random() * 20000);
}

/**
 * Levanta un cluster `embedded-postgres` real y efímero (Postgres 18.4,
 * D-009), aplica `CREATE EXTENSION btree_gist` y deja lista una base de
 * datos de prueba. Uso exclusivo de `test/integration/**` — nunca de
 * pruebas unitarias (D-022).
 */
export async function crearMotorEmbeddedPostgres(
  nombreBaseDeDatos = "atiende_rv_test",
): Promise<MotorEmbeddedPostgres> {
  const databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-embedded-pg-"));
  const port = puertoAleatorioEnRango();
  const user = "postgres";
  const password = "postgres";

  const pgEmbebido = new EmbeddedPostgres({
    databaseDir,
    port,
    user,
    password,
    persistent: false,
    onLog: () => {
      /* silenciado: el runner de vitest ya captura suficiente ruido */
    },
    onError: () => {
      /* idem */
    },
  });

  await pgEmbebido.initialise();
  await pgEmbebido.start();
  await pgEmbebido.createDatabase(nombreBaseDeDatos);

  const clientePrincipal = pgEmbebido.getPgClient(nombreBaseDeDatos);
  await clientePrincipal.connect();
  await clientePrincipal.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

  const ejecutor: EjecutorSql = {
    async query(sql, params) {
      const resultado = await clientePrincipal.query(sql, params as unknown[] | undefined);
      return { rows: resultado.rows, rowCount: resultado.rowCount };
    },
    async exec(sql) {
      // Sin params: node-postgres usa el protocolo simple de consulta, que
      // sí admite varios statements separados por `;` en una sola llamada.
      await clientePrincipal.query(sql);
    },
  };

  const conexionesAbiertas: pg.Client[] = [];

  return {
    ejecutor,
    async nuevaConexion() {
      const cliente = pgEmbebido.getPgClient(nombreBaseDeDatos);
      await cliente.connect();
      conexionesAbiertas.push(cliente);
      return cliente;
    },
    async cerrar() {
      await Promise.all(conexionesAbiertas.map((c) => c.end().catch(() => undefined)));
      await clientePrincipal.end().catch(() => undefined);
      await pgEmbebido.stop().catch(() => undefined);
      await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

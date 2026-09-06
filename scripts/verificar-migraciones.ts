#!/usr/bin/env -S npx tsx
/**
 * `npm run db:verificar-migraciones` (D-DSD-14).
 *
 * Audita un ambiente YA DESPLEGADO contra el catálogo de migraciones del
 * código fuente actual, sin aplicar ni revertir nada. El runner en tiempo
 * de ejecución (`packages/db/src/runner/migrar.ts`) ya falla fuerte en
 * cuanto detecta, AL APLICAR, que un `id` ya registrado en
 * `schema_migrations` tiene un hash de contenido distinto al de su `up`
 * actual en el catálogo — este comando permite hacer la MISMA
 * verificación bajo demanda, en cualquier momento, sin necesidad de
 * disparar un deploy nuevo (por ejemplo tras sospechar un rebase
 * descuidado que reescribió el archivo de una migración ya aplicada, o
 * como chequeo de salud periódico de un ambiente).
 *
 * Requiere `DATABASE_URL` apuntando al ambiente a verificar (mismo rol de
 * migraciones que usaría el runner real — ver apps/api/src/db/pool.ts).
 * No escribe nada en la base de datos: es de solo lectura.
 */
import pg from "pg";
import { migraciones } from "../packages/db/src/migrations/index.js";
import {
  verificarHashesMigraciones,
  type FilaMigracionAplicada,
} from "../packages/db/migrations-tooling/verificacionHash.js";

export async function verificarMigracionesContra(cliente: pg.Client | pg.PoolClient): Promise<number> {
  const tabla = await cliente.query<{ to_regclass: string | null }>(
    `SELECT to_regclass('schema_migrations')::text AS to_regclass`,
  );
  if (!tabla.rows[0]?.to_regclass) {
    console.log("schema_migrations no existe todavía en este ambiente — nada que verificar.");
    return 0;
  }

  const filas = await cliente.query<{ id: string; hash_up: string | null }>(
    `SELECT id, hash_up FROM schema_migrations ORDER BY id`,
  );
  const aplicadas: FilaMigracionAplicada[] = filas.rows.map((f) => ({ id: f.id, hash: f.hash_up }));

  const reporte = verificarHashesMigraciones(migraciones, aplicadas);

  if (reporte.sinHashRegistrado.length > 0) {
    console.log(
      `${reporte.sinHashRegistrado.length} migración(es) aplicada(s) sin hash registrado todavía ` +
        `(se adopta automáticamente la próxima vez que corra el runner real): ` +
        reporte.sinHashRegistrado.join(", "),
    );
  }
  if (reporte.aplicadasFueraDeCatalogo.length > 0) {
    console.log(
      `${reporte.aplicadasFueraDeCatalogo.length} id(s) aplicado(s) en la base de datos que ya no ` +
        `existen en el catálogo en memoria: ` + reporte.aplicadasFueraDeCatalogo.join(", "),
    );
  }

  if (!reporte.ok) {
    console.error(
      `\nDRIFT DE ESQUEMA DETECTADO — ${reporte.drift.length} migración(es) con contenido divergente ` +
        `bajo el mismo id:`,
    );
    for (const d of reporte.drift) {
      console.error(
        `  - ${d.id}: hash almacenado=${d.hashAlmacenado} · hash del código fuente actual=${d.hashEsperado}`,
      );
    }
    console.error(
      "\nEl esquema real de este ambiente NO coincide con lo que el código fuente actual dice que " +
        "debería haberse aplicado bajo estos ids (rebase/merge que reescribió el archivo de una " +
        "migración ya desplegada, o error humano). Requiere intervención humana explícita — nunca se " +
        "reaplica ni se ignora automáticamente.",
    );
    return 1;
  }

  console.log(`OK — ${migraciones.length} migración(es) en el catálogo, sin drift de contenido detectado.`);
  return 0;
}

async function main(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL no está definida — no hay ambiente que verificar.");
    return 1;
  }

  const cliente = new pg.Client({ connectionString: databaseUrl });
  await cliente.connect();
  try {
    return await verificarMigracionesContra(cliente);
  } finally {
    await cliente.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((error) => {
      console.error("Error verificando migraciones:", error);
      process.exitCode = 1;
    });
}

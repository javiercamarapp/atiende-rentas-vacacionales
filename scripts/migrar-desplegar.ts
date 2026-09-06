#!/usr/bin/env -S npx tsx
/**
 * `npm run db:migrar:desplegar` (Lote 3.3, despliegue).
 *
 * Aplica, de forma IDEMPOTENTE, todas las migraciones del catálogo que
 * todavía no estén registradas en `schema_migrations` del ambiente al que
 * apunte `DATABASE_URL` — reusa el mismo runner con protección de drift
 * por hash de contenido que ya usan las pruebas de integración
 * (`packages/db/src/runner/migrar.ts`, D-DSD-14): un `id` ya aplicado con
 * contenido distinto al del catálogo actual hace fallar el comando en vez
 * de reaplicar o ignorar en silencio.
 *
 * Pensado para un paso EXPLÍCITO y separado del build de Vercel (nunca
 * dentro de `vercel.json`/`buildCommand`): correr migraciones en cada
 * build de PREVIEW de cualquier PR contra un Postgres compartido sería
 * peligroso (builds concurrentes, PRs sin revisar). Ver
 * docs/despliegue/README.md para cuándo correr esto a mano (primer
 * deploy, tras cada `git push` a `main` que agregue migraciones) y
 * `.github/workflows/deploy.yml` para el paso equivalente en CI (solo si
 * `DATABASE_URL` está configurado como secret del repo).
 *
 * Sin `DATABASE_URL`, termina con código 0 (no 1): un despliegue todavía
 * sin Postgres gestionado aprovisionado no es un error de este comando —
 * ver `GET /health` (`baseDeDatos: "sin_configurar"`, apps/api/src/app.ts)
 * para el mismo estado honesto a nivel de API.
 */
import pg from "pg";
import { aplicarMigraciones } from "../packages/db/src/runner/migrar.js";
import type { EjecutorSql } from "../packages/db/src/runner/ejecutorSql.js";
import { migraciones } from "../packages/db/src/migrations/index.js";

function ejecutorDesdeClientePg(cliente: pg.Client): EjecutorSql {
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

export async function main(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      "[migrar-desplegar] DATABASE_URL no está definida — sin Postgres gestionado que migrar todavía " +
        "(ver docs/despliegue/README.md). No es un error: saliendo con código 0.",
    );
    return 0;
  }

  const cliente = new pg.Client({ connectionString: databaseUrl });
  await cliente.connect();
  try {
    const ejecutor = ejecutorDesdeClientePg(cliente);
    const aplicadasEnEstaCorrida = await aplicarMigraciones(ejecutor, migraciones);
    if (aplicadasEnEstaCorrida.length === 0) {
      console.log(
        `[migrar-desplegar] OK — ${migraciones.length} migración(es) en el catálogo, ninguna nueva por aplicar.`,
      );
    } else {
      console.log(
        `[migrar-desplegar] OK — ${aplicadasEnEstaCorrida.length} migración(es) nueva(s) aplicada(s): ` +
          aplicadasEnEstaCorrida.join(", "),
      );
    }
    return 0;
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
      console.error("[migrar-desplegar] Error aplicando migraciones:", error);
      process.exitCode = 1;
    });
}

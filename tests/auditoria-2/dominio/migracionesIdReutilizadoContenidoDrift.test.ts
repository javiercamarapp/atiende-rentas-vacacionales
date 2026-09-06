import { afterAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, crearMotorEmbeddedPostgres, type MotorEmbeddedPostgres } from "@atiende-rv/db";
import type { Migracion } from "@atiende-rv/db";

/**
 * Auditoría adversarial independiente (fase 2) — SOLO migraciones, punto
 * 2a del encargo (hueco NO cubierto por
 * `packages/db/test/migrations-tooling/ordenColisiones.test.ts`, que ya
 * leímos completo primero).
 *
 * `ordenColisiones.test.ts` cubre la colisión de NÚMERO (dos ids distintos
 * con el mismo prefijo NNNN, ej. "0020_cuenta_canal" vs. "0020_otra_cosa")
 * usando el linter ESTÁTICO `verificarOrdenYColisiones` — una herramienta
 * separada en `migrations-tooling/`, que NO es invocada automáticamente
 * por el runner real (`aplicarMigraciones`, `packages/db/src/runner/
 * migrar.ts`) al aplicar migraciones. Es decir: la protección contra
 * colisión de número es disciplina de CI/lint, no una verificación en
 * tiempo de ejecución del runner.
 *
 * El escenario que NINGUNA de las dos suites cubre es el más peligroso de
 * un merge de ramas: dos migraciones con el MISMO id EXACTO (mismo string,
 * no solo mismo número) pero contenido `up` DIFERENTE, aplicadas en dos
 * despliegues (`aplicarMigraciones`) SEPARADOS — el patrón real de
 * producción, donde cada deploy hace su propia llamada al runner contra el
 * mismo catálogo en memoria del código desplegado en ese momento.
 *
 * `aplicarMigraciones` (migrar.ts líneas 30-60) rastrea qué ya se aplicó
 * ÚNICAMENTE por el STRING `id` guardado en `schema_migrations` — nunca
 * por un hash de contenido. Esta suite confirma que, si alguien reutiliza
 * un id ya aplicado con un `up` de contenido distinto (típico de un
 * rebase/merge descuidado que reescribe el archivo de una migración ya
 * desplegada en vez de crear una nueva), el runner:
 *  (a) NO lo detecta ni falla — lo salta EN SILENCIO (porque el id ya
 *      figura en `schema_migrations`), y
 *  (b) reporta la corrida como exitosa (`aplicadasEnEstaCorrida` vacío,
 *      sin excepción), dejando el segundo `up` PERMANENTEMENTE sin
 *      aplicar y sin ninguna señal de alerta — drift de esquema invisible
 *      entre lo que el código fuente dice que debería existir y lo que
 *      realmente hay en la base de datos.
 */

let motor: MotorEmbeddedPostgres;

afterAll(async () => {
  await motor?.cerrar();
});

describe("2a: runner de migraciones — id reutilizado con contenido distinto entre dos corridas separadas", () => {
  it("aplica el primer `up` de un id, y SILENCIOSAMENTE nunca aplica el segundo `up` distinto para el mismo id en una corrida posterior", async () => {
    motor = await crearMotorEmbeddedPostgres("atiende_rv_migracion_id_reutilizado_test");

    const versionOriginal: Migracion = {
      id: "9500_demo_drift",
      descripcion: "versión original desplegada",
      up: "CREATE TABLE demo_drift_v1 (id integer PRIMARY KEY);",
      down: "DROP TABLE IF EXISTS demo_drift_v1;",
    };

    // Deploy 1: catálogo con la versión original.
    const aplicadas1 = await aplicarMigraciones(motor.ejecutor, [versionOriginal]);
    expect(aplicadas1).toEqual(["9500_demo_drift"]);
    const v1Existe = await motor.ejecutor.query<{ to_regclass: string | null }>(
      "SELECT to_regclass('demo_drift_v1')::text",
    );
    expect(v1Existe.rows[0]!.to_regclass).toBe("demo_drift_v1");

    // Alguien reescribe el ARCHIVO de la migración 9500 (mismo id, mismo
    // nombre de archivo) para que ahora cree una tabla distinta — el
    // escenario típico de un rebase que "corrige" una migración ya
    // mergeada en vez de crear una nueva numerada. Deploy 2 corre con este
    // catálogo actualizado, mismo cluster (mismo `schema_migrations` que
    // ya tiene "9500_demo_drift" registrado por el deploy anterior).
    const versionReescrita: Migracion = {
      id: "9500_demo_drift",
      descripcion: "versión reescrita tras rebase — CONTENIDO DISTINTO, mismo id",
      up: "CREATE TABLE demo_drift_v2 (id integer PRIMARY KEY, campo_nuevo text);",
      down: "DROP TABLE IF EXISTS demo_drift_v2;",
    };

    const aplicadas2 = await aplicarMigraciones(motor.ejecutor, [versionReescrita]);

    const v2Existe = await motor.ejecutor.query<{ to_regclass: string | null }>(
      "SELECT to_regclass('demo_drift_v2')::text",
    );

    // Comportamiento CORRECTO esperado de un runner de migraciones seguro:
    // un id reutilizado con contenido distinto debería, como mínimo,
    // FALLAR RUIDOSAMENTE (para forzar a renumerar la migración) — nunca
    // aplicarse en silencio y nunca reportarse como "nada que hacer" sin
    // ninguna advertencia.
    expect(v2Existe.rows[0]!.to_regclass).toBe("demo_drift_v2");
    expect(aplicadas2.length).toBeGreaterThan(0);
  }, 120_000);
});

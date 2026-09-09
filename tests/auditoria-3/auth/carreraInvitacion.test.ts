// Auditoría-3 / A3-AUTH-03 — repro de la SOSPECHA documentada en
// docs/auditoria-3/seguridad-auth.md.
//
// Hallazgo: en `POST /auth/registro` con `invitacionToken`
// (apps/api/src/routes/auth.ts, rama `cuerpo.invitacionToken`), la
// comprobación de la invitación (`autenticar_buscar_invitacion`, un
// SELECT sin `FOR UPDATE`) y la creación del usuario
// (`autenticar_registrar_usuario`) son sentencias sueltas — NI SIQUIERA
// están envueltas en `enTransaccion`/BEGIN..COMMIT explícito, cada
// `cliente.query(...)` es autocommit por su cuenta — antes de marcar
// `autenticar_aceptar_invitacion`. La sospecha: 2 llamadas concurrentes
// con el MISMO token de invitación podrían crear 2 cuentas de usuario
// para el mismo email/tenant.
//
// Este archivo dispara el repro EXACTO pedido: 2 `POST /auth/registro`
// concurrentes (Promise.all) contra la API real (`app.request(...)`,
// nunca llamando `autenticar_registrar_usuario`/`autenticar_aceptar_
// invitacion` directamente) con el mismo `invitacionToken`, contra
// `embedded-postgres` real — mismo patrón que
// `apps/api/test/integration/authExtendido.test.ts` (fixtures + pool con
// el rol `app_rv`, nunca el superusuario, para que la respuesta HTTP
// refleje RLS/constraints reales) y que
// `tests/auditoria-3/auth/rateLimitNoDistribuido.test.ts` (embedded-
// postgres + catálogo completo de migraciones).
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../../apps/api/src/app.js";
import { crearTenant } from "../../../apps/api/test/soporte/fixtures.js";

process.env.JWT_SECRET = "prueba-jwt-secret-a3-auth-03-al-menos-32-caracteres-00";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

function puertoAleatorio(): number {
  return 58000 + Math.floor(Math.random() * 2000);
}

function sha256Hex(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

let databaseDir: string;
let servidorPg: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;
let app: ReturnType<typeof crearApp>;

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-a3-auth-03-test-"));
  const puertoPg = puertoAleatorio();
  servidorPg = new EmbeddedPostgres({
    databaseDir,
    port: puertoPg,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await servidorPg.initialise();
  await servidorPg.start();
  await servidorPg.createDatabase("atiende_rv_a3_auth_03_test");

  superusuario = servidorPg.getPgClient("atiende_rv_a3_auth_03_test");
  await superusuario.connect();

  const ejecutor: EjecutorSql = {
    async query(sql, params) {
      const r = await superusuario.query(sql, params as unknown[] | undefined);
      return { rows: r.rows, rowCount: r.rowCount };
    },
    async exec(sql) {
      await superusuario.query(sql);
    },
  };
  await aplicarMigraciones(ejecutor, migraciones);

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puertoPg,
    database: "atiende_rv_a3_auth_03_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });

  app = crearApp({ pool });
}, 120_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  await superusuario?.end().catch(() => undefined);
  await servidorPg?.stop().catch(() => undefined);
  if (databaseDir) await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

const consolaErrorOriginal = console.error;
afterEach(() => {
  console.error = consolaErrorOriginal;
});

async function crearInvitacion(tenantId: string, email: string, tokenCrudo: string): Promise<string> {
  const hash = sha256Hex(tokenCrudo);
  const r = await superusuario.query<{ id: string }>(
    `INSERT INTO invitacion_usuario (tenant_id, email, rol, colaborador_nivel, token_hash, expira_en)
     VALUES ($1, $2, 'operador', 'solo_calendario', $3, now() + interval '1 day')
     RETURNING id`,
    [tenantId, email, hash],
  );
  return r.rows[0]!.id;
}

function registrar(tokenCrudo: string, email: string) {
  return app.request("/auth/registro", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "PasswordValida#123456", invitacionToken: tokenCrudo }),
  });
}

describe("A3-AUTH-03 — repro: 2 aceptaciones concurrentes de la MISMA invitación vía POST /auth/registro real", () => {
  it("dispara 2 llamadas concurrentes con el mismo invitacionToken y reporta el resultado exacto", async () => {
    // Captura (en vez de solo silenciar) el log de "error_interno" que
    // dispara app.onError()/console.error para la petición perdedora —
    // sirve como evidencia de la causa raíz exacta (qué error de Postgres
    // la produjo), no solo de que la petición falló.
    const erroresCapturados: string[] = [];
    console.error = (...args: unknown[]) => {
      erroresCapturados.push(args.map(String).join(" "));
    };

    const tenantId = await crearTenant(superusuario, "T-A3-AUTH-03-Carrera");
    const email = "carrera.invitacion@auditoria3.local";
    const tokenCrudo = "token-carrera-invitacion-a3-auth-03-0001";
    const invitacionId = await crearInvitacion(tenantId, email, tokenCrudo);

    // Las 2 llamadas EXACTAMENTE concurrentes pedidas: mismo token, mismo
    // email, contra la API real, disparadas con Promise.all (no en
    // secuencia) para maximizar la ventana de carrera entre el SELECT de
    // autenticar_buscar_invitacion y el UPDATE de
    // autenticar_aceptar_invitacion.
    const [resA, resB] = await Promise.all([registrar(tokenCrudo, email), registrar(tokenCrudo, email)]);

    const [cuerpoA, cuerpoB] = await Promise.all([
      resA.json().catch(() => null),
      resB.json().catch(() => null),
    ]);

    console.log("A3-AUTH-03 repro — respuesta A:", resA.status, JSON.stringify(cuerpoA));
    console.log("A3-AUTH-03 repro — respuesta B:", resB.status, JSON.stringify(cuerpoB));

    const { rows: usuarios } = await superusuario.query<{ id: string }>(
      "SELECT id FROM usuario WHERE lower(email) = lower($1)",
      [email],
    );
    const { rows: invRows } = await superusuario.query<{ aceptada_en: string | null }>(
      "SELECT aceptada_en FROM invitacion_usuario WHERE id = $1",
      [invitacionId],
    );

    console.log("A3-AUTH-03 repro — usuarios creados con ese email:", usuarios.length);
    console.log("A3-AUTH-03 repro — invitacion.aceptada_en:", invRows[0]?.aceptada_en);
    console.log("A3-AUTH-03 repro — console.error capturado (causa raíz de la petición perdedora):", erroresCapturados);

    // La aserción central del hallazgo: NUNCA debe haber 2 filas de
    // `usuario` para el mismo email (eso sería la "duplicidad de alta"
    // sospechada). Con el índice único `usuario_email_key` (lower(email),
    // migración 0003) esto se sostiene incluso sin el `FOR UPDATE`
    // sugerido — lo que este test verifica es si eso es realmente así en
    // la práctica, no lo asume.
    expect(usuarios.length).toBeLessThanOrEqual(1);

    // Documenta también cómo se resolvió la segunda petición: éxito
    // limpio (201, la invitación ya aceptada) o un error — nunca 2×201.
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).not.toEqual([201, 201]);
  });

  it("con 5 llamadas concurrentes (no solo 2) al mismo invitacionToken, exactamente 1 gana y se crea exactamente 1 usuario", async () => {
    console.error = () => undefined; // ruido esperado (4 de 5 chocan contra usuario_email_key)

    const tenantId = await crearTenant(superusuario, "T-A3-AUTH-03-Carrera-N5");
    const email = "carrera.invitacion.n5@auditoria3.local";
    const tokenCrudo = "token-carrera-invitacion-a3-auth-03-n5-0001";
    const invitacionId = await crearInvitacion(tenantId, email, tokenCrudo);

    const respuestas = await Promise.all(Array.from({ length: 5 }, () => registrar(tokenCrudo, email)));
    const statuses = respuestas.map((r) => r.status).sort();

    const { rows: usuarios } = await superusuario.query<{ id: string }>(
      "SELECT id FROM usuario WHERE lower(email) = lower($1)",
      [email],
    );
    const { rows: invRows } = await superusuario.query<{ aceptada_en: string | null }>(
      "SELECT aceptada_en FROM invitacion_usuario WHERE id = $1",
      [invitacionId],
    );

    console.log("A3-AUTH-03 repro (N=5) — statuses:", statuses);
    console.log("A3-AUTH-03 repro (N=5) — usuarios creados con ese email:", usuarios.length);

    expect(usuarios).toHaveLength(1);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(invRows[0]?.aceptada_en).not.toBeNull();
  });
});

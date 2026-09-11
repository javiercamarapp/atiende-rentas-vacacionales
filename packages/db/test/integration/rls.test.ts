import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones } from "../../src/runner/migrar.js";
import { migraciones } from "../../src/migrations/index.js";
import type { EjecutorSql } from "../../src/runner/ejecutorSql.js";

/**
 * Suite de aislamiento cross-tenant (H-042, caso adversarial 18) y
 * escalada de privilegios (H-044, caso adversarial 19) — verificado con
 * **SQL directo** contra el rol `app_rv` (packages/db migración 0012,
 * SIN BYPASSRLS), nunca a través de `apps/api`: si un bug futuro en la
 * capa HTTP olvidara un chequeo de rol, esta suite sigue probando que la
 * base de datos por sí sola rechaza el cruce (D-020, "RLS es fail-closed
 * por defecto").
 *
 * Instancia su PROPIO cluster `embedded-postgres` (no reutiliza
 * `crearMotorEmbeddedPostgres`, que siempre conecta como el superusuario
 * `postgres`) porque necesita abrir conexiones adicionales autenticadas
 * como `app_rv` — un superusuario SIEMPRE ignora RLS sin importar `FORCE`
 * (D-020/RV17-F-05), así que probar esto con la conexión de superusuario
 * daría un falso verde.
 */

const USUARIO_SUPERUSUARIO = "postgres";
const PASSWORD_SUPERUSUARIO = "postgres";
const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod"; // ver 0012_rol_aplicacion.ts

let databaseDir: string;
let servidor: EmbeddedPostgres;
let puerto: number;
let superusuario: pg.Client;
const conexionesAppRv: pg.Client[] = [];

interface IdsFixture {
  tenantA: string;
  tenantB: string;
  propiedadA: string;
  propiedadB: string;
  unidadA: string;
  unidadB: string;
  ownerA: string;
  egA: string;
  adminA: string;
  operadorAccesoTotal: string;
  operadorSoloCalendario: string;
  propietarioA: string;
  contadorA: string;
  limpiezaA: string;
  superadmin: string;
  adminB: string;
}
let ids: IdsFixture;

function puertoAleatorioEnRango(): number {
  return 40000 + Math.floor(Math.random() * 10000);
}

async function nuevaConexionAppRv(): Promise<pg.Client> {
  const cliente = new pg.Client({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_rls_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  await cliente.connect();
  conexionesAppRv.push(cliente);
  return cliente;
}

/** Abre una conexión app_rv, fija la sesión (`set_config` de alcance de
 * sesión, igual que apps/api/src/db/contexto.ts) y la deja lista para
 * ejercitar RLS como ese usuario/rol exacto. */
async function comoUsuario(
  usuarioId: string,
  tenantId: string | null,
  rol: string,
  colaboradorNivel: string | null = null,
): Promise<pg.Client> {
  const cliente = await nuevaConexionAppRv();
  await cliente.query("SELECT set_config('app.user_id', $1, false)", [usuarioId]);
  await cliente.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId ?? ""]);
  await cliente.query("SELECT set_config('app.rol', $1, false)", [rol]);
  await cliente.query("SELECT set_config('app.colaborador_nivel', $1, false)", [colaboradorNivel ?? ""]);
  return cliente;
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-rls-test-"));
  puerto = puertoAleatorioEnRango();
  servidor = new EmbeddedPostgres({
    databaseDir,
    port: puerto,
    user: USUARIO_SUPERUSUARIO,
    password: PASSWORD_SUPERUSUARIO,
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase("atiende_rv_rls_test");

  superusuario = servidor.getPgClient("atiende_rv_rls_test");
  await superusuario.connect();
  await superusuario.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

  const ejecutor: EjecutorSql = {
    async query(sql, params) {
      const resultado = await superusuario.query(sql, params as unknown[] | undefined);
      return { rows: resultado.rows, rowCount: resultado.rowCount };
    },
    async exec(sql) {
      await superusuario.query(sql);
    },
  };
  await aplicarMigraciones(ejecutor, migraciones);

  // --- Fixtures: dos tenants, cada uno con su propiedad/unidad, y un
  // usuario por cada rol relevante en el tenant A (§Roles-1/§Roles-4). ---
  const tenantA = await superusuario.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('Tenant A') RETURNING id",
  );
  const tenantB = await superusuario.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('Tenant B') RETURNING id",
  );
  const egA = await superusuario.query<{ id: string }>(
    "INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, 'EG A') RETURNING id",
    [tenantA.rows[0]!.id],
  );
  const ownerA = await superusuario.query<{ id: string }>(
    "INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, 'Owner A') RETURNING id",
    [egA.rows[0]!.id],
  );
  const propiedadA = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop A', 'America/Cancun') RETURNING id",
    [tenantA.rows[0]!.id],
  );
  const propiedadB = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop B', 'America/Cancun') RETURNING id",
    [tenantB.rows[0]!.id],
  );
  const unidadA = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, owner_id, nombre) VALUES ($1, $2, 'Unidad A1') RETURNING id",
    [propiedadA.rows[0]!.id, ownerA.rows[0]!.id],
  );
  const unidadB = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad B1') RETURNING id",
    [propiedadB.rows[0]!.id],
  );

  async function crearUsuario(
    tenantId: string | null,
    email: string,
    rol: string,
    colaboradorNivel: string | null,
    ownerId: string | null,
  ): Promise<string> {
    const resultado = await superusuario.query<{ id: string }>(
      `INSERT INTO usuario (tenant_id, email, rol, colaborador_nivel, owner_id, password_hash)
       VALUES ($1, $2, $3, $4, $5, 'x') RETURNING id`,
      [tenantId, email, rol, colaboradorNivel, ownerId],
    );
    return resultado.rows[0]!.id;
  }

  ids = {
    tenantA: tenantA.rows[0]!.id,
    tenantB: tenantB.rows[0]!.id,
    propiedadA: propiedadA.rows[0]!.id,
    propiedadB: propiedadB.rows[0]!.id,
    unidadA: unidadA.rows[0]!.id,
    unidadB: unidadB.rows[0]!.id,
    ownerA: ownerA.rows[0]!.id,
    egA: egA.rows[0]!.id,
    adminA: await crearUsuario(tenantA.rows[0]!.id, "admin.a@test.local", "admin_gestora", null, null),
    operadorAccesoTotal: await crearUsuario(
      tenantA.rows[0]!.id,
      "operador.total.a@test.local",
      "operador",
      "acceso_total",
      null,
    ),
    operadorSoloCalendario: await crearUsuario(
      tenantA.rows[0]!.id,
      "operador.solo.a@test.local",
      "operador",
      "solo_calendario",
      null,
    ),
    propietarioA: await crearUsuario(
      tenantA.rows[0]!.id,
      "propietario.a@test.local",
      "propietario",
      null,
      ownerA.rows[0]!.id,
    ),
    contadorA: await crearUsuario(tenantA.rows[0]!.id, "contador.a@test.local", "contador", null, null),
    limpiezaA: await crearUsuario(tenantA.rows[0]!.id, "limpieza.a@test.local", "limpieza", null, null),
    superadmin: await crearUsuario(null, "superadmin@test.local", "superadmin", null, null),
    adminB: await crearUsuario(tenantB.rows[0]!.id, "admin.b@test.local", "admin_gestora", null, null),
  };
}, 120_000);

afterAll(async () => {
  await Promise.all(conexionesAppRv.map((c) => c.end().catch(() => undefined)));
  await superusuario.end().catch(() => undefined);
  await servidor.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("H-042 / caso adversarial 18: aislamiento cross-tenant (SQL directo, rol app_rv sin BYPASSRLS)", () => {
  it("adminA no ve la propiedad del tenant B (0 filas, sin error)", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const resultado = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadB]);
    expect(resultado.rowCount).toBe(0);
  });

  it("adminA no ve la unidad ni el calendario del tenant B", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const unidad = await cliente.query("SELECT * FROM unidad WHERE id = $1", [ids.unidadB]);
    expect(unidad.rowCount).toBe(0);

    await superusuario.query(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange('2026-06-01','2026-06-05','[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)`,
      [ids.unidadB],
    );
    const ocupacion = await cliente.query("SELECT * FROM ocupacion_unidad WHERE unidad_id = $1", [ids.unidadB]);
    expect(ocupacion.rowCount).toBe(0);
  });

  it("adminA no puede modificar (UPDATE) la propiedad del tenant B — 0 filas afectadas, dato intacto", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const resultado = await cliente.query("UPDATE propiedad SET nombre = 'hackeado' WHERE id = $1", [
      ids.propiedadB,
    ]);
    expect(resultado.rowCount).toBe(0);

    const verificacion = await superusuario.query("SELECT nombre FROM propiedad WHERE id = $1", [ids.propiedadB]);
    expect(verificacion.rows[0]!.nombre).toBe("Prop B");
  });

  it("adminA no puede insertar un bloqueo en la unidad del tenant B (rechazado por RLS, no por la app)", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    await expect(
      cliente.query(
        `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
         VALUES ($1, daterange('2026-07-01','2026-07-02','[)'), 'bloqueo', 'MANTENIMIENTO', 'confirmado', true)`,
        [ids.unidadB],
      ),
    ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege (RLS WITH CHECK)
  });

  it("§Roles-4: adminB (tenant B) no ve el owner del tenant A", async () => {
    const cliente = await comoUsuario(ids.adminB, ids.tenantB, "admin_gestora");
    const resultado = await cliente.query("SELECT * FROM owner WHERE id = $1", [ids.ownerA]);
    expect(resultado.rowCount).toBe(0);
  });

  // Lote 8 (H-075/H-076, `0061_acceso_romper_cristal.ts`): supersede la
  // decisión original de esta prueba (D-020, "superadmin es miembro
  // honorario incondicional") — desde ahora `is_tenant_member` exige una
  // concesión `acceso_romper_cristal` vigente (motivo + ventana acotada)
  // para que un superadmin vea datos de NEGOCIO de un tenant. El
  // directorio de la propia tabla `tenant` (nombre/estado, sin datos de
  // negocio) sigue siendo visible sin concesión — ver
  // `tenant_select_superadmin_directorio` en la misma migración.
  it("sin concesión 'romper cristal' vigente, un superadmin obtiene 0 filas de datos de un tenant (RLS lo impide)", async () => {
    const cliente = await comoUsuario(ids.superadmin, null, "superadmin");
    const propA = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadA]);
    const propB = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadB]);
    expect(propA.rowCount).toBe(0);
    expect(propB.rowCount).toBe(0);
  });

  it("con una concesión 'romper cristal' vigente y con motivo, el superadmin SÍ lee datos de ESE tenant (y solo ese)", async () => {
    await superusuario.query(
      `INSERT INTO acceso_romper_cristal (superadmin_id, tenant_id, motivo, expira_en)
       VALUES ($1, $2, 'Investigación de ticket de soporte #123', now() + interval '15 minutes')`,
      [ids.superadmin, ids.tenantA],
    );
    const cliente = await comoUsuario(ids.superadmin, null, "superadmin");
    const propA = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadA]);
    const propB = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadB]);
    expect(propA.rowCount).toBe(1); // tenant A: con concesión vigente.
    expect(propB.rowCount).toBe(0); // tenant B: sin concesión, sigue en 0.
  });

  it("una concesión expirada ya no da acceso (ventana temporal acotada)", async () => {
    await superusuario.query(
      `INSERT INTO acceso_romper_cristal (superadmin_id, tenant_id, motivo, creado_en, expira_en)
       VALUES ($1, $2, 'Concesión ya vencida', now() - interval '1 hour', now() - interval '1 minute')`,
      [ids.superadmin, ids.tenantB],
    );
    const cliente = await comoUsuario(ids.superadmin, null, "superadmin");
    const propB = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadB]);
    expect(propB.rowCount).toBe(0);
  });

  it("el directorio de tenants (tabla tenant) sigue siendo visible para superadmin SIN concesión", async () => {
    const cliente = await comoUsuario(ids.superadmin, null, "superadmin");
    const directorio = await cliente.query("SELECT id, nombre, estado FROM tenant ORDER BY nombre");
    const nombres = directorio.rows.map((r: { nombre: string }) => r.nombre);
    expect(nombres).toContain("Tenant A");
    expect(nombres).toContain("Tenant B");
  });

  // A3-DESP-01 (`0128_delegacion_servicio_sistema.ts`): tercera rama de
  // is_tenant_member, separada por completo de acceso_romper_cristal —
  // una delegación de servicio ACTIVA (sin tenant_id: aplica a todos)
  // hace miembro a un superadmin de CUALQUIER tenant, sin crear ninguna
  // fila en la tabla del canal humano de emergencia.
  describe("delegación de servicio del sistema (A3-DESP-01) — separada de romper cristal", () => {
    afterEach(async () => {
      await superusuario
        .query("UPDATE delegacion_servicio_sistema SET revocado_en = now() WHERE revocado_en IS NULL")
        .catch(() => undefined);
    });

    it("con una delegación de servicio activa, el superadmin lee datos de TODOS los tenants (A y B)", async () => {
      await superusuario.query(
        `INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo)
         VALUES ('cron_sync_ical', $1, 'Prueba de integración: delegación estable de servicio')`,
        [ids.superadmin],
      );

      const cliente = await comoUsuario(ids.superadmin, null, "superadmin");
      // tenant B en particular: a esta altura del archivo, la única
      // concesión `acceso_romper_cristal` que este superadmin tuvo para
      // el tenant B ya expiró (ver "una concesión expirada ya no da
      // acceso" más arriba) — que SÍ pueda leerlo ahora demuestra que es
      // la delegación de servicio, y no un romper-cristal residual de
      // otro test, la que está otorgando el acceso.
      const propB = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadB]);
      expect(propB.rowCount).toBe(1);
    });

    it("una delegación de servicio REVOCADA ya no da acceso cross-tenant", async () => {
      await superusuario.query(
        `INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo, revocado_en)
         VALUES ('cron_sync_ical', $1, 'Delegación de prueba, ya revocada', now())`,
        [ids.superadmin],
      );

      const cliente = await comoUsuario(ids.superadmin, null, "superadmin");
      // tenant B de nuevo, por la misma razón: sin un romper-cristal
      // vigente que pueda confundir el resultado (el de B ya expiró).
      const propB = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadB]);
      expect(propB.rowCount).toBe(0);
    });

    it("app_rv no puede crear su propia delegación de servicio (RLS bloquea el INSERT sin política)", async () => {
      const cliente = await comoUsuario(ids.superadmin, null, "superadmin");
      await expect(
        cliente.query(
          `INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo)
           VALUES ('cron_sync_ical', $1, 'intento de auto-otorgarse una delegación')`,
          [ids.superadmin],
        ),
      ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege (sin política INSERT para app_rv)
    });

    it("un admin_gestora (no superadmin) no puede leer delegacion_servicio_sistema", async () => {
      await superusuario.query(
        `INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo)
         VALUES ('cron_sync_ical', $1, 'Prueba de integración: visibilidad restringida a superadmin')`,
        [ids.superadmin],
      );
      const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
      const filas = await cliente.query("SELECT 1 FROM delegacion_servicio_sistema");
      expect(filas.rowCount).toBe(0);
    });
  });
});

describe("H-044 / caso adversarial 19: escalada de privilegios rechazada por RLS (no solo por la UI)", () => {
  it("un operador 'solo_calendario' no puede crear un bloqueo (rechazado por RLS)", async () => {
    const cliente = await comoUsuario(ids.operadorSoloCalendario, ids.tenantA, "operador", "solo_calendario");
    await expect(
      cliente.query(
        `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
         VALUES ($1, daterange('2026-08-01','2026-08-02','[)'), 'bloqueo', 'MANTENIMIENTO', 'confirmado', true)`,
        [ids.unidadA],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("un operador 'acceso_total' SÍ puede crear un bloqueo en su propio tenant", async () => {
    const cliente = await comoUsuario(ids.operadorAccesoTotal, ids.tenantA, "operador", "acceso_total");
    const resultado = await cliente.query(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange('2026-08-10','2026-08-11','[)'), 'bloqueo', 'MANTENIMIENTO', 'confirmado', true)
       RETURNING id`,
      [ids.unidadA],
    );
    expect(resultado.rowCount).toBe(1);
  });

  it("un operador no puede auto-promoverse a admin_gestora (UPDATE usuario rechazado)", async () => {
    const cliente = await comoUsuario(ids.operadorAccesoTotal, ids.tenantA, "operador", "acceso_total");
    const resultado = await cliente.query("UPDATE usuario SET rol = 'admin_gestora' WHERE id = $1", [
      ids.operadorAccesoTotal,
    ]);
    expect(resultado.rowCount).toBe(0);

    const verificacion = await superusuario.query("SELECT rol FROM usuario WHERE id = $1", [
      ids.operadorAccesoTotal,
    ]);
    expect(verificacion.rows[0]!.rol).toBe("operador");
  });

  it("un contador no ve ninguna fila operativa de calendario (propiedad/unidad/ocupacion)", async () => {
    const cliente = await comoUsuario(ids.contadorA, ids.tenantA, "contador");
    const propiedades = await cliente.query("SELECT * FROM propiedad WHERE tenant_id = $1", [ids.tenantA]);
    const unidades = await cliente.query("SELECT * FROM unidad WHERE id = $1", [ids.unidadA]);
    expect(propiedades.rowCount).toBe(0);
    expect(unidades.rowCount).toBe(0);
  });

  it("limpieza no ve ninguna fila operativa de calendario (brecha documentada: sin tabla de tareas aún, Lote 5)", async () => {
    const cliente = await comoUsuario(ids.limpiezaA, ids.tenantA, "limpieza");
    const unidades = await cliente.query("SELECT * FROM unidad WHERE id = $1", [ids.unidadA]);
    expect(unidades.rowCount).toBe(0);
  });
});

describe("§Roles-1/§Roles-4: propietario limitado a sus propias unidades", () => {
  it("propietarioA ve su propia unidad pero no vería la de otro owner del mismo tenant", async () => {
    const cliente = await comoUsuario(ids.propietarioA, ids.tenantA, "propietario");
    const propia = await cliente.query("SELECT * FROM unidad WHERE id = $1", [ids.unidadA]);
    expect(propia.rowCount).toBe(1);

    // Segunda unidad del MISMO tenant, de un owner distinto — nunca visible.
    // (empresa_gestora tiene UNIQUE(tenant_id): se reutiliza la misma EG del
    // tenant A, un segundo owner bajo esa misma EG es suficiente para
    // probar el aislamiento por owner_id, no hace falta una EG nueva.)
    const otroOwner = await superusuario.query<{ id: string }>(
      "INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, 'Owner A2') RETURNING id",
      [ids.egA],
    );
    const otraUnidad = await superusuario.query<{ id: string }>(
      "INSERT INTO unidad (propiedad_id, owner_id, nombre) VALUES ($1, $2, 'Unidad A2') RETURNING id",
      [ids.propiedadA, otroOwner.rows[0]!.id],
    );

    const ajena = await cliente.query("SELECT * FROM unidad WHERE id = $1", [otraUnidad.rows[0]!.id]);
    expect(ajena.rowCount).toBe(0);
  });

  it("propietarioA no ve el registro owner de otro propietario", async () => {
    const cliente = await comoUsuario(ids.propietarioA, ids.tenantA, "propietario");
    const otroOwner = await superusuario.query<{ id: string }>(
      "INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, 'Owner A3') RETURNING id",
      [ids.egA],
    );
    const resultado = await cliente.query("SELECT * FROM owner WHERE id = $1", [otroOwner.rows[0]!.id]);
    expect(resultado.rowCount).toBe(0);
  });
});

describe("REQ-023/H-048 §Roles-4: multitenancy N:M owner↔empresa_gestora (0133_owner_empresa_gestora.ts)", () => {
  // Un mismo owner vinculado a DOS empresas_gestoras (tenant A y un tenant
  // C nuevo, dedicado a este bloque para no interferir con las fixtures
  // compartidas de tenant B): cada empresa_gestora tiene su propia
  // propiedad/unidad administrando a ese owner. El criterio de aceptación
  // exacto (docs/ACEPTACION.md §Roles-4) es que cada una vea SOLO lo que
  // administra de ese propietario, nunca lo de la otra.
  let tenantC: string;
  let egC: string;
  let propiedadC: string;
  let unidadC: string;
  let adminC: string;
  let ownerCompartido: string;

  beforeAll(async () => {
    const tenant = await superusuario.query<{ id: string }>(
      "INSERT INTO tenant (nombre) VALUES ('Tenant C (H-048)') RETURNING id",
    );
    tenantC = tenant.rows[0]!.id;

    const eg = await superusuario.query<{ id: string }>(
      "INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, 'EG C') RETURNING id",
      [tenantC],
    );
    egC = eg.rows[0]!.id;

    // Owner dado de alta originalmente en la empresa_gestora del tenant A
    // (empresa_gestora_id = egA, como cualquier owner de hoy) — la
    // vinculación N:M con EG C se añade DESPUÉS, sobre la tabla puente,
    // simulando "el propietario también le confía propiedades a una
    // segunda gestora" sin tocar su fila de alta original.
    const owner = await superusuario.query<{ id: string }>(
      "INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, 'Owner compartido A+C') RETURNING id",
      [ids.egA],
    );
    ownerCompartido = owner.rows[0]!.id;

    await superusuario.query(
      "INSERT INTO owner_empresa_gestora (owner_id, empresa_gestora_id) VALUES ($1, $2)",
      [ownerCompartido, egC],
    );

    const propiedad = await superusuario.query<{ id: string }>(
      "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop C', 'America/Cancun') RETURNING id",
      [tenantC],
    );
    propiedadC = propiedad.rows[0]!.id;

    const unidad = await superusuario.query<{ id: string }>(
      "INSERT INTO unidad (propiedad_id, owner_id, nombre) VALUES ($1, $2, 'Unidad C1') RETURNING id",
      [propiedadC, ownerCompartido],
    );
    unidadC = unidad.rows[0]!.id;

    adminC = await superusuario
      .query<{ id: string }>(
        `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'admin.c@test.local', 'admin_gestora', 'x') RETURNING id`,
        [tenantC],
      )
      .then((r) => r.rows[0]!.id);
  });

  it("la migración de datos existentes preservó la relación 1:N previa: ownerA (alta original) sigue vinculado a egA en la tabla puente", async () => {
    const fila = await superusuario.query(
      "SELECT 1 FROM owner_empresa_gestora WHERE owner_id = $1 AND empresa_gestora_id = $2",
      [ids.ownerA, ids.egA],
    );
    expect(fila.rowCount).toBe(1);
  });

  it("el owner compartido queda vinculado a AMBAS empresas_gestoras (egA de alta + egC añadida vía tabla puente)", async () => {
    const filas = await superusuario.query<{ empresa_gestora_id: string }>(
      "SELECT empresa_gestora_id FROM owner_empresa_gestora WHERE owner_id = $1 ORDER BY empresa_gestora_id",
      [ownerCompartido],
    );
    expect(filas.rows.map((f) => f.empresa_gestora_id).sort()).toEqual([ids.egA, egC].sort());
  });

  it("adminA (tenant A) ve el owner compartido y SU propiedad (Prop A), nunca la Prop C de la otra empresa_gestora", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");

    const owner = await cliente.query("SELECT * FROM owner WHERE id = $1", [ownerCompartido]);
    expect(owner.rowCount).toBe(1);

    const propA = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadA]);
    expect(propA.rowCount).toBe(1);

    // Núcleo del criterio de aceptación: consulta cruzada rechazada por RLS.
    const propC = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [propiedadC]);
    expect(propC.rowCount).toBe(0);
    const unidadCDesdeA = await cliente.query("SELECT * FROM unidad WHERE id = $1", [unidadC]);
    expect(unidadCDesdeA.rowCount).toBe(0);
  });

  it("adminC (tenant C) ve el MISMO owner compartido (antes de H-048 esto era 0 filas: el owner solo pertenecía al tenant de alta) y SU propiedad (Prop C), nunca la Prop A de la otra empresa_gestora", async () => {
    const cliente = await comoUsuario(adminC, tenantC, "admin_gestora");

    const owner = await cliente.query("SELECT * FROM owner WHERE id = $1", [ownerCompartido]);
    expect(owner.rowCount).toBe(1);

    const propC = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [propiedadC]);
    expect(propC.rowCount).toBe(1);

    // Núcleo del criterio de aceptación, en el sentido inverso: la empresa
    // gestora nueva tampoco fuga los datos de la empresa gestora de alta.
    const propA = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadA]);
    expect(propA.rowCount).toBe(0);
    const unidadADesdeC = await cliente.query("SELECT * FROM unidad WHERE id = $1", [ids.unidadA]);
    expect(unidadADesdeC.rowCount).toBe(0);
  });

  it("adminB (tenant B, sin ninguna vinculación con el owner compartido) no ve ni el owner ni ninguna de sus dos propiedades", async () => {
    const cliente = await comoUsuario(ids.adminB, ids.tenantB, "admin_gestora");

    const owner = await cliente.query("SELECT * FROM owner WHERE id = $1", [ownerCompartido]);
    expect(owner.rowCount).toBe(0);
    const propA = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [ids.propiedadA]);
    expect(propA.rowCount).toBe(0);
    const propC = await cliente.query("SELECT * FROM propiedad WHERE id = $1", [propiedadC]);
    expect(propC.rowCount).toBe(0);
  });

  it("la tabla puente owner_empresa_gestora en sí no fuga: adminA no ve la fila que vincula al owner con egC (tenant ajeno)", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const soloSuVinculo = await cliente.query(
      "SELECT empresa_gestora_id FROM owner_empresa_gestora WHERE owner_id = $1",
      [ownerCompartido],
    );
    // Ve la fila (owner, egA) porque es miembro de egA, pero nunca la fila
    // (owner, egC) — ninguna consulta cruzada revela con qué OTRA
    // empresa_gestora comparte propietario un tenant ajeno.
    expect(soloSuVinculo.rows.map((f) => f.empresa_gestora_id)).toEqual([ids.egA]);
  });

  it("adminA no puede vincular (INSERT) el owner compartido a una empresa_gestora ajena vía la tabla puente", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    await expect(
      cliente.query("INSERT INTO owner_empresa_gestora (owner_id, empresa_gestora_id) VALUES ($1, $2)", [
        ids.ownerA,
        egC,
      ]),
    ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege (RLS WITH CHECK)
  });
});

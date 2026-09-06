import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones } from "../../src/runner/migrar.js";
import { migraciones } from "../../src/migrations/index.js";
import type { EjecutorSql } from "../../src/runner/ejecutorSql.js";

/**
 * Lote 3.3 (RV16) — integración real (embedded-postgres, D-022) de:
 * (a) onboarding self-serve crea tenant + admin + suscripción de prueba
 *     sin ninguna sesión previa (funciones SECURITY DEFINER de las
 *     migraciones 0121/0122);
 * (b) RLS de plan_facturacion (catálogo público) / suscripcion_tenant
 *     (aislado por tenant) / medicion_uso_mensaje_ia;
 * (c) idempotencia del webhook de pagos (facturacion_registrar_pago,
 *     migración 0124) — un mismo evento_id no reaplica el efecto;
 * (d) facturacion_actualizar_plan exige rol superadmin.
 */
const USUARIO_SUPERUSUARIO = "postgres";
const PASSWORD_SUPERUSUARIO = "postgres";
const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let puerto: number;
let superusuario: pg.Client;
const conexionesAppRv: pg.Client[] = [];

function puertoAleatorioEnRango(): number {
  return 49000 + Math.floor(Math.random() * 5000);
}

async function nuevaConexionAppRv(): Promise<pg.Client> {
  const cliente = new pg.Client({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_facturacion_onboarding_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  await cliente.connect();
  conexionesAppRv.push(cliente);
  return cliente;
}

async function comoUsuario(usuarioId: string, tenantId: string | null, rol: string): Promise<pg.Client> {
  const cliente = await nuevaConexionAppRv();
  await cliente.query("SELECT set_config('app.user_id', $1, false)", [usuarioId]);
  await cliente.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId ?? ""]);
  await cliente.query("SELECT set_config('app.rol', $1, false)", [rol]);
  await cliente.query("SELECT set_config('app.colaborador_nivel', $1, false)", [""]);
  return cliente;
}

async function conexionAnonima(): Promise<pg.Client> {
  const cliente = await nuevaConexionAppRv();
  await cliente.query(
    "SELECT set_config('app.user_id', '', false), set_config('app.tenant_id', '', false), set_config('app.rol', '', false), set_config('app.colaborador_nivel', '', false)",
  );
  return cliente;
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-facturacion-onboarding-test-"));
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
  await servidor.createDatabase("atiende_rv_facturacion_onboarding_test");

  superusuario = servidor.getPgClient("atiende_rv_facturacion_onboarding_test");
  await superusuario.connect();
  await superusuario.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

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
}, 120_000);

afterAll(async () => {
  await Promise.all(conexionesAppRv.map((c) => c.end().catch(() => undefined)));
  await superusuario?.end().catch(() => undefined);
  await servidor?.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("plan_facturacion — catálogo sembrado y público (RV16)", () => {
  it("sembró los 3 planes por defecto, todos etiquetados como borrador comercial", async () => {
    const { rows } = await superusuario.query<{ codigo: string; etiqueta_precio: string }>(
      "SELECT codigo, etiqueta_precio FROM plan_facturacion ORDER BY codigo",
    );
    expect(rows.map((r) => r.codigo)).toEqual(["esencial", "portafolio", "profesional"]);
    expect(rows.every((r) => r.etiqueta_precio === "borrador_comercial")).toBe(true);
  });

  it("una conexión SIN sesión (anónima) puede leer el catálogo — página pública de precios", async () => {
    const anonima = await conexionAnonima();
    const { rows } = await anonima.query("SELECT codigo FROM plan_facturacion");
    expect(rows.length).toBe(3);
  });

  it("facturacion_actualizar_plan rechaza una sesión sin identidad resuelta (fail-closed, ni anónima ni un usuario_id inventado)", async () => {
    // usuario_id que NO existe en `usuario` -- rol_actual() es NULL para
    // esta sesión (mismo caso "fail-closed" que una sesión anónima real).
    const admin = await comoUsuario("00000000-0000-0000-0000-000000000001", null, "admin_gestora");
    await expect(
      admin.query(
        "SELECT facturacion_actualizar_plan('esencial','Esencial','x','[]'::jsonb,'[]'::jsonb,NULL,NULL,NULL,14,true,NULL)",
      ),
    ).rejects.toThrow(/Superadmin/);
  });

  it("facturacion_actualizar_plan rechaza a un admin_gestora real (no solo a una sesión sin identidad)", async () => {
    const { rows: t } = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-Plan-Reject') RETURNING id");
    const { rows: u } = await superusuario.query<{ id: string }>(
      `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'admin.reject@test.local', 'admin_gestora', 'x') RETURNING id`,
      [t[0]!.id],
    );
    const admin = await comoUsuario(u[0]!.id, t[0]!.id, "admin_gestora");
    await expect(
      admin.query(
        "SELECT facturacion_actualizar_plan('esencial','Esencial','x','[]'::jsonb,'[]'::jsonb,NULL,NULL,NULL,14,true,NULL)",
      ),
    ).rejects.toThrow(/Superadmin/);
  });

  it("facturacion_actualizar_plan SÍ permite a un superadmin real cambiar un precio del catálogo", async () => {
    const { rows: s } = await superusuario.query<{ id: string }>(
      `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES (NULL, 'super@test.local', 'superadmin', 'x') RETURNING id`,
    );
    const superadmin = await comoUsuario(s[0]!.id, null, "superadmin");
    await superadmin.query(
      "SELECT facturacion_actualizar_plan('esencial','Esencial','Descripción actualizada','[{\"hastaUnidades\":null,\"precioCentavosPorUnidad\":9999}]'::jsonb,'[]'::jsonb,NULL,NULL,NULL,14,true,NULL)",
    );
    const { rows } = await superusuario.query<{ descripcion: string }>(
      "SELECT descripcion FROM plan_facturacion WHERE codigo = 'esencial'",
    );
    expect(rows[0]!.descripcion).toBe("Descripción actualizada");
  });
});

describe("onboarding self-serve — tenant + admin + suscripción de prueba, sin sesión previa", () => {
  it("crea tenant, empresa_gestora, usuario admin_gestora y suscripcion_tenant en 'prueba' — con RLS correcta al leer después", async () => {
    const anonima = await conexionAnonima();

    const { rows: filaTenant } = await anonima.query<{ id: string }>(
      "SELECT onboarding_registrar_empresa('Rentas del Caribe', 'Rentas del Caribe S.A. de C.V.') AS id",
    );
    const tenantId = filaTenant[0]!.id;
    expect(tenantId).toMatch(/^[0-9a-f-]{36}$/);

    const { rows: filaUsuario } = await anonima.query<{ id: string }>(
      "SELECT autenticar_registrar_usuario($1, 'admin@rentascaribe.example', 'hash-de-prueba', 'admin_gestora', NULL, NULL, false) AS id",
      [tenantId],
    );
    const adminId = filaUsuario[0]!.id;

    await anonima.query("SELECT onboarding_crear_suscripcion_prueba($1, 'esencial')", [tenantId]);

    // Verificación cruzada con el superusuario (sin RLS, ve todo).
    const { rows: filaSuscripcion } = await superusuario.query<{ estado: string; plan_codigo: string }>(
      "SELECT estado, plan_codigo FROM suscripcion_tenant WHERE tenant_id = $1",
      [tenantId],
    );
    expect(filaSuscripcion[0]).toEqual({ estado: "prueba", plan_codigo: "esencial" });

    // El propio admin de ESE tenant SÍ puede leer su suscripción...
    const comoAdminDelTenant = await comoUsuario(adminId, tenantId, "admin_gestora");
    const { rows: vistaPorAdmin } = await comoAdminDelTenant.query("SELECT estado FROM suscripcion_tenant WHERE tenant_id = $1", [
      tenantId,
    ]);
    expect(vistaPorAdmin).toHaveLength(1);

    // ...pero un admin_gestora de OTRO tenant NUNCA la ve (aislamiento
    // multitenant, D-020) — ni siquiera pidiéndola por su tenant_id real.
    const { rows: filaOtroTenant } = await anonima.query<{ id: string }>(
      "SELECT onboarding_registrar_empresa('Otra Gestora', 'Otra Gestora S.A.') AS id",
    );
    const otroTenantId = filaOtroTenant[0]!.id;
    const { rows: filaOtroAdmin } = await anonima.query<{ id: string }>(
      "SELECT autenticar_registrar_usuario($1, 'admin@otra.example', 'hash', 'admin_gestora', NULL, NULL, false) AS id",
      [otroTenantId],
    );
    const comoAdminDeOtroTenant = await comoUsuario(filaOtroAdmin[0]!.id, otroTenantId, "admin_gestora");
    const { rows: vistaCruzada } = await comoAdminDeOtroTenant.query(
      "SELECT estado FROM suscripcion_tenant WHERE tenant_id = $1",
      [tenantId],
    );
    expect(vistaCruzada).toHaveLength(0);
  });

  it("onboarding_crear_suscripcion_prueba rechaza un plan inexistente o inactivo", async () => {
    const anonima = await conexionAnonima();
    const { rows } = await anonima.query<{ id: string }>(
      "SELECT onboarding_registrar_empresa('Empresa Plan Invalido', 'Empresa Plan Invalido S.A.') AS id",
    );
    await expect(
      anonima.query("SELECT onboarding_crear_suscripcion_prueba($1, 'no-existe')", [rows[0]!.id]),
    ).rejects.toThrow(/no existe o no está activo/);
  });
});

describe("medicion_uso_actual — unidades activas/cuentas de canal en vivo, mensajes IA acumulados", () => {
  it("refleja el conteo real de unidad/cuenta_canal y el contador acumulado de mensajes IA", async () => {
    const anonima = await conexionAnonima();
    const { rows: t } = await anonima.query<{ id: string }>(
      "SELECT onboarding_registrar_empresa('Medicion Uso Co', 'Medicion Uso Co S.A.') AS id",
    );
    const tenantId = t[0]!.id;

    await superusuario.query("INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'P1', 'America/Cancun')", [
      tenantId,
    ]);
    const { rows: prop } = await superusuario.query<{ id: string }>(
      "SELECT id FROM propiedad WHERE tenant_id = $1",
      [tenantId],
    );
    await superusuario.query("INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'U1'), ($1, 'U2')", [prop[0]!.id]);

    await anonima.query("SELECT medicion_incrementar_mensaje_ia($1, '2026-09', 3)", [tenantId]);
    await anonima.query("SELECT medicion_incrementar_mensaje_ia($1, '2026-09', 2)", [tenantId]);

    const { rows } = await superusuario.query<{ unidades_activas: number; mensajes_ia_mes: number; cuentas_canal: number }>(
      "SELECT * FROM medicion_uso_actual($1, '2026-09')",
      [tenantId],
    );
    expect(rows[0]).toEqual({ unidades_activas: 2, mensajes_ia_mes: 5, cuentas_canal: 0 });
  });
});

describe("facturacion_registrar_pago — idempotencia del webhook (D-009: nunca reaplicar un evento ya visto)", () => {
  it("la primera vez activa la suscripción; un reintento con el MISMO evento_id no vuelve a aplicar el efecto", async () => {
    const anonima = await conexionAnonima();
    const { rows: t } = await anonima.query<{ id: string }>(
      "SELECT onboarding_registrar_empresa('Webhook Co', 'Webhook Co S.A.') AS id",
    );
    const tenantId = t[0]!.id;
    await anonima.query("SELECT onboarding_crear_suscripcion_prueba($1, 'esencial')", [tenantId]);

    const primerResultado = await superusuario.query<{ facturacion_registrar_pago: boolean }>(
      "SELECT facturacion_registrar_pago($1, 'stripe', 'evt_test_123', 'cus_x', 'sub_x', 'activa') AS facturacion_registrar_pago",
      [tenantId],
    );
    expect(primerResultado.rows[0]!.facturacion_registrar_pago).toBe(true);

    const { rows: trasPrimero } = await superusuario.query<{ estado: string }>(
      "SELECT estado FROM suscripcion_tenant WHERE tenant_id = $1",
      [tenantId],
    );
    expect(trasPrimero[0]!.estado).toBe("activa");

    // Reintento del MISMO evento (Stripe reintenta si no recibió 2xx a
    // tiempo) — no debe fallar, pero tampoco debe "reaplicar" nada.
    await superusuario.query("UPDATE suscripcion_tenant SET estado = 'cancelada' WHERE tenant_id = $1", [tenantId]);
    const segundoResultado = await superusuario.query<{ facturacion_registrar_pago: boolean }>(
      "SELECT facturacion_registrar_pago($1, 'stripe', 'evt_test_123', 'cus_x', 'sub_x', 'activa') AS facturacion_registrar_pago",
      [tenantId],
    );
    expect(segundoResultado.rows[0]!.facturacion_registrar_pago).toBe(false);
    const { rows: trasSegundo } = await superusuario.query<{ estado: string }>(
      "SELECT estado FROM suscripcion_tenant WHERE tenant_id = $1",
      [tenantId],
    );
    // Sigue 'cancelada' (el UPDATE manual de arriba) — el evento ya
    // procesado NO reactivó la suscripción de vuelta a 'activa'.
    expect(trasSegundo[0]!.estado).toBe("cancelada");
  });

  it("rechaza un estado fuera del enum permitido", async () => {
    const anonima = await conexionAnonima();
    const { rows: t } = await anonima.query<{ id: string }>(
      "SELECT onboarding_registrar_empresa('Webhook Co 2', 'Webhook Co 2 S.A.') AS id",
    );
    await anonima.query("SELECT onboarding_crear_suscripcion_prueba($1, 'esencial')", [t[0]!.id]);
    await expect(
      superusuario.query("SELECT facturacion_registrar_pago($1, 'stripe', 'evt_x', NULL, NULL, 'estado-invalido')", [
        t[0]!.id,
      ]),
    ).rejects.toThrow(/estado de suscripción inválido/);
  });
});

import type pg from "pg";
import { hashContrasena } from "../../src/seguridad/contrasenas.js";
import type { ColaboradorNivel, RolUsuario } from "../../src/contrato/tipos.js";

/**
 * Helper compartido de fixtures de integración (Auditoría 2, corrección
 * Q-02/`docs/auditoria-2/calidad-codigo.md`): antes de esta corrección los
 * 7 archivos de `apps/api/test/integration/` reimplementaban a mano, con
 * SQL crudo casi idéntico, los mismos ~29 bloques `INSERT INTO
 * tenant/propiedad/unidad/usuario` — a diferencia de
 * `packages/domain/test/soporte/fixtureEsquema.ts` y
 * `packages/db/test/integration/{concurrencia,capaAplicacion}.test.ts`,
 * que sí extrajeron un helper (`crearUnidad()`/`crearFixtureEsquema()`).
 *
 * Deliberadamente NO se toca el bootstrap de `embedded-postgres` (puerto,
 * `databaseDir`, `aplicarMigraciones`) — cada archivo lo conserva tal cual
 * (rangos de puerto propios para poder correr en paralelo sin choque,
 * nombre de base de datos propio) porque ese bootstrap no es el problema
 * que señaló Q-02 (duplicación de LÓGICA DE NEGOCIO de fixtures, no de
 * infraestructura de arranque). Este módulo cubre solo las 4 entidades
 * citadas por el hallazgo: tenant, propiedad, unidad, usuario por rol.
 *
 * Cada función recibe el `pg.Client` de superusuario ya conectado (mismo
 * patrón `superusuario.query(...)` que todos los archivos ya usan) y
 * devuelve el/los id(s) generados — nunca cambia la forma de los datos
 * insertados, solo evita repetir el SQL.
 */

type ClienteFixture = Pick<pg.Client, "query">;

export async function crearTenant(db: ClienteFixture, nombre: string): Promise<string> {
  const r = await db.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ($1) RETURNING id", [nombre]);
  return r.rows[0]!.id;
}

export async function crearEmpresaGestora(db: ClienteFixture, tenantId: string, razonSocial: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    "INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, $2) RETURNING id",
    [tenantId, razonSocial],
  );
  return r.rows[0]!.id;
}

export async function crearOwner(db: ClienteFixture, empresaGestoraId: string, nombre: string): Promise<string> {
  const r = await db.query<{ id: string }>("INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, $2) RETURNING id", [
    empresaGestoraId,
    nombre,
  ]);
  return r.rows[0]!.id;
}

export interface OpcionesPropiedad {
  nombre?: string;
  zonaHoraria?: string;
  moneda?: string;
}

export async function crearPropiedad(db: ClienteFixture, tenantId: string, opciones: OpcionesPropiedad = {}): Promise<string> {
  const { nombre = "Propiedad de prueba", zonaHoraria = "America/Cancun", moneda } = opciones;
  const r = moneda
    ? await db.query<{ id: string }>(
        "INSERT INTO propiedad (tenant_id, nombre, zona_horaria, moneda) VALUES ($1, $2, $3, $4) RETURNING id",
        [tenantId, nombre, zonaHoraria, moneda],
      )
    : await db.query<{ id: string }>(
        "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, $2, $3) RETURNING id",
        [tenantId, nombre, zonaHoraria],
      );
  return r.rows[0]!.id;
}

export interface OpcionesUnidad {
  nombre?: string;
  ownerId?: string;
  duracionMinimaNoches?: number;
}

export async function crearUnidad(db: ClienteFixture, propiedadId: string, opciones: OpcionesUnidad = {}): Promise<string> {
  const { nombre = "Unidad de prueba", ownerId, duracionMinimaNoches } = opciones;
  const columnas = ["propiedad_id", "nombre"];
  const valores: unknown[] = [propiedadId, nombre];
  if (ownerId !== undefined) {
    columnas.push("owner_id");
    valores.push(ownerId);
  }
  if (duracionMinimaNoches !== undefined) {
    columnas.push("duracion_minima_noches");
    valores.push(duracionMinimaNoches);
  }
  const marcadores = valores.map((_, i) => `$${i + 1}`).join(", ");
  const r = await db.query<{ id: string }>(
    `INSERT INTO unidad (${columnas.join(", ")}) VALUES (${marcadores}) RETURNING id`,
    valores,
  );
  return r.rows[0]!.id;
}

export interface OpcionesUsuario {
  tenantId: string | null;
  email: string;
  rol: RolUsuario;
  password: string;
  ownerId?: string;
  colaboradorNivel?: ColaboradorNivel;
}

/** Hashea la contraseña e inserta el usuario — devuelve el id generado
 * (siempre con `RETURNING id`, aunque no todos los llamadores lo usen). */
export async function crearUsuario(db: ClienteFixture, opciones: OpcionesUsuario): Promise<string> {
  const { tenantId, email, rol, password, ownerId, colaboradorNivel } = opciones;
  const columnas = ["tenant_id", "email", "rol"];
  const valores: unknown[] = [tenantId, email, rol];
  if (ownerId !== undefined) {
    columnas.push("owner_id");
    valores.push(ownerId);
  }
  if (colaboradorNivel !== undefined) {
    columnas.push("colaborador_nivel");
    valores.push(colaboradorNivel);
  }
  columnas.push("password_hash");
  valores.push(await hashContrasena(password));
  const marcadores = valores.map((_, i) => `$${i + 1}`).join(", ");
  const r = await db.query<{ id: string }>(
    `INSERT INTO usuario (${columnas.join(", ")}) VALUES (${marcadores}) RETURNING id`,
    valores,
  );
  return r.rows[0]!.id;
}

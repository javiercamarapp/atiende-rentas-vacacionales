import type { Migracion } from "../runner/tipos.js";

// H-011/H-012 (Lote 8, back office): el alta de cuenta_canal desde el
// panel de administración exige declarar un tipo de conexión HONESTO
// (D-017/D-019, regla de oro de docs/fase2/DEFINICION-DE-HECHO.md §1) en
// vez de solo los booleans sueltos que ya trae la tabla (es_simulador/
// partner_aprobado, Lote 2/3): iCal import/export, partner pendiente CON
// motivo explícito, o simulador (bloqueado fuera de entorno dev por la
// capa de aplicación, apps/api/src/routes/backoffice/cuentasCanal.ts).
// Columnas nuevas y nulables — cuenta_canal ya tiene filas de las
// suites de Lote 2/3/7 sin estos campos.
export const migracion0064CuentaCanalConexionHonesta: Migracion = {
  id: "0064_cuenta_canal_conexion_honesta",
  descripcion: "cuenta_canal: tipo_conexion + motivo_partner_pendiente (columnas nuevas, nulables)",
  up: `
    ALTER TABLE cuenta_canal
      ADD COLUMN tipo_conexion text CHECK (tipo_conexion IS NULL OR tipo_conexion IN ('ical', 'partner_pendiente', 'simulador')),
      ADD COLUMN motivo_partner_pendiente text;

    ALTER TABLE cuenta_canal ADD CONSTRAINT cuenta_canal_partner_pendiente_motivo CHECK (
      tipo_conexion IS DISTINCT FROM 'partner_pendiente' OR btrim(COALESCE(motivo_partner_pendiente, '')) <> ''
    );
  `,
  down: `
    ALTER TABLE cuenta_canal DROP CONSTRAINT IF EXISTS cuenta_canal_partner_pendiente_motivo;
    ALTER TABLE cuenta_canal
      DROP COLUMN IF EXISTS motivo_partner_pendiente,
      DROP COLUMN IF EXISTS tipo_conexion;
  `,
};

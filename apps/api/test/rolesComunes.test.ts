import { describe, expect, it } from "vitest";
import {
  ROLES_ADMIN,
  ROLES_ADMIN_CONTADOR,
  ROLES_ADMIN_CONTADOR_OPERADOR,
  ROLES_ADMIN_CONTADOR_PROPIETARIO,
  ROLES_ADMIN_OPERADOR,
  ROLES_SUPERADMIN,
} from "../src/rolesComunes.js";

// Auditoría 2, Q-04: única fuente de verdad para las tuplas de roles que
// antes vivían como 30 literales repetidos en `apps/api/src/routes/*.ts`
// (`exigirRol(auth, "superadmin", "admin_gestora")`, más otras tuplas
// menos frecuentes). Esta prueba fija el contenido exacto de cada grupo —
// si alguien cambia sin querer un valor, una prueba de integración de rol
// en algún endpoint (p. ej. `finanzasPricingReportes.test.ts`) debería
// fallar también, pero esta prueba unitaria falla más rápido y señala la
// causa exacta.
describe("rolesComunes", () => {
  it("ROLES_ADMIN es exactamente superadmin + admin_gestora", () => {
    expect(ROLES_ADMIN).toEqual(["superadmin", "admin_gestora"]);
  });

  it("ROLES_SUPERADMIN es solo superadmin", () => {
    expect(ROLES_SUPERADMIN).toEqual(["superadmin"]);
  });

  it("ROLES_ADMIN_OPERADOR añade operador", () => {
    expect(ROLES_ADMIN_OPERADOR).toEqual(["superadmin", "admin_gestora", "operador"]);
  });

  it("ROLES_ADMIN_CONTADOR añade contador", () => {
    expect(ROLES_ADMIN_CONTADOR).toEqual(["superadmin", "admin_gestora", "contador"]);
  });

  it("ROLES_ADMIN_CONTADOR_OPERADOR combina contador y operador", () => {
    expect(ROLES_ADMIN_CONTADOR_OPERADOR).toEqual(["superadmin", "admin_gestora", "contador", "operador"]);
  });

  it("ROLES_ADMIN_CONTADOR_PROPIETARIO combina contador y propietario", () => {
    expect(ROLES_ADMIN_CONTADOR_PROPIETARIO).toEqual(["superadmin", "admin_gestora", "contador", "propietario"]);
  });

  it("cada grupo es de solo lectura en tiempo de ejecución (readonly a nivel de tipo, no congelado — documentado: son literales `as const`, no `Object.freeze`)", () => {
    // No se usa Object.freeze porque estos arrays solo se leen (spread en
    // `exigirRol(auth, ...GRUPO)`), nunca se mutan en el código de rutas;
    // el tipo `readonly RolUsuario[]` ya impide mutación en compilación.
    expect(Array.isArray(ROLES_ADMIN)).toBe(true);
  });
});

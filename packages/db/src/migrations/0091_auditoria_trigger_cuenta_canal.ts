import type { Migracion } from "../runner/tipos.js";

// Continuación de 0013_auditoria_triggers.ts (que no pudo crear este
// trigger porque `cuenta_canal` todavía no existía en ese punto del
// catálogo — ver nota de numeración en 0090_cuenta_canal_cifrado.ts).
// Reutiliza `fn_auditoria_directa()` (definida en 0013), que ya excluye
// por nombre `credenciales_cifradas`/`credenciales_iv`/`credenciales_tag`
// del JSON auditado.
export const migracion0091AuditoriaTriggerCuentaCanal: Migracion = {
  id: "0091_auditoria_trigger_cuenta_canal",
  descripcion: "trigger de auditoría sobre cuenta_canal",
  up: `
    CREATE TRIGGER auditoria_cuenta_canal
      AFTER INSERT OR UPDATE OR DELETE ON cuenta_canal
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_directa();
  `,
  down: `
    DROP TRIGGER IF EXISTS auditoria_cuenta_canal ON cuenta_canal;
  `,
};

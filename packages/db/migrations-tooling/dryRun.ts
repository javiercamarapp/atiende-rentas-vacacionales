import { aplicarMigraciones, revertirTodas } from "../src/runner/migrar.js";
import { crearMotorPglite } from "../src/runner/motorPglite.js";
import type { Migracion } from "../src/runner/tipos.js";

/**
 * Dry-run del catálogo completo (Lote 10, H-088): aplica todas las
 * migraciones contra un motor PGlite efímero en memoria (nunca contra un
 * entorno real) y las revierte todas, sin dejar rastro. Sirve para
 * detectar migraciones que fallan al aplicarse O al revertirse ANTES de
 * mergear, sin necesitar `embedded-postgres` (rápido, apto para CI en
 * cada PR — D-022 ya establece que PGlite basta para validar lógica/orden,
 * no concurrencia real).
 */
export interface ReporteDryRun {
  aplicadas: string[];
  revertidas: string[];
  ok: boolean;
  error?: string;
}

export async function ejecutarDryRun(catalogo: Migracion[]): Promise<ReporteDryRun> {
  const motor = await crearMotorPglite();
  try {
    const aplicadas = await aplicarMigraciones(motor.ejecutor, catalogo);
    const revertidas = await revertirTodas(motor.ejecutor, catalogo);
    const mismosIds = aplicadas.length === revertidas.length && aplicadas.every((id, i) => id === revertidas[revertidas.length - 1 - i]);
    return { aplicadas, revertidas, ok: mismosIds };
  } catch (error) {
    return { aplicadas: [], revertidas: [], ok: false, error: (error as Error).message };
  } finally {
    await motor.cerrar();
  }
}

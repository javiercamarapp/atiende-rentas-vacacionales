import { aplicarMigraciones, crearMotorEmbeddedPostgres, migraciones, type MotorEmbeddedPostgres } from "@atiende-rv/db";
import type { EjecutorTransaccional } from "@atiende-rv/domain";

/** Entorno compartido de la suite adversarial de sincronización: un único
 * cluster `embedded-postgres` real (D-009/D-022) para todo el archivo, con
 * una unidad nueva por caso de prueba para aislar entre sí. */
export async function crearEntornoAdversarial(nombreBaseDeDatos: string) {
  const motor = await crearMotorEmbeddedPostgres(nombreBaseDeDatos);
  await aplicarMigraciones(motor.ejecutor, migraciones);

  const tenant = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant adversarial sync') RETURNING id`,
  );
  const tenantId = tenant.rows[0]!.id;

  const canales = await motor.ejecutor.query<{ id: string; codigo: string }>(`SELECT id, codigo FROM canal`);
  const canalIdPorCodigo = new Map(canales.rows.map((c) => [c.codigo, c.id]));

  async function crearUnidad(nombre: string, zonaHoraria = "America/Mexico_City"): Promise<string> {
    const propiedad = await motor.ejecutor.query<{ id: string }>(
      `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, $2, $3) RETURNING id`,
      [tenantId, `Propiedad ${nombre}`, zonaHoraria],
    );
    const unidad = await motor.ejecutor.query<{ id: string }>(
      `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, $2) RETURNING id`,
      [propiedad.rows[0]!.id, nombre],
    );
    return unidad.rows[0]!.id;
  }

  return {
    motor,
    tenantId,
    canalIdPorCodigo,
    crearUnidad,
    ejecutor: () => motor.ejecutor as unknown as EjecutorTransaccional,
    cerrar: () => motor.cerrar(),
  };
}

export type EntornoAdversarial = Awaited<ReturnType<typeof crearEntornoAdversarial>>;
export type { MotorEmbeddedPostgres };

export interface DatosVEvent {
  uid: string;
  sequence?: number | null;
  dtstamp: string; // AAAAMMDDTHHMMSSZ
  dtstart: string; // AAAAMMDD
  dtend: string; // AAAAMMDD
  status?: "TENTATIVE" | "CONFIRMED" | "CANCELLED";
}

/** Construye un `.ics` mínimo con uno o más VEVENT, para fijar
 * deterministamente UID/SEQUENCE/DTSTAMP en cada caso adversarial (no
 * depende del exportador propio, para poder simular eventos "de otro
 * canal" con cualquier combinación de campos). */
export function feedIcsDePrueba(eventos: readonly DatosVEvent[]): string {
  const vevents = eventos
    .map(
      (e) =>
        `BEGIN:VEVENT\r\nUID:${e.uid}\r\nDTSTAMP:${e.dtstamp}\r\n` +
        `DTSTART;VALUE=DATE:${e.dtstart}\r\nDTEND;VALUE=DATE:${e.dtend}\r\n` +
        (e.sequence != null ? `SEQUENCE:${e.sequence}\r\n` : "") +
        (e.status ? `STATUS:${e.status}\r\n` : "") +
        `END:VEVENT\r\n`,
    )
    .join("");
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n${vevents}END:VCALENDAR\r\n`;
}

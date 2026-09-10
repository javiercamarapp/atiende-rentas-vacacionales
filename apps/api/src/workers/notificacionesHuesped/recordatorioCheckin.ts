import type { InterfazCorreo } from "../../seguridad/correo.js";
import { correoRecordatorioCheckinHuesped, pareceCorreo } from "../../seguridad/correoHuesped.js";

/**
 * Orquestación pura del recordatorio de check-in al huésped — sin HTTP,
 * sin `pg` real, testeable con un `ejecutor`/`correo` inyectados (mismo
 * estilo que `ejecutarCronSyncIcal` de `rutas/internas/cronSync.ts` y
 * `procesarReintentosWebhookPendientes` de `workers/notificaciones/
 * webhookReintento.ts`). El disparador HTTP real vive en
 * `rutas/internas/cronRecordatorioCheckin.ts`.
 *
 * "X horas antes" (como pide el encargo) no es representable con el
 * esquema actual: `ocupacion_unidad.rango` es un `daterange` (solo fecha,
 * D-002) — no hay hora de check-in en ningún lado del dominio. Este
 * worker trabaja en DÍAS de anticipación (`diasAntes`, default 1) sobre
 * esa misma granularidad, en vez de inventar una hora que el esquema no
 * tiene.
 *
 * Envía dentro de una VENTANA (`[0, diasAntes]` días antes del check-in),
 * no en una fecha exacta: si el cron no corre un día (ventana de
 * mantenimiento, error transitorio), la siguiente corrida todavía
 * encuentra la reserva pendiente en vez de perder el recordatorio para
 * siempre — la columna `recordatorio_checkin_correo_enviado_en`
 * (0132_recordatorio_checkin_huesped.ts) garantiza que se envíe UNA sola
 * vez sin importar cuántas corridas caigan dentro de la ventana.
 */
export interface EjecutorRecordatorioCheckin {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface FilaReservaProximoCheckin {
  ocupacion_id: string;
  nombre_unidad: string;
  nombre_propiedad: string;
  check_in: string;
  huesped_nombre: string | null;
  huesped_contacto: string | null;
}

export interface OpcionesRecordatorioCheckin {
  ejecutor: EjecutorRecordatorioCheckin;
  correo: InterfazCorreo;
  urlPublicaWeb: string;
  /** Días de anticipación de la ventana de envío — ver comentario de
   * cabecera. Default `DIAS_ANTES_DEFECTO`. */
  diasAntes?: number;
  /** Tope de filas procesadas por corrida (protege el `maxDuration` de la
   * función serverless, mismo criterio que `PRESUPUESTO_MS_DEFECTO` de
   * `cronSync.ts` pero como límite de filas: aquí no hay fetch de red por
   * fila, solo una consulta SQL + un `correo.enviar`). */
  limite?: number;
  /** Reloj inyectable para pruebas deterministas (solo afecta el texto
   * "en N días"/"mañana"/"hoy" del correo — el filtro de la ventana en sí
   * lo decide `CURRENT_DATE` de Postgres en la consulta). */
  ahora?: () => Date;
}

export interface ResultadoRecordatorioCheckin {
  candidatos: number;
  enviados: number;
  omitidosSinCorreo: number;
  errores: number;
}

export const DIAS_ANTES_DEFECTO = 1;
const LIMITE_DEFECTO = 200;

const SQL_CANDIDATOS = `
  SELECT o.id AS ocupacion_id,
         u.nombre AS nombre_unidad,
         p.nombre AS nombre_propiedad,
         lower(o.rango)::text AS check_in,
         h.nombre AS huesped_nombre,
         h.contacto AS huesped_contacto
  FROM ocupacion_unidad o
  JOIN unidad u ON u.id = o.unidad_id
  JOIN propiedad p ON p.id = u.propiedad_id
  LEFT JOIN huesped_minimo h ON h.id = o.huesped_minimo_id
  WHERE o.capa = 'reserva' AND o.estado = 'confirmado' AND o.bloqueante
    AND o.recordatorio_checkin_correo_enviado_en IS NULL
    AND lower(o.rango) - CURRENT_DATE BETWEEN 0 AND $1
  ORDER BY lower(o.rango) ASC
  LIMIT $2
`;

function diasHasta(checkIn: string, ahora: () => Date): number {
  const hoy = ahora();
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const partes = checkIn.split("-").map(Number);
  const checkInUtc = Date.UTC(partes[0] ?? 1970, (partes[1] ?? 1) - 1, partes[2] ?? 1);
  return Math.max(0, Math.round((checkInUtc - hoyUtc) / 86_400_000));
}

export async function ejecutarRecordatorioCheckin(
  opciones: OpcionesRecordatorioCheckin,
): Promise<ResultadoRecordatorioCheckin> {
  const diasAntes = opciones.diasAntes ?? DIAS_ANTES_DEFECTO;
  const limite = opciones.limite ?? LIMITE_DEFECTO;
  const ahora = opciones.ahora ?? (() => new Date());
  const { ejecutor, correo, urlPublicaWeb } = opciones;

  const { rows } = await ejecutor.query<FilaReservaProximoCheckin>(SQL_CANDIDATOS, [diasAntes, limite]);

  let enviados = 0;
  let omitidosSinCorreo = 0;
  let errores = 0;

  for (const fila of rows) {
    // Igual que `enviarConfirmacionReservaHuesped` (routes/reservas.ts):
    // `huesped_minimo.contacto` es texto libre sin tipo (D-014) — solo se
    // intenta el envío cuando PARECE un correo. Sin marcar la fila como
    // "enviada": sigue cayendo en la ventana de días restantes (acotada),
    // nunca crece sin límite.
    if (!pareceCorreo(fila.huesped_contacto)) {
      omitidosSinCorreo++;
      continue;
    }
    try {
      const { asunto, textoPlano, html } = correoRecordatorioCheckinHuesped(
        {
          nombreHuesped: fila.huesped_nombre,
          nombreUnidad: fila.nombre_unidad,
          nombrePropiedad: fila.nombre_propiedad,
          checkIn: fila.check_in,
          diasAntes: diasHasta(fila.check_in, ahora),
        },
        urlPublicaWeb,
      );
      await correo.enviar({ para: fila.huesped_contacto, asunto, textoPlano, html });
      // Marca de envío ÚNICO — después de un envío exitoso, nunca antes
      // (un `correo.enviar` que lanza no debe dejar la fila marcada como
      // enviada sin haberlo hecho).
      await ejecutor.query(
        "UPDATE ocupacion_unidad SET recordatorio_checkin_correo_enviado_en = now() WHERE id = $1",
        [fila.ocupacion_id],
      );
      enviados++;
    } catch (error) {
      // Un fallo en UNA reserva nunca aborta el resto del lote (mismo
      // criterio que `ejecutarCronSyncIcal` por canal) — la fila sigue sin
      // marcar, así que la próxima corrida la vuelve a intentar mientras
      // siga dentro de la ventana.
      errores++;
      console.error(
        JSON.stringify({
          evento: "correo_recordatorio_checkin_fallo",
          ocupacionId: fila.ocupacion_id,
          mensaje: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return { candidatos: rows.length, enviados, omitidosSinCorreo, errores };
}

/**
 * REQ-095 (SHOULD, RV02-R-06, ACEPTACION §Checkin-1): "el motor de
 * calendario genera el evento de liberación de instrucciones de acceso
 * anclado a T-48h antes del check-in, sin depender de marca de cerradura
 * específica".
 *
 * Orquestación pura — sin `pg` real, testeable con un `ejecutor` inyectado
 * (mismo estilo que `recordatorioCheckin.ts`, que es el worker hermano más
 * cercano: ambos escanean `ocupacion_unidad` por check-in próximo y marcan
 * una columna de "ya se generó" para no repetir). El disparador HTTP real
 * vive en `rutas/internas/cronLiberacionInstruccionesAcceso.ts`.
 *
 * Diferencia deliberada con `recordatorioCheckin.ts` (que trabaja en DÍAS
 * porque solo le importa el TEXTO del correo, "mañana"/"en 2 días"): este
 * worker sí necesita una frontera de 48 HORAS de verdad, porque "T-48h" es
 * el enunciado exacto del requisito, no una aproximación de UX. El esquema
 * (`ocupacion_unidad.rango` es un `daterange`, D-002) no guarda hora de
 * check-in — así que "T-48h antes del check-in" se aproxima como "48 horas
 * antes del día de check-in a una HORA DE CORTE configurable
 * (`horaCorte`)", evaluada en la zona horaria REAL de la propiedad
 * (`propiedad.zona_horaria`, IANA, NOT NULL — D-013) en vez de UTC/hora de
 * servidor. Esto es una aproximación explícita y documentada, NUNCA una
 * precisión horaria que el dato no soporta — si en el futuro se agrega una
 * hora de check-in real por reserva/propiedad, este worker debe
 * reemplazar `horaCorte` por ese dato en vez de seguir aproximando.
 *
 * El "evento" que pide el enunciado es una fila en `outbox_evento` (mismo
 * bus de eventos de calendario que ya usan `packages/domain/src/
 * aplicacion/reservas.ts` y `packages/domain/src/limpieza/aplicacion/
 * tareas.ts`), NUNCA una llamada directa a una API de cerradura — así se
 * cumple "sin depender de marca de cerradura específica": este motor solo
 * GENERA el evento; qué sistema externo lo consume (una cerradura
 * inteligente concreta, un correo con el código de acceso, ambos) es una
 * integración futura y deliberadamente desacoplada de este módulo.
 *
 * A diferencia de `recordatorioCheckin.ts` (que necesita DOS pasos porque
 * `correo.enviar` es un efecto externo entre el INSERT y el UPDATE), este
 * worker no tiene ningún efecto externo: generar el evento ES escribir en
 * `outbox_evento`. Por eso el INSERT+UPDATE va en UNA sola sentencia SQL
 * (un CTE), atómica por fila, sin ventana en la que el evento se encole
 * pero la fila no quede marcada (o viceversa).
 *
 * `now` es un parámetro de la CONSULTA (no `CURRENT_DATE`/`now()` de
 * Postgres, a diferencia de `recordatorioCheckin.ts`): la frontera de
 * 48 horas exactas necesita ser determinista en las pruebas, y este
 * worker corre con más frecuencia (pensado para cada hora) que el de
 * recordatorio por correo, así que la resolución de la ventana importa.
 */
export interface EjecutorLiberacionInstruccionesAcceso {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface FilaEventoGenerado {
  ocupacion_id: string;
  unidad_id: string;
  nombre_unidad: string;
  nombre_propiedad: string;
  check_in: string;
  checkin_estimado: string;
}

export interface OpcionesLiberacionInstruccionesAcceso {
  ejecutor: EjecutorLiberacionInstruccionesAcceso;
  /** Hora local (0-23, en la zona horaria de CADA propiedad) que aproxima
   * "el momento del check-in" cuando el esquema no guarda una hora real
   * por reserva — ver comentario de cabecera. Default
   * `HORA_CORTE_DEFECTO`. */
  horaCorte?: number;
  /** Tope de filas procesadas por corrida (protege el `maxDuration` de la
   * función serverless, mismo criterio que `recordatorioCheckin.ts`). */
  limite?: number;
  /** Reloj inyectable — determinista en pruebas, `new Date()` en
   * producción. A diferencia de `recordatorioCheckin.ts`, este SÍ decide
   * el filtro de la ventana (ver comentario de cabecera), no solo el
   * texto de un correo. */
  ahora?: () => Date;
}

export interface ResultadoLiberacionInstruccionesAcceso {
  candidatos: number;
  eventosGenerados: number;
  errores: number;
}

/** `outbox_evento.tipo_evento` para este evento — exportado para que
 * cualquier consumidor futuro (o una prueba) pueda filtrar por él sin
 * repetir el string literal. */
export const TIPO_EVENTO_LIBERACION_INSTRUCCIONES_ACCESO = "liberar_instrucciones_acceso";

/** T-48h — el propio enunciado de REQ-095, no una opción de negocio. */
export const HORAS_ANTES_LIBERACION_ACCESO = 48;

/** Hora local por defecto (mediodía) usada para aproximar "el momento del
 * check-in" cuando no hay hora real en el esquema — ver comentario de
 * cabecera. Elegida como punto medio conservador: ni tan temprano que
 * libere instrucciones la noche anterior a un check-in normal (tarde),
 * ni tan tarde que se acerque demasiado a la hora de check-in típica del
 * sector (usualmente 15:00-16:00) reduciendo el margen real de 48h. */
export const HORA_CORTE_DEFECTO = 12;

const LIMITE_DEFECTO = 200;

// `checkin_estimado` aproxima el instante de check-in como "el día de
// check-in a las `horaCorte` en la zona horaria REAL de la propiedad" —
// `lower(o.rango)::timestamp` es un timestamp SIN zona (medianoche del día
// de check-in), sumarle `horaCorte` horas y luego interpretarlo `AT TIME
// ZONE p.zona_horaria` lo convierte a un instante absoluto (timestamptz)
// correcto para esa zona horaria (incluyendo DST donde aplique — lo
// resuelve Postgres, no aritmética manual). El filtro coarse
// `lower(o.rango) - CURRENT_DATE::date BETWEEN 0 AND 3` no puede usarse
// aquí porque `now` es un parámetro, no `CURRENT_DATE` — se acota en su
// lugar con `$3::date` (la fecha de `now`). El margen `-2/+4` (en vez de
// `0/+3`) absorbe el peor caso de desfase entre la fecha LOCAL de
// check-in y la fecha UTC de `checkin_estimado` en zonas horarias
// extremas (UTC-12 a UTC+14, IANA) sumado a la ventana de 48h — sigue
// siendo un filtro *coarse* que solo aprovecha el índice parcial de 0133;
// la precisión real la da el filtro fino con timestamptz de abajo.
const SQL_CANDIDATOS = `
  WITH candidatos AS (
    SELECT o.id AS ocupacion_id,
           o.unidad_id,
           u.nombre AS nombre_unidad,
           p.nombre AS nombre_propiedad,
           lower(o.rango)::text AS check_in,
           ((lower(o.rango)::timestamp + ($1 || ' hours')::interval) AT TIME ZONE p.zona_horaria) AS checkin_estimado
    FROM ocupacion_unidad o
    JOIN unidad u ON u.id = o.unidad_id
    JOIN propiedad p ON p.id = u.propiedad_id
    WHERE o.capa = 'reserva' AND o.estado = 'confirmado' AND o.bloqueante
      AND o.instrucciones_acceso_liberadas_en IS NULL
      AND lower(o.rango) BETWEEN ($3::date - 2) AND ($3::date + 4)
  )
  SELECT ocupacion_id, unidad_id, nombre_unidad, nombre_propiedad, check_in,
         -- Convertido explícitamente a UTC antes de castear a texto: un
         -- \`::text\` directo sobre \`timestamptz\` se formatea en la zona
         -- horaria de LA SESIÓN (variable, nunca UTC garantizado) — esto
         -- deja el payload determinista sin importar \`TimeZone\` de la
         -- conexión.
         (checkin_estimado AT TIME ZONE 'UTC')::text AS checkin_estimado
  FROM candidatos
  WHERE $4::timestamptz >= checkin_estimado - ($2 || ' hours')::interval
    AND $4::timestamptz < checkin_estimado
  ORDER BY checkin_estimado ASC
  LIMIT $5
`;

const SQL_GENERAR_EVENTO = `
  WITH nuevo_evento AS (
    INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
    VALUES ($1, '${TIPO_EVENTO_LIBERACION_INSTRUCCIONES_ACCESO}', $2::jsonb)
    RETURNING id
  )
  UPDATE ocupacion_unidad
  SET instrucciones_acceso_liberadas_en = now()
  WHERE id = $1
  RETURNING (SELECT id FROM nuevo_evento) AS evento_id
`;

export async function ejecutarLiberacionInstruccionesAcceso(
  opciones: OpcionesLiberacionInstruccionesAcceso,
): Promise<ResultadoLiberacionInstruccionesAcceso> {
  const horasAntes = HORAS_ANTES_LIBERACION_ACCESO;
  const horaCorte = opciones.horaCorte ?? HORA_CORTE_DEFECTO;
  const limite = opciones.limite ?? LIMITE_DEFECTO;
  const ahora = opciones.ahora ?? (() => new Date());
  const { ejecutor } = opciones;

  const momentoActual = ahora();
  const fechaActual = momentoActual.toISOString().slice(0, 10);

  const { rows } = await ejecutor.query<FilaEventoGenerado>(SQL_CANDIDATOS, [
    horaCorte,
    horasAntes,
    fechaActual,
    momentoActual.toISOString(),
    limite,
  ]);

  let eventosGenerados = 0;
  let errores = 0;

  for (const fila of rows) {
    try {
      // Payload SIN nada específico de marca/proveedor de cerradura
      // (H-047, mismo criterio "sin PII/sin acoplar detalle externo" que
      // `efectosOutbox.ts`): solo identificadores y el instante estimado
      // de check-in — quien consuma este evento decide cómo entregar las
      // instrucciones (código genérico, caja de seguridad, cerradura
      // inteligente de cualquier marca).
      await ejecutor.query(SQL_GENERAR_EVENTO, [
        fila.ocupacion_id,
        JSON.stringify({
          unidadId: fila.unidad_id,
          checkIn: fila.check_in,
          checkinEstimado: fila.checkin_estimado,
          horasAnticipacion: horasAntes,
        }),
      ]);
      eventosGenerados++;
    } catch (error) {
      // Un fallo en UNA reserva nunca aborta el resto del lote (mismo
      // criterio que `recordatorioCheckin.ts`/`ejecutarCronSyncIcal`) — la
      // fila sigue sin marcar, así que la próxima corrida la reintenta
      // mientras siga dentro de la ventana de 48h.
      errores++;
      console.error(
        JSON.stringify({
          evento: "liberacion_instrucciones_acceso_fallo",
          ocupacionId: fila.ocupacion_id,
          mensaje: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return { candidatos: rows.length, eventosGenerados, errores };
}

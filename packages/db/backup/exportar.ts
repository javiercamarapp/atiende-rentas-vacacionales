import type { EjecutorSql, FilaSql } from "../src/runner/ejecutorSql.js";
import { serializarValor } from "./serializacion.js";
import { VERSION_FORMATO_BACKUP, type BackupLogico, type FilaSerializada, type TablaBackup } from "./tiposBackup.js";

interface FilaTabla extends FilaSql {
  tablename: string;
}

interface FilaFk extends FilaSql {
  tabla_hija: string;
  tabla_padre: string;
}

interface FilaColumna extends FilaSql {
  column_name: string;
}

async function listarTablasBase(ejecutor: EjecutorSql): Promise<string[]> {
  const resultado = await ejecutor.query<FilaTabla>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return resultado.rows.map((f) => f.tablename);
}

async function listarDependenciasFk(ejecutor: EjecutorSql): Promise<Array<[string, string]>> {
  // tabla_hija depende de tabla_padre (tiene una FK hacia ella) — el orden
  // de inserción segura exige insertar tabla_padre antes que tabla_hija.
  const resultado = await ejecutor.query<FilaFk>(`
    SELECT DISTINCT
      hija.relname   AS tabla_hija,
      padre.relname  AS tabla_padre
    FROM pg_constraint c
    JOIN pg_class hija  ON hija.oid  = c.conrelid
    JOIN pg_class padre ON padre.oid = c.confrelid
    WHERE c.contype = 'f' AND hija.relname <> padre.relname
  `);
  return resultado.rows.map((f) => [f.tabla_hija, f.tabla_padre]);
}

/**
 * Orden topológico (Kahn) de tablas por dependencia de FK — padres antes
 * que hijos. Un ciclo de FKs (no existe en este esquema, pero por
 * robustez) se resuelve dejando las tablas restantes en su orden
 * alfabético original al final, en vez de lanzar.
 */
export function ordenTopologicoTablas(tablas: string[], dependencias: Array<[string, string]>): string[] {
  const gradoEntrada = new Map<string, number>(tablas.map((t) => [t, 0]));
  const aristas = new Map<string, string[]>(tablas.map((t) => [t, []]));

  for (const [hija, padre] of dependencias) {
    if (!gradoEntrada.has(hija) || !gradoEntrada.has(padre)) continue;
    aristas.get(padre)!.push(hija);
    gradoEntrada.set(hija, (gradoEntrada.get(hija) ?? 0) + 1);
  }

  const listos = tablas.filter((t) => gradoEntrada.get(t) === 0).sort();
  const orden: string[] = [];
  const pendientes = [...listos];

  while (pendientes.length > 0) {
    const actual = pendientes.shift()!;
    orden.push(actual);
    const hijas = [...(aristas.get(actual) ?? [])].sort();
    for (const hija of hijas) {
      const nuevoGrado = (gradoEntrada.get(hija) ?? 0) - 1;
      gradoEntrada.set(hija, nuevoGrado);
      if (nuevoGrado === 0) pendientes.push(hija);
    }
  }

  const restantes = tablas.filter((t) => !orden.includes(t)).sort();
  return [...orden, ...restantes];
}

async function columnasDeTabla(ejecutor: EjecutorSql, tabla: string): Promise<string[]> {
  const resultado = await ejecutor.query<FilaColumna>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tabla],
  );
  return resultado.rows.map((f) => f.column_name);
}

export interface OpcionesExportarBackup {
  /** Restringe el export a esta lista de tablas (para pruebas dirigidas);
   * por defecto exporta TODAS las tablas base del esquema `public`. */
  tablas?: string[];
  ahora?: () => Date;
}

/**
 * Backup lógico completo (H-086): introspecta el esquema real (sin
 * necesidad de conocerlo de antemano — funciona con cualquier catálogo de
 * migraciones aplicado), calcula el orden de restauración seguro por FK, y
 * vuelca cada fila de cada tabla en un objeto JSON-serializable.
 */
export async function exportarBackupLogico(
  ejecutor: EjecutorSql,
  opciones: OpcionesExportarBackup = {},
): Promise<BackupLogico> {
  const ahora = opciones.ahora ?? (() => new Date());
  const todasLasTablas = await listarTablasBase(ejecutor);
  const tablasAExportar = opciones.tablas
    ? todasLasTablas.filter((t) => opciones.tablas!.includes(t))
    : todasLasTablas;

  const dependencias = await listarDependenciasFk(ejecutor);
  const ordenTablas = ordenTopologicoTablas(tablasAExportar, dependencias);

  const tablas: TablaBackup[] = [];
  for (const nombre of ordenTablas) {
    const columnas = await columnasDeTabla(ejecutor, nombre);
    const resultado = await ejecutor.query<FilaSql>(`SELECT * FROM "${nombre}"`);
    const filas: FilaSerializada[] = resultado.rows.map((fila) => {
      const filaSerializada: FilaSerializada = {};
      for (const columna of columnas) {
        filaSerializada[columna] = serializarValor(fila[columna]);
      }
      return filaSerializada;
    });
    tablas.push({ nombre, columnas, filas });
  }

  return {
    version: VERSION_FORMATO_BACKUP,
    generadoEn: ahora().toISOString(),
    ordenTablas,
    tablas,
  };
}

// `GET /unidades/:id/calendario` (contrato de Lote 3) resuelve cada noche a
// capa/razón/estado/origen para pintar el calendario, pero deliberadamente
// no expone el `id` interno de `ocupacion_unidad` — ese endpoint es de
// solo lectura agregada, no un listado de filas editables. Modificar o
// cancelar una reserva/bloqueo SÍ requiere ese `id` (`PATCH /reservas/:id`,
// `POST /reservas/:id/cancelar`, `DELETE /bloqueos/:id`).
//
// Añadir el campo a `apps/api/src/routes/unidades.ts` está fuera del
// alcance de este lote (carpeta exclusiva de Lote 3, docs/fase2/LOTES.md).
// Mientras ese contrato no se extienda, esta caché guarda el `id` de todo
// lo que la propia UI crea en la sesión (la respuesta de `POST /bloqueos`
// y `POST /reservas` sí trae `id`), indexado por unidad+rango, para que
// "crear bloqueo → aparece en el timeline → seleccionarlo → cancelarlo"
// funcione de punta a punta con datos reales. Para ocupaciones
// preexistentes (semilla, u otra sesión) la UI es honesta: muestra el
// detalle pero no ofrece cancelar/modificar, con una nota explicando por
// qué (en vez de fingir un botón que fallaría).
export interface EntradaCache {
  id: string;
  tipo: "reserva" | "bloqueo";
  unidadId: string;
  inicio: string;
  fin: string;
}

const CLAVE = "atiende-rv-ocupaciones-creadas-sesion";

function leerTodo(): EntradaCache[] {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as EntradaCache[]) : [];
  } catch {
    return [];
  }
}

function guardarTodo(entradas: EntradaCache[]): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(entradas));
  } catch {
    // caché puramente de conveniencia — sin ella, la UI sigue siendo
    // honesta (solo pierde la capacidad de cancelar lo recién creado).
  }
}

export function registrarOcupacionCreada(entrada: EntradaCache): void {
  const actuales = leerTodo().filter(
    (e) => !(e.unidadId === entrada.unidadId && e.inicio === entrada.inicio && e.fin === entrada.fin),
  );
  actuales.push(entrada);
  guardarTodo(actuales);
}

export function quitarOcupacionCreada(id: string): void {
  guardarTodo(leerTodo().filter((e) => e.id !== id));
}

export function buscarOcupacionCreada(unidadId: string, fecha: string): EntradaCache | null {
  return leerTodo().find((e) => e.unidadId === unidadId && fecha >= e.inicio && fecha < e.fin) ?? null;
}

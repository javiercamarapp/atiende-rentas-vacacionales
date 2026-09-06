// Equivalente ligero a React Query (LOTES.md Lote 4, punto 5: "estado con
// React Query o equivalente ligero"). Se evita añadir la dependencia para
// no tocar el árbol de paquetes compartido en un lote que corre en
// paralelo con otros cinco — esta capa cubre exactamente lo que las
// páginas de este lote necesitan: fetch con estado de carga/error,
// revalidación manual, y mutaciones con callback de éxito.
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorApi } from "./cliente";

export interface EstadoQuery<T> {
  datos: T | undefined;
  cargando: boolean;
  error: ErrorApi | null;
  recargar: () => void;
}

/** `deps` funciona como el array de dependencias de un `useEffect`: cambiar
 * cualquiera de sus valores dispara un nuevo fetch. */
export function useQueryLigero<T>(fn: () => Promise<T>, deps: readonly unknown[]): EstadoQuery<T> {
  const [datos, setDatos] = useState<T>();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    fnRef
      .current()
      .then((res) => {
        if (vivo) setDatos(res);
      })
      .catch((err) => {
        if (vivo) setError(err instanceof ErrorApi ? err : new ErrorApi("error_interno", String(err), 0));
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  return { datos, cargando, error, recargar };
}

export interface EstadoMutacion<Args extends unknown[], T> {
  ejecutar: (...args: Args) => Promise<T>;
  enCurso: boolean;
  error: ErrorApi | null;
  limpiarError: () => void;
  /** Resultado de la última ejecución exitosa (`undefined` hasta la primera
   * vez que `ejecutar` resuelve sin error). Útil para pantallas que
   * muestran un resumen de la respuesta (p. ej. "procesados: N") sin
   * necesitar un `useState` propio en cada consumidor. */
  datos: T | undefined;
}

export function useMutacionLigera<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
): EstadoMutacion<Args, T> {
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [datos, setDatos] = useState<T>();

  const ejecutar = useCallback(
    async (...args: Args) => {
      setEnCurso(true);
      setError(null);
      try {
        const resultado = await fn(...args);
        setDatos(resultado);
        return resultado;
      } catch (err) {
        const errApi = err instanceof ErrorApi ? err : new ErrorApi("error_interno", String(err), 0);
        setError(errApi);
        throw errApi;
      } finally {
        setEnCurso(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { ejecutar, enCurso, error, datos, limpiarError: () => setError(null) };
}

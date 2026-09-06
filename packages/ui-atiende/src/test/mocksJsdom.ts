// Mock compartido de gaps de jsdom (Auditoría 2, corrección Q-03/
// `docs/auditoria-2/calidad-codigo.md`): antes vivía copiado byte a byte
// entre `packages/ui-atiende/src/test/setup.ts` y
// `apps/web/src/test/setup.ts` — el segundo archivo incluso admitía en un
// comentario ser una copia intencional del primero en vez de extraerlo.
//
// Node 25.6.1 expone un `localStorage` global propio (webstorage
// experimental) que en este toolchain pisa el de jsdom 25.0.1 dejando un
// stub roto (`setItem`/`clear` no son funciones — verificado con una
// prueba diagnóstica directa). Este módulo reemplaza `localStorage`/
// `sessionStorage` por un mock en memoria mínimo y añade `matchMedia`
// (jsdom no lo implementa — gap documentado del proyecto, no específico
// de este toolchain).
export class MemoriaStorageJsdom implements Storage {
  private datos = new Map<string, string>();

  get length() {
    return this.datos.size;
  }

  clear() {
    this.datos.clear();
  }

  getItem(key: string) {
    return this.datos.has(key) ? this.datos.get(key)! : null;
  }

  key(index: number) {
    return Array.from(this.datos.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.datos.delete(key);
  }

  setItem(key: string, value: string) {
    this.datos.set(key, String(value));
  }
}

export interface OpcionesMocksJsdom {
  /** `apps/web` también necesita `sessionStorage` mockeado (SesionProvider/
   * AdminSidebar); `packages/ui-atiende` solo ejercita `localStorage`
   * (ThemeSelector) — por defecto se instalan ambos, sin costo si el
   * consumidor no los usa. */
  incluirSessionStorage?: boolean;
}

/** Instala los 2-3 mocks de jsdom sobre el `window` dado (normalmente el
 * global del entorno de pruebas). Idempotente por llamada — cada setup de
 * workspace la invoca una sola vez. */
export function instalarMocksJsdom(ventana: typeof window = window, opciones: OpcionesMocksJsdom = {}): void {
  const { incluirSessionStorage = true } = opciones;

  Object.defineProperty(ventana, "localStorage", { value: new MemoriaStorageJsdom(), writable: true });
  if (incluirSessionStorage) {
    Object.defineProperty(ventana, "sessionStorage", { value: new MemoriaStorageJsdom(), writable: true });
  }

  Object.defineProperty(ventana, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

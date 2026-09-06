import "@testing-library/jest-dom/vitest";

// Node 25.6.1 expone un `localStorage` global propio (webstorage
// experimental) que en este toolchain pisa el de jsdom 25.0.1 dejando un
// stub roto (`setItem`/`clear` no son funciones — verificado en esta sesión
// con una prueba diagnóstica directa). Se reemplaza por un mock en memoria
// mínimo, suficiente para las pruebas de ThemeSelector; no depende de
// persistencia real de jsdom.
class MemoriaLocalStorage implements Storage {
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

Object.defineProperty(window, "localStorage", {
  value: new MemoriaLocalStorage(),
  writable: true,
});

// jsdom no implementa `window.matchMedia` (gap documentado del proyecto,
// no específico de este toolchain) — mock mínimo con la superficie que usa
// ThemeSelector (`matches`, `addEventListener`/`removeEventListener`).
Object.defineProperty(window, "matchMedia", {
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

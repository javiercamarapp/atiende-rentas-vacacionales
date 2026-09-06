import "@testing-library/jest-dom/vitest";

// Mismo gap de toolchain documentado en packages/ui-atiende/src/test/setup.ts
// (Node 25 pisa el `localStorage` de jsdom con un stub roto) — mismo mock
// mínimo en memoria, reutilizado aquí porque `SesionProvider`/`AdminSidebar`
// también dependen de `localStorage`.
class MemoriaStorage implements Storage {
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

Object.defineProperty(window, "localStorage", { value: new MemoriaStorage(), writable: true });
Object.defineProperty(window, "sessionStorage", { value: new MemoriaStorage(), writable: true });

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

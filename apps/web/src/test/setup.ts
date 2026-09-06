import "@testing-library/jest-dom/vitest";
// Auditoría 2, corrección Q-03 (calidad-codigo.md): antes este archivo
// reimplementaba byte a byte el mismo mock de packages/ui-atiende/src/
// test/setup.ts (admitido en un comentario como copia intencional) — ahora
// reusa el módulo compartido. `SesionProvider`/`AdminSidebar` necesitan
// `sessionStorage` además de `localStorage` (por eso el flag por defecto
// `incluirSessionStorage: true` de `instalarMocksJsdom`).
import { instalarMocksJsdom } from "@atiende-rv/ui-atiende/test-mocks-jsdom";

instalarMocksJsdom();

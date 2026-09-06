import { describe, expect, it } from "vitest";
import { crearApp } from "./app.js";

describe("GET /health", () => {
  it("responde 200 con estado ok y sin afirmar producción", async () => {
    const app = crearApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      entorno: string;
      aviso: string;
    };
    expect(body.status).toBe("ok");
    expect(body.entorno).not.toBe("produccion");
    expect(body.aviso).toMatch(/sin conexiones productivas/i);
  });
});

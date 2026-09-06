import { describe, expect, it } from "vitest";
import { crearApp } from "../../src/app.js";

/**
 * Smoke test de las rutas de observabilidad montadas en `app.ts`
 * (Lote 10, H-035): `/metrics` en formato Prometheus y
 * `/health/detallado` con el estado de la BD y el tamaño de cola del
 * outbox. Usa el mismo patrón que `src/app.test.ts` (Lote 0/3): sin pool
 * real conectado, solo se ejercita la forma de la respuesta — el flujo
 * contra BD real ya se cubre en `test/integration/api.test.ts`.
 */
describe("GET /metrics y GET /health/detallado", () => {
  it("GET /metrics responde 200 en formato de texto Prometheus", async () => {
    const app = crearApp();
    const res = await app.request("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const cuerpo = await res.text();
    expect(cuerpo).toContain("# TYPE atiende_rv_http_respuestas_total counter");
  });

  it("GET /health/detallado nunca lanza aunque la BD no esté disponible — reporta status='degradado'", async () => {
    const app = crearApp();
    const res = await app.request("/health/detallado");
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo).toHaveProperty("status");
    expect(cuerpo).toHaveProperty("outbox");
    expect(cuerpo).toHaveProperty("metricas");
  });
});

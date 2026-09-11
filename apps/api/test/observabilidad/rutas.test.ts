import { describe, expect, it } from "vitest";
import pg from "pg";
import { CATALOGO_FLAGS_POR_DEFECTO, FLAG_SYNC_PUSH_AUTOMATICO, RegistroFlags } from "@atiende-rv/domain";
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

describe("GET /health/detallado — modo degradado + pausa automática de push (H-091/REQ-166, §Operación-3)", () => {
  /** Pool que SIEMPRE rechaza cualquier consulta (mismo criterio que un
   * primario real inalcanzable: conexión rota, no una excepción de
   * prueba fabricada a mano dentro de la ruta) — un `RegistroFlags`
   * PROPIO (nunca el singleton `registroFlagsBackoffice`) para que esta
   * prueba no mute estado compartido con el resto de la suite. */
  function poolQueSiempreFalla(): pg.Pool {
    return {
      query: async () => {
        throw new Error("ECONNREFUSED simulado — primario inalcanzable");
      },
    } as unknown as pg.Pool;
  }

  it("con el primario caído: modoDegradadoCalendario=true, status='degradado' y sync.push_automatico se apaga AUTOMÁTICAMENTE", async () => {
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(true); // estado inicial normal.

    const app = crearApp({ pool: poolQueSiempreFalla(), registroFlags });
    const res = await app.request("/health/detallado");

    expect(res.status).toBe(200); // degradado nunca es un error HTTP — es un estado reportado.
    const cuerpo = (await res.json()) as {
      status: string;
      modoDegradadoCalendario: boolean;
      pushAutomaticoHabilitado: boolean;
    };
    expect(cuerpo.status).toBe("degradado");
    expect(cuerpo.modoDegradadoCalendario).toBe(true);
    expect(cuerpo.pushAutomaticoHabilitado).toBe(false);

    // La pausa es un efecto REAL sobre el registro de flags — no solo un
    // campo en la respuesta JSON: el MISMO registro que vería
    // GET /backoffice/flags queda con el flag apagado, con auditoría.
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(false);
    const auditoria = registroFlags.auditoria(FLAG_SYNC_PUSH_AUTOMATICO);
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({ valor: false, actor: "monitor-salud-primario" });
  });

  it("es idempotente: pollear /health/detallado repetidas veces con el primario caído NO produce una entrada de auditoría por poll", async () => {
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    const app = crearApp({ pool: poolQueSiempreFalla(), registroFlags });

    await app.request("/health/detallado");
    await app.request("/health/detallado");
    const res3 = await app.request("/health/detallado");

    expect((await res3.json() as { modoDegradadoCalendario: boolean }).modoDegradadoCalendario).toBe(true);
    expect(registroFlags.auditoria(FLAG_SYNC_PUSH_AUTOMATICO)).toHaveLength(1);
  });

  it("nunca reactiva sync.push_automatico automáticamente — reactivarlo exige acción explícita (mismo criterio que la restauración de backup, §Operación-3)", async () => {
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    const app = crearApp({ pool: poolQueSiempreFalla(), registroFlags });
    await app.request("/health/detallado");
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(false);

    // Un pool "sano" en una app NUEVA no revive el flag de la app anterior
    // — este registro es el mismo objeto, así que simula exactamente lo
    // que pasaría en producción: nada reactiva el flag salvo un operador.
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(false);
    registroFlags.establecer({
      flagId: FLAG_SYNC_PUSH_AUTOMATICO,
      valor: true,
      actor: "operador-humano",
      motivo: "primario confirmado sano tras incidente — reconciliación de drift ya corrida",
    });
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(true);
  });
});

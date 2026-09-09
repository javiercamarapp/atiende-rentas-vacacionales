import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aplicarMigraciones, crearMotorPglite, migraciones } from "@atiende-rv/db";
import type { PayloadWebhookNotificacion } from "@atiende-rv/domain/notificaciones";
import {
  BACKOFF_REINTENTO_WEBHOOK_MS,
  cargarConfigWebhookTenant,
  contarWebhookReintentoPorEstado,
  encolarReintentoWebhook,
  MAX_INTENTOS_REINTENTO_WEBHOOK_DEFECTO,
  procesarReintentosWebhookPendientes,
  type ConfigWebhookTenant,
} from "../../src/workers/notificaciones/webhookReintento.js";
import { cifrarSecretoWebhook } from "../../src/workers/notificaciones/cifradoSecreto.js";
import type { enviarWebhookFirmado } from "../../src/workers/notificaciones/webhookSaliente.js";

/**
 * A3-NOTIF-03 (docs/auditoria-3/calidad.md, BAJO, corregido): cola de
 * reintento con backoff exponencial acotado para webhooks salientes
 * fallidos. Estas pruebas cubren los tres entregables explícitos del
 * cierre del hallazgo:
 *   - un envío que falla se reintenta, con backoff CRECIENTE medible.
 *   - tras N intentos fallidos, la fila se marca 'agotado' (fallo
 *     permanente) y NUNCA vuelve a reintentarse.
 *   - un envío que se recupera a la segunda entrega no se re-envía una
 *     tercera vez (idempotencia hacia adelante — la fila se borra al
 *     entregarse).
 *
 * Estrategia para medir backoff sin depender de tiempo real transcurrido:
 * `proximo_intento_en` se fuerza al pasado con una escritura SQL directa
 * ANTES de cada llamada a `procesarReintentosWebhookPendientes` (así la
 * fila es "elegible" de inmediato); el valor que la propia función
 * calcula y persiste después SÍ es el real, producido por su aritmética
 * de backoff con el `ahoraMs` inyectado — se lee de vuelta y se compara
 * contra el escalón esperado de `BACKOFF_REINTENTO_WEBHOOK_MS`.
 */

let motor: Awaited<ReturnType<typeof crearMotorPglite>>;

async function crearTenant(): Promise<string> {
  const resultado = await motor.ejecutor.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T') RETURNING id");
  return resultado.rows[0]!.id;
}

async function encolarUnaFila(tenantId: string): Promise<string> {
  const payload: PayloadWebhookNotificacion = {
    version: 1,
    tipoEvento: "paridad_precio",
    titulo: "Violación de paridad",
    cuerpoTexto: "airbnb por encima de lo esperado",
    metadata: {},
    emitidoEn: new Date().toISOString(),
  };
  await encolarReintentoWebhook(motor.ejecutor, { tenantId, payload, motivoRechazo: "error_red_o_timeout" });
  const fila = await motor.ejecutor.query<{ id: string }>(
    "SELECT id FROM webhook_saliente_reintento WHERE tenant_id = $1",
    [tenantId],
  );
  return fila.rows[0]!.id;
}

async function forzarElegibleAhora(id: string): Promise<void> {
  await motor.ejecutor.query(
    `UPDATE webhook_saliente_reintento SET proximo_intento_en = now() - interval '1 second' WHERE id = $1`,
    [id],
  );
}

async function leerFila(id: string) {
  const { rows } = await motor.ejecutor.query<{
    intentos: number;
    estado: string;
    proximo_intento_en: string;
    ultimo_motivo_rechazo: string | null;
  }>("SELECT intentos, estado, proximo_intento_en, ultimo_motivo_rechazo FROM webhook_saliente_reintento WHERE id = $1", [id]);
  return rows[0] ?? null;
}

const CONFIG_FALSA: ConfigWebhookTenant = { url: "https://ejemplo.com/hook", secretoHmac: "secreto-de-prueba" };

function enviarQueSiempreFalla(): typeof enviarWebhookFirmado {
  return vi.fn(async () => ({ entregado: false, statusHttp: 500, motivoRechazo: "status_no_2xx" })) as unknown as typeof enviarWebhookFirmado;
}

beforeEach(async () => {
  motor = await crearMotorPglite();
  await aplicarMigraciones(motor.ejecutor, migraciones);
});

afterEach(async () => {
  await motor.cerrar();
});

describe("encolarReintentoWebhook — nace con intentos=1 (el intento síncrono de dispatcher.ts ya cuenta)", () => {
  it("inserta una fila 'pendiente' con intentos=1 y proximo_intento_en en el primer escalón de backoff", async () => {
    const tenantId = await crearTenant();
    const id = await encolarUnaFila(tenantId);
    const fila = await leerFila(id);
    expect(fila).not.toBeNull();
    expect(fila!.estado).toBe("pendiente");
    expect(fila!.intentos).toBe(1);
    expect(await contarWebhookReintentoPorEstado(motor.ejecutor)).toEqual({ pendiente: 1, agotado: 0 });
  });
});

describe("procesarReintentosWebhookPendientes — backoff exponencial CRECIENTE y medible", () => {
  it("cada reintento fallido agenda proximo_intento_en al escalón de backoff correspondiente, estrictamente creciente", async () => {
    const tenantId = await crearTenant();
    const id = await encolarUnaFila(tenantId);
    const backoffMs = [1_000, 5_000, 30_000, 7_200_000]; // 1min/5min/30min/2h en la unidad del test.
    const enviarWebhook = enviarQueSiempreFalla();

    // --- Reintento nº2 (primer paso por el worker) ---
    await forzarElegibleAhora(id);
    const ANCLA_1 = 1_700_000_000_000; // epoch fijo, arbitrario pero determinista.
    await procesarReintentosWebhookPendientes({
      ejecutor: motor.ejecutor,
      cargarConfig: async () => CONFIG_FALSA,
      enviarWebhook,
      backoffMs,
      maxIntentos: MAX_INTENTOS_REINTENTO_WEBHOOK_DEFECTO,
      ahoraMs: () => ANCLA_1,
    });
    let fila = await leerFila(id);
    expect(fila!.estado).toBe("pendiente");
    expect(fila!.intentos).toBe(2);
    const proximo1 = new Date(fila!.proximo_intento_en).getTime();
    expect(proximo1).toBe(ANCLA_1 + backoffMs[0]!); // 1min.

    // --- Reintento nº3: el escalón debe ser MAYOR que el anterior (5min > 1min) ---
    await forzarElegibleAhora(id);
    const ANCLA_2 = ANCLA_1 + 60_000;
    await procesarReintentosWebhookPendientes({
      ejecutor: motor.ejecutor,
      cargarConfig: async () => CONFIG_FALSA,
      enviarWebhook,
      backoffMs,
      maxIntentos: MAX_INTENTOS_REINTENTO_WEBHOOK_DEFECTO,
      ahoraMs: () => ANCLA_2,
    });
    fila = await leerFila(id);
    expect(fila!.estado).toBe("pendiente");
    expect(fila!.intentos).toBe(3);
    const proximo2 = new Date(fila!.proximo_intento_en).getTime();
    expect(proximo2).toBe(ANCLA_2 + backoffMs[1]!); // 5min.
    expect(backoffMs[1]).toBeGreaterThan(backoffMs[0]!); // el escalón creció.

    // --- Reintento nº4: 30min > 5min ---
    await forzarElegibleAhora(id);
    const ANCLA_3 = ANCLA_2 + 300_000;
    await procesarReintentosWebhookPendientes({
      ejecutor: motor.ejecutor,
      cargarConfig: async () => CONFIG_FALSA,
      enviarWebhook,
      backoffMs,
      maxIntentos: MAX_INTENTOS_REINTENTO_WEBHOOK_DEFECTO,
      ahoraMs: () => ANCLA_3,
    });
    fila = await leerFila(id);
    expect(fila!.estado).toBe("pendiente");
    expect(fila!.intentos).toBe(4);
    const proximo3 = new Date(fila!.proximo_intento_en).getTime();
    expect(proximo3).toBe(ANCLA_3 + backoffMs[2]!); // 30min.
    expect(backoffMs[2]).toBeGreaterThan(backoffMs[1]!);

    expect(enviarWebhook).toHaveBeenCalledTimes(3);
  });

  it("el arreglo de backoff real exportado (BACKOFF_REINTENTO_WEBHOOK_MS) es 1min/5min/30min/2h, estrictamente creciente", () => {
    expect(BACKOFF_REINTENTO_WEBHOOK_MS).toEqual([60_000, 300_000, 1_800_000, 7_200_000]);
    for (let i = 1; i < BACKOFF_REINTENTO_WEBHOOK_MS.length; i++) {
      expect(BACKOFF_REINTENTO_WEBHOOK_MS[i]).toBeGreaterThan(BACKOFF_REINTENTO_WEBHOOK_MS[i - 1]!);
    }
  });
});

describe("procesarReintentosWebhookPendientes — fallo permanente tras agotar intentos, NUNCA reintentos infinitos", () => {
  it("al alcanzar maxIntentos, la fila pasa a 'agotado' y una llamada posterior NO vuelve a invocar enviarWebhook para ella", async () => {
    const tenantId = await crearTenant();
    const id = await encolarUnaFila(tenantId);
    const enviarWebhook = enviarQueSiempreFalla();
    const maxIntentos = 3; // nace en 1 -> 2 reintentos programados antes de agotar.

    await forzarElegibleAhora(id);
    await procesarReintentosWebhookPendientes({
      ejecutor: motor.ejecutor,
      cargarConfig: async () => CONFIG_FALSA,
      enviarWebhook,
      backoffMs: [10, 20],
      maxIntentos,
    });
    expect((await leerFila(id))!.estado).toBe("pendiente");
    expect((await leerFila(id))!.intentos).toBe(2);

    await forzarElegibleAhora(id);
    const resultado = await procesarReintentosWebhookPendientes({
      ejecutor: motor.ejecutor,
      cargarConfig: async () => CONFIG_FALSA,
      enviarWebhook,
      backoffMs: [10, 20],
      maxIntentos,
    });
    const filaAgotada = await leerFila(id);
    expect(filaAgotada!.estado).toBe("agotado");
    expect(filaAgotada!.intentos).toBe(3);
    expect(filaAgotada!.ultimo_motivo_rechazo).toBe("status_no_2xx");
    expect(resultado.procesadas).toEqual([{ id, resultado: "agotado" }]);
    expect(await contarWebhookReintentoPorEstado(motor.ejecutor)).toEqual({ pendiente: 0, agotado: 1 });

    // Forzar elegibilidad de nuevo no debería importar: el WHERE de
    // listarPendientesListos exige estado='pendiente', así que una fila
    // 'agotado' nunca vuelve a aparecer, sin importar su proximo_intento_en.
    await motor.ejecutor.query(
      `UPDATE webhook_saliente_reintento SET proximo_intento_en = now() - interval '1 hour' WHERE id = $1`,
      [id],
    );
    const llamadasAntes = (enviarWebhook as ReturnType<typeof vi.fn>).mock.calls.length;
    const segundaPasada = await procesarReintentosWebhookPendientes({
      ejecutor: motor.ejecutor,
      cargarConfig: async () => CONFIG_FALSA,
      enviarWebhook,
      backoffMs: [10, 20],
      maxIntentos,
    });
    expect(segundaPasada.procesadas).toHaveLength(0);
    expect((enviarWebhook as ReturnType<typeof vi.fn>).mock.calls.length).toBe(llamadasAntes); // nunca reintentos infinitos.
    // La fila sigue existiendo (conservada para revisión humana), nunca se borra al agotarse.
    expect(await leerFila(id)).not.toBeNull();
  });
});

describe("procesarReintentosWebhookPendientes — idempotencia hacia adelante", () => {
  it("una entrega que se recupera en el segundo intento borra la fila y NUNCA se reenvía una tercera vez", async () => {
    const tenantId = await crearTenant();
    const id = await encolarUnaFila(tenantId);

    let llamada = 0;
    const enviarWebhook = vi.fn(async () => {
      llamada++;
      if (llamada === 1) return { entregado: false, statusHttp: 503, motivoRechazo: "status_no_2xx" as const };
      return { entregado: true, statusHttp: 200, motivoRechazo: null };
    }) as unknown as typeof enviarWebhookFirmado;

    // Intento fallido (nº2 en total).
    await forzarElegibleAhora(id);
    await procesarReintentosWebhookPendientes({
      ejecutor: motor.ejecutor,
      cargarConfig: async () => CONFIG_FALSA,
      enviarWebhook,
      backoffMs: [10, 20, 30],
      maxIntentos: 5,
    });
    expect((await leerFila(id))!.estado).toBe("pendiente");
    expect(enviarWebhook).toHaveBeenCalledTimes(1);

    // Intento que SÍ se recupera (nº3 en total) — la fila se borra.
    await forzarElegibleAhora(id);
    const resultadoRecuperado = await procesarReintentosWebhookPendientes({
      ejecutor: motor.ejecutor,
      cargarConfig: async () => CONFIG_FALSA,
      enviarWebhook,
      backoffMs: [10, 20, 30],
      maxIntentos: 5,
    });
    expect(resultadoRecuperado.procesadas).toEqual([{ id, resultado: "entregado" }]);
    expect(await leerFila(id)).toBeNull();
    expect(enviarWebhook).toHaveBeenCalledTimes(2);

    // Una tercera pasada del worker no encuentra nada pendiente para esta
    // fila (ya borrada) — enviarWebhook NUNCA se vuelve a llamar por ella.
    const tercerPase = await procesarReintentosWebhookPendientes({
      ejecutor: motor.ejecutor,
      cargarConfig: async () => CONFIG_FALSA,
      enviarWebhook,
      backoffMs: [10, 20, 30],
      maxIntentos: 5,
    });
    expect(tercerPase.procesadas).toHaveLength(0);
    expect(enviarWebhook).toHaveBeenCalledTimes(2); // sin un tercer envío.
    expect(await contarWebhookReintentoPorEstado(motor.ejecutor)).toEqual({ pendiente: 0, agotado: 0 });
  });

  it("sin webhook_tenant configurado/activo en el momento del reintento, no se re-envía la copia obsoleta — se cuenta como fallo (config actual, nunca una copia vieja)", async () => {
    const tenantId = await crearTenant();
    const id = await encolarUnaFila(tenantId);
    const enviarWebhook = vi.fn();

    await forzarElegibleAhora(id);
    await procesarReintentosWebhookPendientes({
      ejecutor: motor.ejecutor,
      cargarConfig: async () => null, // tenant desactivó el webhook entre el fallo original y el reintento.
      enviarWebhook: enviarWebhook as unknown as typeof enviarWebhookFirmado,
      backoffMs: [10],
      maxIntentos: 5,
    });
    expect(enviarWebhook).not.toHaveBeenCalled(); // nunca intenta enviar sin config vigente.
    const fila = await leerFila(id);
    expect(fila!.estado).toBe("pendiente");
    expect(fila!.intentos).toBe(2);
    expect(fila!.ultimo_motivo_rechazo).toBe("webhook_tenant_inactivo_o_ausente");
  });
});

describe("cargarConfigWebhookTenant — config VIGENTE en el momento del reintento, nunca una copia obsoleta", () => {
  it("descifra el secreto real de webhook_tenant cuando está activo", async () => {
    const tenantId = await crearTenant();
    const cifrado = cifrarSecretoWebhook("secreto-real-del-tenant");
    await motor.ejecutor.query(
      `INSERT INTO webhook_tenant (tenant_id, url, secreto_cifrado, secreto_iv, secreto_tag, activo)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [tenantId, "https://ejemplo.com/hook", cifrado.secretoCifrado, cifrado.secretoIv, cifrado.secretoTag],
    );
    const config = await cargarConfigWebhookTenant(motor.ejecutor, tenantId);
    expect(config).toEqual({ url: "https://ejemplo.com/hook", secretoHmac: "secreto-real-del-tenant" });
  });

  it("devuelve null si el webhook está inactivo o no existe", async () => {
    const tenantId = await crearTenant();
    expect(await cargarConfigWebhookTenant(motor.ejecutor, tenantId)).toBeNull();
  });
});

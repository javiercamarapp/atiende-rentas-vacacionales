import * as http from "node:http";
import { afterAll, describe, expect, it } from "vitest";
import { fetchIcsSeguro } from "../src/net/fetchSsrf.js";

/**
 * Regresión permanente S-08 (docs/auditoria-2/seguridad.md): exceder
 * `maxBytes` debe SIEMPRE rechazar la promesa de `fetchIcsSeguro` — nunca
 * evadirse en silencio ni escapar como `uncaughtException` de proceso —
 * sin importar si el cuerpo llega en un único evento `data` (ráfaga
 * única, `res.end()` de un solo golpe) o en varios trozos a lo largo del
 * tiempo.
 */
const servidoresLevantados: http.Server[] = [];

afterAll(async () => {
  await Promise.all(
    servidoresLevantados.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

async function levantarServidorHttp(manejador: http.RequestListener): Promise<{ puerto: number }> {
  const servidor = http.createServer(manejador);
  servidoresLevantados.push(servidor);
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const direccion = servidor.address();
  if (!direccion || typeof direccion === "string") throw new Error("no se pudo levantar el servidor de prueba");
  return { puerto: direccion.port };
}

describe("fetchIcsSeguro — límite de maxBytes (S-08)", () => {
  it("rechaza la promesa (sin uncaughtException) cuando el cuerpo excede maxBytes en una ÚNICA ráfaga (res.end() de un solo golpe)", async () => {
    const maxBytes = 100;
    const { puerto } = await levantarServidorHttp((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/calendar" });
      res.end("X".repeat(1000));
    });

    let excepcionNoControlada: Error | undefined;
    const capturador = (err: Error) => {
      excepcionNoControlada = err;
    };
    process.once("uncaughtException", capturador);

    await expect(
      fetchIcsSeguro({
        url: `http://simulador.local:${puerto}/x.ics`,
        permitirHttpSimuladorLocal: true,
        resolverPersonalizado: () => ["127.0.0.1"],
        maxBytes,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/excede el límite de 100 bytes/);

    await new Promise((r) => setTimeout(r, 50));
    process.removeListener("uncaughtException", capturador);
    expect(excepcionNoControlada).toBeUndefined();
  });

  it("rechaza la promesa cuando el cuerpo excede maxBytes repartido en VARIOS trozos", async () => {
    const maxBytes = 100;
    const { puerto } = await levantarServidorHttp((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/calendar" });
      let enviados = 0;
      const intervalo = setInterval(() => {
        res.write("X".repeat(50));
        enviados += 50;
        if (enviados >= 1000) {
          clearInterval(intervalo);
          res.end();
        }
      }, 5);
    });

    await expect(
      fetchIcsSeguro({
        url: `http://simulador.local:${puerto}/x.ics`,
        permitirHttpSimuladorLocal: true,
        resolverPersonalizado: () => ["127.0.0.1"],
        maxBytes,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/excede el límite de 100 bytes/);
  });

  it("[S-12] timeoutMs es de duración TOTAL, no de inactividad del socket: un goteo constante por debajo del timeout igual se corta al tiempo configurado", async () => {
    const timeoutMs = 300;
    const totalGoteoMs = 1500;
    const { puerto } = await levantarServidorHttp((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/calendar" });
      const inicio = Date.now();
      const intervalo = setInterval(() => {
        if (Date.now() - inicio > totalGoteoMs) {
          clearInterval(intervalo);
          res.end("FIN");
          return;
        }
        res.write(".");
      }, 100);
    });

    const inicio = Date.now();
    await expect(
      fetchIcsSeguro({
        url: `http://simulador.local:${puerto}/x.ics`,
        permitirHttpSimuladorLocal: true,
        resolverPersonalizado: () => ["127.0.0.1"],
        timeoutMs,
        maxBytes: 10_000,
      }),
    ).rejects.toThrow(/timeout total de 300ms excedido/);
    expect(Date.now() - inicio).toBeLessThan(totalGoteoMs);
  }, 10_000);

  it("un cuerpo dentro del límite se resuelve normalmente", async () => {
    const { puerto } = await levantarServidorHttp((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/calendar" });
      res.end("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    });

    const resultado = await fetchIcsSeguro({
      url: `http://simulador.local:${puerto}/x.ics`,
      permitirHttpSimuladorLocal: true,
      resolverPersonalizado: () => ["127.0.0.1"],
      maxBytes: 10_000,
      timeoutMs: 5000,
    });
    expect(resultado.status).toBe(200);
    expect(resultado.cuerpo).toContain("BEGIN:VCALENDAR");
  });
});

import * as http from "node:http";
import { afterAll, describe, expect, it } from "vitest";
import {
  fetchIcsSeguro,
  SsrfError,
  validarIpPermitida,
  parsearIcs,
  IcsParseError,
  LIMITES_ICS_POR_DEFECTO,
} from "@atiende-rv/adapters";

/**
 * Caso adversarial 20 — SSRF (H-024/H-025, REQ-030/031, §RV19/21-2/3/15),
 * vectores adicionales al caso base de `tests/adversarial/sync/casos.test.ts`
 * (que cubre metadata 169.254.169.254 vía `resolverPersonalizado`): IP
 * privada RFC1918, loopback, esquema `file:`, y redirección real HTTP
 * hacia un destino interno (revalidación por salto, D-019). También añade
 * H-094 (BACKLOG E16): límites de tamaño/eventos del parser ICS ("ICS
 * bomba"), que no es uno de los 20 casos numerados de ACEPTACION
 * §Calendario-2 pero es parte explícita del alcance de Lote 11
 * (H-094: "límites de tamaño ICS").
 */

const servidoresLevantados: http.Server[] = [];

afterAll(async () => {
  await Promise.all(
    servidoresLevantados.map(
      (s) => new Promise<void>((resolve) => s.close(() => resolve())),
    ),
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

describe("caso 20 — SSRF: vectores adicionales sobre la lista completa de RV19-R-01/02", () => {
  it("rechaza un rango RFC1918 (10.0.0.0/8) antes de cualquier conexión saliente", async () => {
    await expect(
      fetchIcsSeguro({
        url: "https://feed-interno.example/x.ics",
        resolverPersonalizado: () => ["10.1.2.3"],
      }),
    ).rejects.toThrow(SsrfError);
  });

  it("rechaza un rango RFC1918 (192.168.0.0/16)", async () => {
    await expect(
      fetchIcsSeguro({
        url: "https://feed-interno.example/x.ics",
        resolverPersonalizado: () => ["192.168.1.1"],
      }),
    ).rejects.toThrow(SsrfError);
  });

  it("rechaza loopback (127.0.0.1) cuando NO es el simulador de desarrollo (permitirHttpSimuladorLocal ausente)", async () => {
    await expect(
      fetchIcsSeguro({
        url: "https://feed-loopback.example/x.ics",
        resolverPersonalizado: () => ["127.0.0.1"],
      }),
    ).rejects.toThrow(SsrfError);
  });

  it("rechaza metadata cloud (169.254.169.254) — repetido aquí como parte del catálogo consolidado del caso 20", async () => {
    const resultado = validarIpPermitida("169.254.169.254");
    expect(resultado.permitida).toBe(false);
    expect(resultado.motivo).toMatch(/metadata/);
  });

  it("rechaza el esquema file: sin intentar resolver DNS ni abrir ninguna conexión", async () => {
    let resolverLlamado = false;
    await expect(
      fetchIcsSeguro({
        url: "file:///etc/passwd",
        resolverPersonalizado: () => {
          resolverLlamado = true;
          return ["127.0.0.1"];
        },
      }),
    ).rejects.toThrow(SsrfError);
    // El guard de esquema es el PRIMER control (antes de resolución DNS) —
    // nunca debió invocarse el resolvedor.
    expect(resolverLlamado).toBe(false);
  });

  it("rechaza credenciales embebidas en la URL (user:pass@host) antes de resolver DNS", async () => {
    await expect(
      fetchIcsSeguro({
        url: "https://usuario:secreto@feed.example/x.ics",
        resolverPersonalizado: () => ["93.184.216.34"], // IP pública válida, no es el motivo del rechazo
      }),
    ).rejects.toThrow(SsrfError);
  });

  it("redirección hacia destino interno usando el host de simulador local autorizado: el segundo salto SÍ se revalida y se rechaza", async () => {
    const { puerto } = await levantarServidorHttp((req, res) => {
      res.writeHead(302, { Location: "https://interna.simulador-adversarial.local/oculto.ics" });
      res.end();
    });

    const resolverDeLaPrueba = (hostname: string): string[] => {
      if (hostname === "simulador.local") return ["127.0.0.1"];
      if (hostname === "interna.simulador-adversarial.local") return ["169.254.169.254"];
      throw new Error(`hostname inesperado en la prueba: ${hostname}`);
    };

    let lanzo: unknown;
    try {
      await fetchIcsSeguro({
        url: `http://simulador.local:${puerto}/feed.ics`,
        permitirHttpSimuladorLocal: true,
        resolverPersonalizado: resolverDeLaPrueba,
      });
    } catch (error) {
      lanzo = error;
    }
    expect(lanzo).toBeInstanceOf(SsrfError);
    expect((lanzo as SsrfError).motivo).toBe("ip_bloqueada");
  });
});

describe("H-094 (bonus, fuera del catálogo de 20 casos numerados) — ICS bomba/tamaño excesivo", () => {
  it("rechaza un feed que excede maxBytes antes de tokenizar", () => {
    const relleno = "X".repeat(LIMITES_ICS_POR_DEFECTO.maxBytes + 1);
    const feedGigante = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Bomba//EN\r\n${relleno}\r\nEND:VCALENDAR\r\n`;
    expect(() => parsearIcs(feedGigante)).toThrow(IcsParseError);
    try {
      parsearIcs(feedGigante);
      throw new Error("se esperaba IcsParseError");
    } catch (error) {
      expect((error as IcsParseError).codigo).toBe("tamano_excedido");
    }
  });

  it("rechaza un feed con más eventos que maxEventos (bomba de miles de VEVENT)", () => {
    const limites = { ...LIMITES_ICS_POR_DEFECTO, maxEventos: 5 };
    const vevents = Array.from(
      { length: 10 },
      (_, i) =>
        `BEGIN:VEVENT\r\nUID:bomba-${i}@simulador.local\r\nDTSTAMP:20270101T000000Z\r\n` +
        `DTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102\r\nEND:VEVENT\r\n`,
    ).join("");
    const feed = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Bomba//EN\r\n${vevents}END:VCALENDAR\r\n`;
    expect(() => parsearIcs(feed, limites)).toThrow(IcsParseError);
  });

  it("rechaza una línea des-plegada que excede maxLongitudLineaDesplegada (línea infinita)", () => {
    const lineaLarga = "DESCRIPTION:" + "A".repeat(LIMITES_ICS_POR_DEFECTO.maxLongitudLineaDesplegada + 1);
    const feed =
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Bomba//EN\r\nBEGIN:VEVENT\r\n` +
      `UID:linea-larga@simulador.local\r\nDTSTAMP:20270101T000000Z\r\n` +
      `DTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102\r\n${lineaLarga}\r\n` +
      `END:VEVENT\r\nEND:VCALENDAR\r\n`;
    expect(() => parsearIcs(feed)).toThrow(IcsParseError);
  });

  it("un feed dentro de los límites SÍ se acepta (control: los límites no rechazan feeds legítimos)", () => {
    const feed =
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//OK//EN\r\nBEGIN:VEVENT\r\n` +
      `UID:normal@simulador.local\r\nDTSTAMP:20270101T000000Z\r\n` +
      `DTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
    const resultado = parsearIcs(feed);
    expect(resultado.eventos).toHaveLength(1);
  });
});

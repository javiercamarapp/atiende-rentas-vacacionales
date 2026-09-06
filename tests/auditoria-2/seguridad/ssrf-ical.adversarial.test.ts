import * as http from "node:http";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import {
  fetchIcsSeguro,
  SsrfError,
  validarIpPermitida,
  parsearIcs,
  resolverFechaLocal,
} from "@atiende-rv/adapters";

/**
 * Auditoría de seguridad independiente (2026-09-06) — SSRF (fetchSsrf.ts /
 * ssrf.ts) + parser ICS (parser.ts / resolverFecha.ts / tipos.ts).
 *
 * Objetivo: encontrar bypasses NUEVOS no cubiertos por
 * tests/adversarial/ssrf/casos.test.ts ni tests/adversarial/sync/casos.test.ts
 * (que no tienen NINGUNA cobertura de IPv6, confirmado por grep). No se
 * modifica código de producto ni los suites adversariales existentes.
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

/** Genera un certificado autofirmado real (vía `openssl` del sistema) y
 * levanta un servidor HTTPS real en 127.0.0.1 — necesario para probar el
 * bypass IPv6-mapeada-a-IPv4 con el ÚNICO esquema que la mayoría de
 * hostnames puede usar (`https:`), sin el ruido de un handshake TLS
 * fallido contra un servidor de texto plano. */
async function levantarServidorHttpsAutofirmado(
  manejador: http.RequestListener,
): Promise<{ puerto: number; cerrar: () => Promise<void> }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auditoria-ssrf-"));
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  execFileSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "1",
    "-nodes",
    "-subj",
    "/CN=feed-supuestamente-publico.example",
  ]);
  const servidor = https.createServer(
    { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
    manejador,
  );
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const direccion = servidor.address();
  if (!direccion || typeof direccion === "string") throw new Error("no se pudo levantar el servidor HTTPS de prueba");
  return {
    puerto: direccion.port,
    cerrar: () =>
      new Promise<void>((resolve) => {
        servidor.close(() => {
          fs.rmSync(dir, { recursive: true, force: true });
          resolve();
        });
      }),
  };
}

// ---------------------------------------------------------------------------
// HALLAZGO 1 (CRÍTICO): direcciones IPv6 mapeadas a IPv4 no se normalizan
// antes de comparar contra el deny-list IPv4 en ssrf.ts.
// ---------------------------------------------------------------------------
describe("H1 CRÍTICO — bypass SSRF vía direcciones IPv6-mapeadas-a-IPv4 (ssrf.ts normalizarIpv6)", () => {
  it("validarIpPermitida NO bloquea ::ffff:127.0.0.1 (loopback) — código: normalizarIpv6 solo pela el prefijo pero compara contra patrones IPv6, nunca vuelve a pasar por RANGOS_BLOQUEADOS_IPV4", () => {
    const resultado = validarIpPermitida("::ffff:127.0.0.1");
    // eslint-disable-next-line no-console
    console.log("::ffff:127.0.0.1 ->", JSON.stringify(resultado));
    // BUG CONFIRMADO: esto debería ser `permitida: false`. El código actual
    // lo permite porque `esIpv4` es false (la cadena contiene ':') y
    // `ipv6EsLoopbackOULinkLocalOULocalUnica` normaliza a "127.0.0.1" pero
    // solo la compara contra los patrones ::1 / fe80 / fc00 / ff, no contra
    // RANGOS_BLOQUEADOS_IPV4.
    expect(resultado.permitida).toBe(true);
  });

  it("validarIpPermitida NO bloquea ::ffff:169.254.169.254 (metadata cloud)", () => {
    const resultado = validarIpPermitida("::ffff:169.254.169.254");
    console.log("::ffff:169.254.169.254 ->", JSON.stringify(resultado));
    expect(resultado.permitida).toBe(true); // BUG: debería bloquearse (metadata)
  });

  it("validarIpPermitida NO bloquea ::ffff:10.0.0.1 (RFC1918)", () => {
    const resultado = validarIpPermitida("::ffff:10.0.0.1");
    console.log("::ffff:10.0.0.1 ->", JSON.stringify(resultado));
    expect(resultado.permitida).toBe(true); // BUG: debería bloquearse (privado)
  });

  it("validarIpPermitida NO bloquea la forma hexadecimal completa 0:0:0:0:0:ffff:7f00:1 (127.0.0.1) — normalizarIpv6 solo reconoce el prefijo literal '::ffff:'", () => {
    const resultado = validarIpPermitida("0:0:0:0:0:ffff:7f00:1");
    console.log("0:0:0:0:0:ffff:7f00:1 ->", JSON.stringify(resultado));
    expect(resultado.permitida).toBe(true); // BUG
  });

  it("Node considera estas direcciones IP literales válidas (net.isIP), por lo que fetchIcsSeguro las pineará y conectará DIRECTAMENTE sin nueva resolución DNS", () => {
    const net = require("node:net") as typeof import("node:net");
    expect(net.isIP("::ffff:127.0.0.1")).toBe(6);
  });

  it("EXPLOTACIÓN END-TO-END real (HTTPS, hostname público arbitrario, SIN flag de simulador): fetchIcsSeguro con resolverPersonalizado devolviendo '::ffff:127.0.0.1' conecta de verdad al servidor loopback y devuelve su contenido, saltándose por completo el guard SSRF", async () => {
    const secreto = "CONTENIDO-INTERNO-SECRETO-" + Math.random().toString(36).slice(2);
    const { puerto, cerrar } = await levantarServidorHttpsAutofirmado((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/calendar" });
      res.end(secreto);
    });

    try {
      // La URL declara un hostname que a los ojos del código NO es el
      // simulador de desarrollo (no hay ninguna excepción especial para
      // él): el guard de IP (validarTodasLasIps) DEBE aplicar de lleno.
      // El "DNS" (aquí resolverPersonalizado, el mismo mecanismo de
      // inyección que usa tests/adversarial/ssrf/casos.test.ts) resuelve a
      // la forma IPv4-mapeada-en-IPv6 del loopback real donde corre el
      // servidor de la víctima. rejectUnauthorized se relaja SOLO para
      // este proceso de prueba, porque el certificado es autofirmado —
      // el código bajo prueba (fetchSsrf.ts) no relaja nada por su cuenta.
      const previo = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      let resultado;
      try {
        resultado = await fetchIcsSeguro({
          url: `https://feed-supuestamente-publico.example:${puerto}/x.ics`,
          resolverPersonalizado: () => ["::ffff:127.0.0.1"],
        });
      } finally {
        if (previo === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previo;
      }

      console.log("EXPLOTACIÓN SSRF confirmada vía ::ffff: — respuesta real del servidor loopback:", JSON.stringify(resultado));
      // BUG CONFIRMADO: se esperaría SsrfError("ip_bloqueada"). En cambio,
      // la petición HTTPS real se completa contra 127.0.0.1 y devuelve el
      // contenido "interno".
      expect(resultado.status).toBe(200);
      expect(resultado.cuerpo).toBe(secreto);
    } finally {
      await cerrar();
    }
  });
});

// ---------------------------------------------------------------------------
// HALLAZGO 2 — cobertura de control: IPv6 loopback/link-local/ULA "puros"
// (sin mapeo IPv4) SÍ están correctamente bloqueados.
// ---------------------------------------------------------------------------
describe("H2 control (NO vulnerable) — IPv6 nativo (::1, fe80::/10, fc00::/7)", () => {
  it("bloquea ::1 (loopback IPv6 puro)", () => {
    expect(validarIpPermitida("::1").permitida).toBe(false);
  });
  it("bloquea fe80::1 (link-local)", () => {
    expect(validarIpPermitida("fe80::1").permitida).toBe(false);
  });
  it("bloquea fc00::1 y fd12:3456::1 (unique-local fc00::/7)", () => {
    expect(validarIpPermitida("fc00::1").permitida).toBe(false);
    expect(validarIpPermitida("fd12:3456::1").permitida).toBe(false);
  });
  it("bloquea :: (no especificada)", () => {
    expect(validarIpPermitida("::").permitida).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HALLAZGO 3 — DNS rebinding: NO reproducible, mitigado estructuralmente.
// ---------------------------------------------------------------------------
describe("H3 (NO reproducible) — DNS rebinding TOCTOU", () => {
  it("resolverPersonalizado se invoca UNA sola vez por fetch y la IP validada se pinea literalmente al socket (fetchSsrf.ts: `host: ipPineada`, líneas ~118-137) — no hay segunda resolución al conectar", async () => {
    let llamadas = 0;
    const secreto = "OK-" + Math.random().toString(36).slice(2);
    const { puerto } = await levantarServidorHttp((_req, res) => {
      res.writeHead(200);
      res.end(secreto);
    });

    const resultado = await fetchIcsSeguro({
      url: `http://simulador.local:${puerto}/x.ics`,
      permitirHttpSimuladorLocal: true,
      resolverPersonalizado: (hostname) => {
        llamadas++;
        expect(hostname).toBe("simulador.local");
        return ["127.0.0.1"];
      },
    });

    expect(llamadas).toBe(1);
    expect(resultado.cuerpo).toBe(secreto);
    // Como la conexión TCP usa el literal `ipPineada` (una IP, no un
    // hostname), Node NO vuelve a resolver DNS al conectar: no existe
    // ventana temporal entre "check" (resolución) y "use" (conexión) donde
    // un servidor DNS controlado por el atacante pueda cambiar la
    // respuesta. El vector de rebinding clásico (TTL=0, primera respuesta
    // pública, segunda respuesta interna) no aplica aquí porque solo hay
    // UNA resolución y la conexión no vuelve a invocar al resolvedor.
  });
});

// ---------------------------------------------------------------------------
// HALLAZGO 4 — redirecciones multi-salto: revalidación correcta en cada
// salto (control positivo), pero también probamos casos límite.
// ---------------------------------------------------------------------------
describe("H4 — redirecciones 30x multi-salto", () => {
  it("un segundo salto (no el primero) hacia un destino privado SÍ se rechaza (revalidación por salto) — usa `https:` para el hop interno porque ese esquema se permite para cualquier hostname (a diferencia de `http:`, reservado solo a simulador.local)", async () => {
    const { puerto: puertoB } = await levantarServidorHttp((_req, res) => {
      res.writeHead(302, { Location: "https://interno-hop2.simulador-adversarial.local/final.ics" });
      res.end();
    });
    const { puerto: puertoA } = await levantarServidorHttp((_req, res) => {
      res.writeHead(302, { Location: `http://simulador.local:${puertoB}/hop2.ics` });
      res.end();
    });

    const resolver = (hostname: string): string[] => {
      if (hostname === "simulador.local") return ["127.0.0.1"];
      if (hostname === "interno-hop2.simulador-adversarial.local") return ["10.0.0.5"];
      throw new Error(`hostname inesperado: ${hostname}`);
    };

    let lanzo: unknown;
    try {
      await fetchIcsSeguro({
        url: `http://simulador.local:${puertoA}/hop1.ics`,
        permitirHttpSimuladorLocal: true,
        resolverPersonalizado: resolver,
        maxRedirects: 5,
      });
    } catch (e) {
      lanzo = e;
    }
    expect(lanzo).toBeInstanceOf(SsrfError);
    expect((lanzo as SsrfError).motivo).toBe("ip_bloqueada");
  });

  it("redirección hacia esquema file: se rechaza en el salto (no solo en la URL inicial)", async () => {
    const { puerto } = await levantarServidorHttp((_req, res) => {
      res.writeHead(302, { Location: "file:///etc/passwd" });
      res.end();
    });
    let lanzo: unknown;
    try {
      await fetchIcsSeguro({
        url: `http://simulador.local:${puerto}/hop1.ics`,
        permitirHttpSimuladorLocal: true,
        resolverPersonalizado: () => ["127.0.0.1"],
      });
    } catch (e) {
      lanzo = e;
    }
    expect(lanzo).toBeInstanceOf(SsrfError);
    expect((lanzo as SsrfError).motivo).toBe("esquema_no_permitido");
  });

  it("redirección con credenciales embebidas en el Location se rechaza en el salto", async () => {
    const { puerto } = await levantarServidorHttp((_req, res) => {
      res.writeHead(302, { Location: "https://usuario:secreto@feed.example/oculto.ics" });
      res.end();
    });
    let lanzo: unknown;
    try {
      await fetchIcsSeguro({
        url: `http://simulador.local:${puerto}/hop1.ics`,
        permitirHttpSimuladorLocal: true,
        resolverPersonalizado: () => ["127.0.0.1"],
      });
    } catch (e) {
      lanzo = e;
    }
    expect(lanzo).toBeInstanceOf(SsrfError);
    expect((lanzo as SsrfError).motivo).toBe("credenciales_en_url");
  });

  it("cadena de redirecciones que excede maxRedirects se rechaza con 'demasiadas_redirecciones'", async () => {
    // 5 servidores en cadena, todos en simulador.local (para no chocar con
    // el guard de IP) con maxRedirects=3. Cada servidor necesita conocer el
    // puerto del siguiente, así que se levantan en orden y cada handler lee
    // el array compartido (ya tendrá el puerto siguiente para cuando llegue
    // tráfico real, porque el fetch ocurre después de levantar los 5).
    const puertosFinales: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { puerto } = await levantarServidorHttp((_req, res) => {
        const siguiente = puertosFinales[i + 1];
        if (siguiente) {
          res.writeHead(302, { Location: `http://simulador.local:${siguiente}/x.ics` });
        } else {
          res.writeHead(200);
        }
        res.end();
      });
      puertosFinales.push(puerto);
    }

    let lanzo: unknown;
    try {
      await fetchIcsSeguro({
        url: `http://simulador.local:${puertosFinales[0]}/x.ics`,
        permitirHttpSimuladorLocal: true,
        resolverPersonalizado: () => ["127.0.0.1"],
        maxRedirects: 3,
      });
    } catch (e) {
      lanzo = e;
    }
    expect(lanzo).toBeInstanceOf(SsrfError);
    expect((lanzo as SsrfError).motivo).toBe("demasiadas_redirecciones");
  });
});

// ---------------------------------------------------------------------------
// HALLAZGO 5 — límites reales de streaming (Content-Length mentiroso) y
// timeout de INACTIVIDAD (no de duración total).
// ---------------------------------------------------------------------------
describe("H5 — límites de bytes y timeout durante streaming real", () => {
  it("control positivo (goteo lento, múltiples chunks): el límite de bytes SÍ corta correctamente y rechaza la promesa cuando el cuerpo llega en varios trozos a lo largo del tiempo", async () => {
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

    let lanzo: unknown;
    try {
      await fetchIcsSeguro({
        url: `http://simulador.local:${puerto}/x.ics`,
        permitirHttpSimuladorLocal: true,
        resolverPersonalizado: () => ["127.0.0.1"],
        maxBytes,
        timeoutMs: 5000,
      });
    } catch (e) {
      lanzo = e;
    }
    expect(lanzo).toBeInstanceOf(Error);
    expect(String((lanzo as Error).message)).toMatch(/excede el límite/);
  });

  it("HALLAZGO NUEVO (ALTO, encontrado por accidente al escribir el control anterior): cuando el cuerpo que excede maxBytes llega COMPLETO en un solo evento 'data' (ráfaga única, típico de un cuerpo pequeño servido vía res.end() de un solo golpe — muy plausible en la práctica), fetchIcsSeguro NO rechaza la promesa Y ADEMÁS provoca una excepción no controlada (uncaughtException) fuera de la promesa — en un proceso Node real sin handler global de uncaughtException esto tumba el proceso: DoS con una sola petición de un feed hostil", async () => {
    const maxBytes = 100;
    const { puerto } = await levantarServidorHttp((_req, res) => {
      // Todo el cuerpo (1000 bytes, > maxBytes) se entrega en una sola
      // llamada a end(): en loopback esto casi siempre llega como un único
      // evento 'data' en el cliente.
      res.writeHead(200, { "Content-Type": "text/calendar" });
      res.end("X".repeat(1000));
    });

    let excepcionNoControlada: Error | undefined;
    const capturador = (err: Error) => {
      excepcionNoControlada = err;
    };
    process.once("uncaughtException", capturador);

    let lanzo: unknown;
    let resultado: unknown;
    try {
      resultado = await fetchIcsSeguro({
        url: `http://simulador.local:${puerto}/x.ics`,
        permitirHttpSimuladorLocal: true,
        resolverPersonalizado: () => ["127.0.0.1"],
        maxBytes,
        timeoutMs: 5000,
      });
    } catch (e) {
      lanzo = e;
    }
    // Dar tiempo a que el 'uncaughtException' diferido (si ocurre) se dispare
    // antes de decidir si lo capturamos o no.
    await new Promise((r) => setTimeout(r, 50));
    process.removeListener("uncaughtException", capturador);

    console.log(
      "H5-bypass-rafaga: lanzo=",
      lanzo instanceof Error ? lanzo.message : lanzo,
      "resultado=",
      JSON.stringify(resultado),
      "uncaughtException=",
      excepcionNoControlada?.message,
    );

    // BUG CONFIRMADO: NINGÚN error llega al llamador (`lanzo` es undefined) y
    // el límite de bytes se evade silenciosamente por esta vía; en cambio,
    // el error de "cuerpo excede el límite" escapa como excepción de
    // proceso no controlada, fuera del try/catch normal del llamador.
    expect(lanzo).toBeUndefined();
    expect(excepcionNoControlada?.message).toMatch(/excede el límite de 100 bytes/);
  });

  it("BUG (medio): el 'timeout' configurado es de INACTIVIDAD del socket (se resetea con cada byte), no un límite de duración TOTAL — un servidor que gotea 1 byte periódicamente por debajo del timeout mantiene la conexión viva muy por encima del tiempo configurado", async () => {
    const timeoutMs = 300;
    const totalGoteoMs = 1500; // 5x el timeoutMs configurado
    const { puerto } = await levantarServidorHttp((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/calendar" });
      const inicio = Date.now();
      const intervalo = setInterval(() => {
        if (Date.now() - inicio > totalGoteoMs) {
          clearInterval(intervalo);
          res.end("FIN");
          return;
        }
        res.write("."); // 1 byte cada 100ms, muy por debajo de timeoutMs=300ms
      }, 100);
    });

    const inicio = Date.now();
    const resultado = await fetchIcsSeguro({
      url: `http://simulador.local:${puerto}/x.ics`,
      permitirHttpSimuladorLocal: true,
      resolverPersonalizado: () => ["127.0.0.1"],
      timeoutMs,
      maxBytes: 10_000,
    });
    const duracionMs = Date.now() - inicio;

    console.log(
      `H5-timeout: timeoutMs configurado=${timeoutMs}ms, duración real=${duracionMs}ms (esperado: NO debería exceder ~${timeoutMs}ms bajo la doc "timeout total")`,
    );
    // BUG CONFIRMADO: la petición NO fue cortada por timeout pese a durar
    // varias veces más que `timeoutMs`. Esto contradice el comentario de
    // fetchSsrf.ts línea 25 ("Timeout total y límite duro de bytes de
    // cuerpo") — lo implementado es `timeout` de socket (inactividad), no
    // un temporizador de duración total del fetch.
    expect(duracionMs).toBeGreaterThan(timeoutMs * 3);
    expect(resultado.cuerpo).toContain("FIN");
  }, 10_000);
});

// ---------------------------------------------------------------------------
// PARSER ICS
// ---------------------------------------------------------------------------

function feedConEvento(propiedadesExtra: string, dtstartLinea = "DTSTART;VALUE=DATE:20270101"): string {
  return (
    `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\n` +
    `UID:evento-1@simulador.local\r\nDTSTAMP:20270101T000000Z\r\n` +
    `${dtstartLinea}\r\n${propiedadesExtra}` +
    `END:VEVENT\r\nEND:VCALENDAR\r\n`
  );
}

describe("H6 CRÍTICO/ALTO — parser ICS: DTSTART/DTEND con rangos de calendario inválidos NO se validan (solo forma, no semántica)", () => {
  it("DTSTART;VALUE=DATE:20269999 (mes 99, día 99) NO lanza IcsParseError — se acepta como fecha 'válida'", () => {
    const feed = feedConEvento("DTEND;VALUE=DATE:20270102\r\n", "DTSTART;VALUE=DATE:20269999");
    const resultado = parsearIcs(feed);
    console.log("DTSTART garbage aceptado:", JSON.stringify(resultado.eventos[0]!.dtstart));
    expect(resultado.eventos).toHaveLength(1);
    expect(resultado.eventos[0]!.dtstart).toEqual({ tipo: "DATE", fecha: "2026-99-99" });
  });

  it("DTSTART DATE-TIME con hora/minuto/segundo fuera de rango (99:99:99) tampoco se valida", () => {
    const feed = feedConEvento("DTEND:20270101T999999Z\r\n", "DTSTART:20270101T999999Z");
    const resultado = parsearIcs(feed);
    console.log("DTSTART DATE-TIME garbage aceptado:", JSON.stringify(resultado.eventos[0]!.dtstart));
    expect(resultado.eventos[0]!.dtstart).toEqual({ tipo: "DATE-TIME-UTC", instanteIso: "2027-01-01T99:99:99Z" });
  });

  it("IMPACTO: resolverFechaLocal (resolverFecha.ts) NO valida el rango de una fecha DATE — la propaga tal cual sin lanzar, contaminando el modelo de dominio con 'fechas' sintácticamente inválidas", () => {
    const feed = feedConEvento("DTEND;VALUE=DATE:20270102\r\n", "DTSTART;VALUE=DATE:20269999");
    const resultado = parsearIcs(feed);
    const fechaLocal = resolverFechaLocal(resultado.eventos[0]!.dtstart, "America/Mexico_City");
    console.log("resolverFechaLocal con DATE inválido devuelve (sin lanzar):", fechaLocal);
    // BUG: no lanza, propaga el string garbage "2026-99-99" como si fuera
    // una fecha de calendario válida (tipo FechaLocal = string, sin
    // validación de runtime en este punto).
    expect(fechaLocal).toBe("2026-99-99");
  });

  it("en cambio, DATE-TIME-TZID con zona horaria inválida SÍ lanza -- pero un Error genérico, NO un IcsParseError/tipo reconocible por el contrato del parser", () => {
    const feed = feedConEvento("DTEND:20270101T120000\r\nDTSTART;TZID=Zona/Que/No/Existe:20270101T100000\r\n", "DTSTART;TZID=Zona/Que/No/Existe:20270101T100000");
    const resultado = parsearIcs(feed);
    expect(() => resolverFechaLocal(resultado.eventos[0]!.dtstart, "America/Mexico_City")).toThrowError(
      /Zona horaria IANA inválida/,
    );
    // Nota: parsearIcs() en sí NO valida el TZID (lo acepta como string
    // arbitrario, ver resolverFecha.ts línea 23 vía `fechaLocalDesdeInstante`
    // en @atiende-rv/domain). El error solo aparece más tarde, al resolver,
    // como `Error` plano -- no `IcsParseError` -- lo que puede romper
    // manejo de errores de un llamador que solo espera `IcsParseError` del
    // parser (fuera del alcance exacto de parser.ts, documentado aquí por
    // ser parte de resolverFecha.ts, en alcance explícito de esta auditoría).
  });
});

describe("H7 (control, NO vulnerable pero documentado) — propiedades duplicadas: gana la última ocurrencia", () => {
  it("dos DTSTART: gana el último (comportamiento documentado en construirVEvent, no un bug de seguridad)", () => {
    const feed = feedConEvento(
      "DTSTART;VALUE=DATE:20280101\r\nDTEND;VALUE=DATE:20270102\r\n",
      "DTSTART;VALUE=DATE:20270101",
    );
    const resultado = parsearIcs(feed);
    expect(resultado.eventos[0]!.dtstart).toEqual({ tipo: "DATE", fecha: "2028-01-01" });
  });

  it("dos UID: gana el último; el UID vacío también se acepta sin validar longitud/no-vacío", () => {
    const feed =
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\n` +
      `UID:primero@x\r\nUID:\r\nDTSTAMP:20270101T000000Z\r\n` +
      `DTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102\r\n` +
      `END:VEVENT\r\nEND:VCALENDAR\r\n`;
    const resultado = parsearIcs(feed);
    console.log("UID resultante tras UID duplicado (segundo vacío):", JSON.stringify(resultado.eventos[0]!.uid));
    // BUG menor: UID vacío se acepta sin ninguna validación de no-vacío;
    // combinado con "última ocurrencia gana", dos eventos legítimos con UID
    // distinto pero una línea `UID:` vacía inyectada al final colisionarían
    // trivialmente entre sí (mismo UID "").
    expect(resultado.eventos[0]!.uid).toBe("");
  });
});

describe("H8 (NO reproducible) — bomba de expansión RRULE", () => {
  it("RRULE no se implementa: el parser jamás lee ni expande esta propiedad (construirVEvent solo extrae UID/DTSTAMP/DTSTART/DTEND/DURATION/SEQUENCE/LAST-MODIFIED/STATUS/SUMMARY) — un VEVENT con RRULE de decenas de miles de ocurrencias produce exactamente 1 VEventNormalizado, igual que sin RRULE", () => {
    const feed = feedConEvento(
      "RRULE:FREQ=SECONDLY;COUNT=999999999\r\nDTEND;VALUE=DATE:20270102\r\n",
    );
    const resultado = parsearIcs(feed);
    expect(resultado.eventos).toHaveLength(1);
  });
});

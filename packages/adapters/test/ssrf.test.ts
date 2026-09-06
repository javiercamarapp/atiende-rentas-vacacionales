import { describe, expect, it } from "vitest";
import { validarIpPermitida, validarTodasLasIps, redactarUrlParaLog } from "../src/net/ssrf.js";
import { fetchIcsSeguro } from "../src/net/fetchSsrf.js";
import { SsrfError } from "../src/net/ssrf.js";

describe("validarIpPermitida — RV19-R-01/02, caso adversarial 20", () => {
  const bloqueadas = [
    ["169.254.169.254", "metadata AWS/GCP/Azure"],
    ["127.0.0.1", "loopback IPv4"],
    ["10.0.0.5", "RFC1918 10/8"],
    ["172.16.5.1", "RFC1918 172.16/12"],
    ["192.168.1.1", "RFC1918 192.168/16"],
    ["0.0.0.0", "0.0.0.0/8"],
    ["224.0.0.1", "multicast"],
    ["::1", "loopback IPv6"],
    ["fe80::1", "link-local IPv6"],
    ["fc00::1", "unique-local IPv6"],
    ["ff02::1", "multicast IPv6"],
  ] as const;

  it.each(bloqueadas)("rechaza %s (%s)", (ip) => {
    expect(validarIpPermitida(ip).permitida).toBe(false);
  });

  it("permite una IP pública normal", () => {
    expect(validarIpPermitida("93.184.216.34").permitida).toBe(true);
  });

  // Regresión permanente S-01 (auditoría-2, docs/auditoria-2/seguridad.md):
  // toda IPv6 que codifica una IPv4 (mapeada, NAT64, compatible-deprecada,
  // en cualquier representación textual) debe revalidarse contra el
  // deny-list IPv4 completo, no solo contra los patrones IPv6 puros.
  const ipv4MapeadasQueDebenBloquearse = [
    ["::ffff:127.0.0.1", "loopback vía mapeo dotted-quad"],
    ["::ffff:169.254.169.254", "metadata cloud vía mapeo dotted-quad"],
    ["::ffff:10.0.0.1", "RFC1918 vía mapeo dotted-quad"],
    ["0:0:0:0:0:ffff:7f00:1", "loopback vía mapeo hexadecimal completo (127.0.0.1)"],
    ["::FFFF:127.0.0.1", "loopback vía mapeo con mayúsculas"],
    ["64:ff9b::7f00:1", "loopback vía NAT64 Well-Known Prefix (127.0.0.1)"],
    ["::127.0.0.1", "loopback vía IPv4-compatible deprecada"],
  ] as const;

  it.each(ipv4MapeadasQueDebenBloquearse)("rechaza %s (%s) — S-01", (ip) => {
    expect(validarIpPermitida(ip).permitida).toBe(false);
  });

  it("permite una IPv4-mapeada que resuelve a una IP pública normal (no bloquea de más)", () => {
    expect(validarIpPermitida("::ffff:93.184.216.34").permitida).toBe(true);
  });

  it("validarTodasLasIps es fail-closed: una sola IP peligrosa rechaza todo el conjunto", () => {
    const resultado = validarTodasLasIps(["93.184.216.34", "169.254.169.254"]);
    expect(resultado.permitida).toBe(false);
  });

  it("rechaza cuando la resolución DNS no devuelve ninguna IP", () => {
    expect(validarTodasLasIps([]).permitida).toBe(false);
  });
});

describe("redactarUrlParaLog", () => {
  it("nunca incluye credenciales ni query string en el log", () => {
    const redactado = redactarUrlParaLog("https://usuario:secreto@canal.com/feed.ics?token=abc123");
    expect(redactado).not.toContain("secreto");
    expect(redactado).not.toContain("abc123");
    expect(redactado).toBe("https://canal.com/feed.ics?<redactado>");
  });
});

describe("fetchIcsSeguro — rechazo ANTES de cualquier conexión de red saliente", () => {
  it("rechaza esquema no-https sin resolverPersonalizado ni flag de simulador", async () => {
    await expect(
      fetchIcsSeguro({ url: "http://ejemplo-real.com/feed.ics", timeoutMs: 500 }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it("rechaza IP de metadata cloud resuelta vía resolverPersonalizado, sin llegar a abrir socket", async () => {
    let seLlamoResolver = false;
    await expect(
      fetchIcsSeguro({
        url: "https://feed-malicioso.example/x.ics",
        timeoutMs: 500,
        resolverPersonalizado: () => {
          seLlamoResolver = true;
          return ["169.254.169.254"];
        },
      }),
    ).rejects.toBeInstanceOf(SsrfError);
    expect(seLlamoResolver).toBe(true);
  });

  it("rechaza rango privado RFC1918 resuelto para un host arbitrario", async () => {
    await expect(
      fetchIcsSeguro({
        url: "https://interno.example/x.ics",
        timeoutMs: 500,
        resolverPersonalizado: () => ["10.0.0.5"],
      }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it("rechaza localhost/loopback IPv6 resuelto para un host arbitrario", async () => {
    await expect(
      fetchIcsSeguro({
        url: "https://interno.example/x.ics",
        timeoutMs: 500,
        resolverPersonalizado: () => ["::1"],
      }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it("rechaza URL con credenciales embebidas antes de resolver DNS", async () => {
    let seLlamoResolver = false;
    await expect(
      fetchIcsSeguro({
        url: "https://usuario:secreto@canal.com/feed.ics",
        timeoutMs: 500,
        resolverPersonalizado: () => {
          seLlamoResolver = true;
          return ["93.184.216.34"];
        },
      }),
    ).rejects.toBeInstanceOf(SsrfError);
    expect(seLlamoResolver).toBe(false);
  });

  it("http hacia simulador.local se rechaza si NO se pasa el flag de dev explícito", async () => {
    await expect(
      fetchIcsSeguro({
        url: "http://simulador.local:9999/feed.ics",
        timeoutMs: 500,
        resolverPersonalizado: () => ["127.0.0.1"],
      }),
    ).rejects.toBeInstanceOf(SsrfError);
  });
});

/**
 * Guardas SSRF puras (H-024, REQ-030, RV19-R-01/R-02, ACEPTACION caso
 * adversarial 20). Sin IO: solo deciden si una IP/URL está permitida.
 * `fetchSsrf.ts` es quien las invoca ANTES de abrir cualquier socket.
 */

export type MotivoRechazoSsrf =
  | "esquema_no_permitido"
  | "credenciales_en_url"
  | "ip_bloqueada"
  | "resolucion_dns_vacia"
  | "demasiadas_redirecciones";

export class SsrfError extends Error {
  readonly motivo: MotivoRechazoSsrf;
  constructor(motivo: MotivoRechazoSsrf, mensaje: string) {
    super(mensaje);
    this.name = "SsrfError";
    this.motivo = motivo;
  }
}

/** Convierte una IPv4 en un entero de 32 bits para comparación de rangos. */
function ipv4AEntero(ip: string): number | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  let n = 0;
  for (const parte of partes) {
    const octeto = Number(parte);
    if (!Number.isInteger(octeto) || octeto < 0 || octeto > 255) return null;
    n = (n << 8) | octeto;
  }
  return n >>> 0;
}

function enRangoIpv4(ip: string, base: string, bits: number): boolean {
  const ipNum = ipv4AEntero(ip);
  const baseNum = ipv4AEntero(base);
  if (ipNum === null || baseNum === null) return false;
  const mascara = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mascara) === (baseNum & mascara);
}

// RV19-R-01/R-02, OWASP SSRF Prevention Cheat Sheet (cita literal en
// docs/investigacion/RV19-seguridad-privacidad-legal.md §"Controles
// requeridos"): metadata cloud + todos los rangos privados/loopback/
// link-local IPv4.
const RANGOS_BLOQUEADOS_IPV4: Array<{ base: string; bits: number; motivo: string }> = [
  { base: "127.0.0.0", bits: 8, motivo: "loopback" },
  { base: "0.0.0.0", bits: 8, motivo: "reservado (0.0.0.0/8)" },
  { base: "10.0.0.0", bits: 8, motivo: "privado RFC1918" },
  { base: "172.16.0.0", bits: 12, motivo: "privado RFC1918" },
  { base: "192.168.0.0", bits: 16, motivo: "privado RFC1918" },
  { base: "169.254.0.0", bits: 16, motivo: "link-local / metadata cloud (169.254.169.254 incluido)" },
  { base: "224.0.0.0", bits: 4, motivo: "multicast" },
  { base: "100.64.0.0", bits: 10, motivo: "CGNAT compartido (RFC 6598)" },
];

function normalizarIpv6(ip: string): string {
  return ip.toLowerCase().replace(/^::ffff:/, "");
}

function ipv6EsLoopbackOULinkLocalOULocalUnica(ip: string): { bloqueada: boolean; motivo?: string } {
  const norm = normalizarIpv6(ip);
  if (norm === "::1") return { bloqueada: true, motivo: "loopback IPv6" };
  if (norm === "::") return { bloqueada: true, motivo: "IPv6 no especificada" };
  if (/^fe[89ab][0-9a-f]:/i.test(norm)) return { bloqueada: true, motivo: "link-local IPv6 (fe80::/10)" };
  if (/^f[cd][0-9a-f]{2}:/i.test(norm)) return { bloqueada: true, motivo: "unique-local IPv6 (fc00::/7)" };
  if (/^ff/i.test(norm)) return { bloqueada: true, motivo: "multicast IPv6 (ff00::/8)" };
  return { bloqueada: false };
}

export interface ResultadoValidacionIp {
  permitida: boolean;
  motivo?: string;
}

/** Valida una única IP (v4 o v6) ya resuelta contra la deny-list completa
 * de RV19-R-01/02: metadata cloud, loopback, link-local, RFC1918,
 * multicast, unique-local IPv6. */
export function validarIpPermitida(ip: string): ResultadoValidacionIp {
  const esIpv4 = ip.includes(".") && !ip.includes(":");
  if (esIpv4) {
    for (const rango of RANGOS_BLOQUEADOS_IPV4) {
      if (enRangoIpv4(ip, rango.base, rango.bits)) {
        return { permitida: false, motivo: rango.motivo };
      }
    }
    return { permitida: true };
  }
  const resultado = ipv6EsLoopbackOULinkLocalOULocalUnica(ip);
  if (resultado.bloqueada) return { permitida: false, motivo: resultado.motivo };
  return { permitida: true };
}

/** Valida un conjunto completo de IPs resueltas para un mismo hostname:
 * fail-closed — basta con que UNA sea peligrosa para rechazar la conexión
 * completa (evita elegir selectivamente la IP "buena" de una respuesta DNS
 * mixta, un vector de DNS rebinding). */
export function validarTodasLasIps(ips: readonly string[]): ResultadoValidacionIp {
  if (ips.length === 0) return { permitida: false, motivo: "resolución DNS sin resultados" };
  for (const ip of ips) {
    const r = validarIpPermitida(ip);
    if (!r.permitida) return r;
  }
  return { permitida: true };
}

/** Elimina credenciales (`user:pass@`) de una URL antes de loguearla —
 * nunca se registran credenciales en logs (H-024, requisito explícito del
 * encargo). También colapsa la query string para no filtrar tokens de
 * canal embebidos como parámetro. */
export function redactarUrlParaLog(url: string): string {
  try {
    const u = new URL(url);
    const query = u.search ? "?<redactado>" : "";
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}${query}`;
  } catch {
    return "<url-invalida-no-logueada>";
  }
}

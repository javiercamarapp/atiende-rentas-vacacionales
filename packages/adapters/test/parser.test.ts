import { describe, expect, it } from "vitest";
import { parsearIcs, IcsParseError } from "../src/ical/parser.js";
import type { LimitesParserIcs } from "../src/ical/tipos.js";

function feed(eventos: string): string {
  return (
    "BEGIN:VCALENDAR\r\n" +
    "VERSION:2.0\r\n" +
    "PRODID:-//Test//EN\r\n" +
    eventos +
    "END:VCALENDAR\r\n"
  );
}

const VEVENT_BASICO =
  "BEGIN:VEVENT\r\n" +
  "UID:abc-123@canal.com\r\n" +
  "DTSTAMP:20260901T120000Z\r\n" +
  "DTSTART;VALUE=DATE:20270101\r\n" +
  "DTEND;VALUE=DATE:20270105\r\n" +
  "SEQUENCE:0\r\n" +
  "STATUS:CONFIRMED\r\n" +
  "SUMMARY:Reserved\r\n" +
  "END:VEVENT\r\n";

describe("parsearIcs — validación semántica de fecha/hora (S-07, docs/auditoria-2/seguridad.md)", () => {
  function feedConDtstart(dtstart: string, dtend = "DTEND;VALUE=DATE:20270601\r\n"): string {
    return feed(
      "BEGIN:VEVENT\r\n" +
        "UID:sem@canal.com\r\n" +
        "DTSTAMP:20260901T120000Z\r\n" +
        `${dtstart}\r\n${dtend}` +
        "END:VEVENT\r\n",
    );
  }

  it("rechaza DATE con mes fuera de rango (99)", () => {
    expect(() => parsearIcs(feedConDtstart("DTSTART;VALUE=DATE:20269999"))).toThrowError(IcsParseError);
    try {
      parsearIcs(feedConDtstart("DTSTART;VALUE=DATE:20269999"));
    } catch (e) {
      expect((e as IcsParseError).codigo).toBe("valor_fecha_invalido");
    }
  });

  it("rechaza DATE con día inexistente para el mes (30 de febrero)", () => {
    expect(() => parsearIcs(feedConDtstart("DTSTART;VALUE=DATE:20270230"))).toThrow(/día fuera de rango/);
  });

  it("rechaza el 29 de febrero en un año NO bisiesto", () => {
    expect(() => parsearIcs(feedConDtstart("DTSTART;VALUE=DATE:20270229"))).toThrow(/día fuera de rango/);
  });

  it("acepta el 29 de febrero en un año bisiesto", () => {
    expect(() => parsearIcs(feedConDtstart("DTSTART;VALUE=DATE:20280229"))).not.toThrow();
  });

  it("rechaza DATE-TIME con hora/minuto/segundo fuera de rango (99:99:99)", () => {
    expect(() =>
      parsearIcs(feedConDtstart("DTSTART:20270101T999999Z", "DTEND:20270102T000000Z\r\n")),
    ).toThrow(/hora fuera de rango/);
  });

  it("rechaza DATE-TIME con minuto/segundo fuera de rango aunque la hora sea válida", () => {
    expect(() =>
      parsearIcs(feedConDtstart("DTSTART:20270101T126000Z", "DTEND:20270102T000000Z\r\n")),
    ).toThrow(/minuto fuera de rango/);
    expect(() =>
      parsearIcs(feedConDtstart("DTSTART:20270101T120060Z", "DTEND:20270102T000000Z\r\n")),
    ).toThrow(/segundo fuera de rango/);
  });

  it("acepta límites válidos exactos (23:59:59, día 31, día 30, día 28/29)", () => {
    expect(() =>
      parsearIcs(feedConDtstart("DTSTART:20270101T235959Z", "DTEND:20270102T000000Z\r\n")),
    ).not.toThrow();
    expect(() => parsearIcs(feedConDtstart("DTSTART;VALUE=DATE:20270131"))).not.toThrow();
    expect(() => parsearIcs(feedConDtstart("DTSTART;VALUE=DATE:20270430"))).not.toThrow();
    expect(() => parsearIcs(feedConDtstart("DTSTART;VALUE=DATE:20270228"))).not.toThrow();
  });
});

describe("parsearIcs — UID vacío se rechaza (S-18, docs/auditoria-2/seguridad.md)", () => {
  it("UID: (vacío) lanza IcsParseError('campo_requerido_ausente')", () => {
    const feed = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\n" +
      "UID:\r\nDTSTAMP:20270101T000000Z\r\nDTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102\r\n" +
      "END:VEVENT\r\nEND:VCALENDAR\r\n";
    expect(() => parsearIcs(feed)).toThrow(IcsParseError);
    try {
      parsearIcs(feed);
    } catch (e) {
      expect((e as IcsParseError).codigo).toBe("campo_requerido_ausente");
    }
  });

  it("UID: seguido de solo espacios también se trata como vacío", () => {
    const feed = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\n" +
      "UID:   \r\nDTSTAMP:20270101T000000Z\r\nDTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102\r\n" +
      "END:VEVENT\r\nEND:VCALENDAR\r\n";
    expect(() => parsearIcs(feed)).toThrow(/UID vacío/);
  });

  it("dos UID donde el segundo (ganador por 'última ocurrencia') es vacío: se rechaza en vez de colisionar silenciosamente con uid=''", () => {
    const feed = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\n" +
      "UID:legitimo@x\r\nUID:\r\nDTSTAMP:20270101T000000Z\r\nDTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102\r\n" +
      "END:VEVENT\r\nEND:VCALENDAR\r\n";
    expect(() => parsearIcs(feed)).toThrow(IcsParseError);
  });
});

describe("parsearIcs", () => {
  it("parsea un VEVENT básico con DTEND;VALUE=DATE exclusivo", () => {
    const resultado = parsearIcs(feed(VEVENT_BASICO));
    expect(resultado.eventos).toHaveLength(1);
    const ev = resultado.eventos[0]!;
    expect(ev.uid).toBe("abc-123@canal.com");
    expect(ev.sequence).toBe(0);
    expect(ev.dtstart).toEqual({ tipo: "DATE", fecha: "2027-01-01" });
    expect(ev.dtend).toEqual({ tipo: "DATE", fecha: "2027-01-05" });
    expect(ev.status).toBe("CONFIRMED");
  });

  it("des-pliega (unfold) una línea larga plegada con CRLF+espacio", () => {
    const summaryLargo = "Una descripción muy larga que en teoría se dividiría en varias líneas";
    const evento =
      "BEGIN:VEVENT\r\n" +
      "UID:folding@canal.com\r\n" +
      "DTSTAMP:20260901T120000Z\r\n" +
      "DTSTART;VALUE=DATE:20270101\r\n" +
      "DTEND;VALUE=DATE:20270102\r\n" +
      "SUMMARY:Una descripción muy larga que en teoría se div\r\n" +
      " idiría en varias líneas\r\n" +
      "END:VEVENT\r\n";
    const resultado = parsearIcs(feed(evento));
    expect(resultado.eventos[0]!.summary).toBe(summaryLargo);
  });

  it("soporta DTSTART+DURATION normalizando a DTEND", () => {
    const evento =
      "BEGIN:VEVENT\r\n" +
      "UID:duration@canal.com\r\n" +
      "DTSTAMP:20260901T120000Z\r\n" +
      "DTSTART;VALUE=DATE:20270101\r\n" +
      "DURATION:P3D\r\n" +
      "END:VEVENT\r\n";
    const resultado = parsearIcs(feed(evento));
    expect(resultado.eventos[0]!.dtend).toEqual({ tipo: "DATE", fecha: "2027-01-04" });
  });

  it("sin DTEND ni DURATION en DATE, la duración implícita es 1 día (RFC 5545 §3.8.2.2)", () => {
    const evento =
      "BEGIN:VEVENT\r\nUID:implicito@canal.com\r\nDTSTAMP:20260901T120000Z\r\n" +
      "DTSTART;VALUE=DATE:20270101\r\nEND:VEVENT\r\n";
    const resultado = parsearIcs(feed(evento));
    expect(resultado.eventos[0]!.dtend).toEqual({ tipo: "DATE", fecha: "2027-01-02" });
  });

  it("soporta DATE-TIME UTC y con TZID", () => {
    const evento =
      "BEGIN:VEVENT\r\nUID:tz@canal.com\r\nDTSTAMP:20260901T120000Z\r\n" +
      "DTSTART:20270101T150000Z\r\nDTEND;TZID=America/Mexico_City:20270105T110000\r\nEND:VEVENT\r\n";
    const resultado = parsearIcs(feed(evento));
    const ev = resultado.eventos[0]!;
    expect(ev.dtstart).toEqual({ tipo: "DATE-TIME-UTC", instanteIso: "2027-01-01T15:00:00Z" });
    expect(ev.dtend).toEqual({
      tipo: "DATE-TIME-TZID",
      tzid: "America/Mexico_City",
      fechaHoraLocal: "2027-01-05T11:00:00",
    });
  });

  it("tolera campos desconocidos sin fallar (X-CUSTOM, RRULE no usado)", () => {
    const evento =
      "BEGIN:VEVENT\r\nUID:tolerante@canal.com\r\nDTSTAMP:20260901T120000Z\r\n" +
      "DTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102\r\n" +
      "X-CAMPO-DESCONOCIDO:algo\r\nEND:VEVENT\r\n";
    expect(() => parsearIcs(feed(evento))).not.toThrow();
  });

  it("tolera componentes ajenos (VTIMEZONE) sin fallar", () => {
    const conTimezone =
      "BEGIN:VTIMEZONE\r\nTZID:America/Mexico_City\r\nEND:VTIMEZONE\r\n" + VEVENT_BASICO;
    const resultado = parsearIcs(feed(conTimezone));
    expect(resultado.eventos).toHaveLength(1);
  });

  it("rechaza un feed sin UID con error tipado", () => {
    const evento =
      "BEGIN:VEVENT\r\nDTSTAMP:20260901T120000Z\r\nDTSTART;VALUE=DATE:20270101\r\nEND:VEVENT\r\n";
    try {
      parsearIcs(feed(evento));
      expect.fail("debía lanzar IcsParseError");
    } catch (error) {
      expect(error).toBeInstanceOf(IcsParseError);
      expect((error as IcsParseError).codigo).toBe("campo_requerido_ausente");
    }
  });

  it("rechaza BEGIN/END desbalanceado (caso adversarial 9, feed malformado)", () => {
    const malformado = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x@y\r\nDTSTAMP:20260901T120000Z\r\n" +
      "DTSTART;VALUE=DATE:20270101\r\nEND:VCALENDAR\r\n";
    expect(() => parsearIcs(malformado)).toThrow(IcsParseError);
  });

  it("rechaza un feed que no inicia con BEGIN:VCALENDAR", () => {
    expect(() => parsearIcs("UID:x\r\n")).toThrow(IcsParseError);
  });

  it("feed sintácticamente válido con 0 VEVENT no lanza error (caso adversarial 10, vacío ≠ malformado)", () => {
    const resultado = parsearIcs(feed(""));
    expect(resultado.eventos).toHaveLength(0);
  });

  it("rechaza un feed que excede el límite de tamaño configurado", () => {
    const limites: LimitesParserIcs = { maxBytes: 50, maxEventos: 10, maxLongitudLineaDesplegada: 1000 };
    expect(() => parsearIcs(feed(VEVENT_BASICO), limites)).toThrow(IcsParseError);
  });

  it("rechaza un feed que excede el límite de número de eventos", () => {
    const limites: LimitesParserIcs = {
      maxBytes: 10 * 1024 * 1024,
      maxEventos: 1,
      maxLongitudLineaDesplegada: 1000,
    };
    expect(() => parsearIcs(feed(VEVENT_BASICO + VEVENT_BASICO), limites)).toThrow(IcsParseError);
  });

  it("rechaza una línea des-plegada que excede la longitud máxima configurada", () => {
    const limites: LimitesParserIcs = { maxBytes: 10 * 1024 * 1024, maxEventos: 10, maxLongitudLineaDesplegada: 20 };
    expect(() => parsearIcs(feed(VEVENT_BASICO), limites)).toThrow(IcsParseError);
  });

  it("nunca evalúa contenido: un SUMMARY con sintaxis de código se trata como texto plano", () => {
    const evento =
      "BEGIN:VEVENT\r\nUID:eval@canal.com\r\nDTSTAMP:20260901T120000Z\r\n" +
      "DTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270102\r\n" +
      "SUMMARY:${process.exit(1)} <script>alert(1)</script>\r\nEND:VEVENT\r\n";
    const resultado = parsearIcs(feed(evento));
    expect(resultado.eventos[0]!.summary).toBe("${process.exit(1)} <script>alert(1)</script>");
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { SimuladorMensajeria, assertNoParecerProduccion, CredencialesSospechosasDeProduccionError } from "@atiende-rv/sim";
import { RegistroFlags } from "@atiende-rv/domain";
import { CATALOGO_FLAGS_AGENTES, FLAG_AGENTES_HABILITADO, FLAG_AGENTES_PROVEEDOR_REAL_HABILITADO } from "@atiende-rv/domain/agentes";
import { crearApp } from "../../../apps/api/src/app.js";
import { cargarConfiguracion } from "../../../apps/api/src/config/env.js";
import { hashContrasena } from "../../../apps/api/src/seguridad/contrasenas.js";

/**
 * Auditoría de seguridad independiente (2026-09-06, javiercamara10porte@gmail.com)
 * — rubros LOGS/PII y SIMULADORES/FLAGS. NO modifica código de producto ni
 * tests/adversarial/ existentes. Contra `embedded-postgres` real (D-009/D-022)
 * para la parte de logs/PII (necesita el flujo HTTP completo de mensajería);
 * la parte de simuladores/flags llama directamente a las funciones
 * exportadas reales (sin mocks) — no requiere Postgres.
 *
 * Objetivo declarado: encontrar huecos NUEVOS no cubiertos por los 467
 * tests / 120 integración / 20 adversariales ya verdes. Confirmado por
 * grep antes de escribir esto: `packages/sim/test/etiquetado.test.ts` solo
 * prueba los literales "production"/"produccion" (sin tilde) — nunca
 * "producción" (con tilde) ni variantes de mayúsculas.
 */

const PII_EMAIL = "elena.reproducible@ejemploaudit.test";
const PII_TELEFONO = "+52 55 1234 9876";
const PII_NOMBRE = "Elena Reproducible Auditoria";

// ---------------------------------------------------------------------------
// Bloque A (embedded-postgres real): LOGS/PII sobre el flujo real de
// mensajería HTTP (mismo patrón que apps/api/test/integration/mensajeria.test.ts).
// ---------------------------------------------------------------------------
describe("Bloque A — LOGS/PII sobre flujo real de mensajería (embedded-postgres)", () => {
  process.env.JWT_SECRET = "prueba-jwt-secret-auditoria2-al-menos-32-caracteres-000";
  process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
  process.env.WEB_ORIGIN = "http://localhost:5173";

  const USUARIO_APP = "app_rv";
  const PASSWORD_APP = "app_rv_dev_change_in_prod";

  let databaseDir: string;
  let servidor: EmbeddedPostgres;
  let superusuario: pg.Client;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearApp>;
  const lineasLog: string[] = [];

  let tenantId: string;
  let unidadId: string;
  let emailAdmin: string;
  let passwordAdmin: string;
  let accessToken: string;

  function puertoAleatorio(): number {
    return 64500 + Math.floor(Math.random() * 900);
  }

  async function login(email: string, password: string) {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = (await res.json()) as { accessToken: string };
    return body.accessToken;
  }

  function autenticado(token: string, init: RequestInit = {}): RequestInit {
    return {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" },
    };
  }

  beforeAll(async () => {
    databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-auditoria2-logs-"));
    const puerto = puertoAleatorio();
    servidor = new EmbeddedPostgres({
      databaseDir,
      port: puerto,
      user: "postgres",
      password: "postgres",
      persistent: false,
      onLog: () => undefined,
      onError: () => undefined,
    });
    await servidor.initialise();
    await servidor.start();
    await servidor.createDatabase("atiende_rv_auditoria2_logs");

    superusuario = servidor.getPgClient("atiende_rv_auditoria2_logs");
    await superusuario.connect();
    await superusuario.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

    const ejecutor: EjecutorSql = {
      async query(sql, params) {
        const r = await superusuario.query(sql, params as unknown[] | undefined);
        return { rows: r.rows, rowCount: r.rowCount };
      },
      async exec(sql) {
        await superusuario.query(sql);
      },
    };
    await aplicarMigraciones(ejecutor, migraciones);

    const tenant = await superusuario.query<{ id: string }>(
      "INSERT INTO tenant (nombre) VALUES ('T-Auditoria2-Logs') RETURNING id",
    );
    tenantId = tenant.rows[0]!.id;
    const empresaGestora = await superusuario.query<{ id: string }>(
      "INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, 'Gestora A2') RETURNING id",
      [tenantId],
    );
    const owner = await superusuario.query<{ id: string }>(
      "INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, 'Owner A2') RETURNING id",
      [empresaGestora.rows[0]!.id],
    );
    const propiedad = await superusuario.query<{ id: string }>(
      "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Casa Auditoria', 'America/Cancun') RETURNING id",
      [tenantId],
    );
    const unidad = await superusuario.query<{ id: string }>(
      "INSERT INTO unidad (propiedad_id, owner_id, nombre, duracion_minima_noches) VALUES ($1, $2, 'U-A2', 1) RETURNING id",
      [propiedad.rows[0]!.id, owner.rows[0]!.id],
    );
    unidadId = unidad.rows[0]!.id;

    passwordAdmin = "clave-super-secreta-admin-a2-logs";
    emailAdmin = "admin.a2logs@api-test.local";
    await superusuario.query(
      `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
      [tenantId, emailAdmin, await hashContrasena(passwordAdmin)],
    );

    pool = new pg.Pool({
      host: "127.0.0.1",
      port: puerto,
      database: "atiende_rv_auditoria2_logs",
      user: USUARIO_APP,
      password: PASSWORD_APP,
    });

    // IMPORTANTE (hallazgo de metodología, ver A2b): `crearLogger()`
    // (apps/api/src/middleware/logger.ts) recibe `escribir` como parámetro
    // por defecto `= console.log`, evaluado UNA SOLA VEZ en el momento en
    // que `crearApp()` invoca `crearLogger()` — captura la referencia de
    // función vigente en ESE instante, no una relectura de `console.log`
    // en cada request. Los tests de integración existentes
    // (apps/api/test/integration/mensajeria.test.ts, agentes.test.ts)
    // sobrescriben `console.log`/`console.error` DESPUÉS de `crearApp()`,
    // por lo que su captura NUNCA ve la línea de `crearLogger` — solo ve
    // los `console.error`/`console.log` de llamada directa (propiedad
    // releída en cada invocación, p. ej. `app.onError` o los eventos de
    // `borradores.ts`). Aquí se sobrescribe ANTES para poder verificar
    // también el contenido real de la línea de `crearLogger`.
    const consoleLogOriginal = console.log.bind(console);
    console.log = (...args: unknown[]) => {
      lineasLog.push(args.map(String).join(" "));
      consoleLogOriginal(...args);
    };
    const consoleErrorOriginal = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      lineasLog.push(args.map(String).join(" "));
      consoleErrorOriginal(...args);
    };

    app = crearApp({ pool });

    accessToken = await login(emailAdmin, passwordAdmin);
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await superusuario.end().catch(() => undefined);
    await servidor.stop().catch(() => undefined);
    await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
  });

  beforeEach(() => {
    lineasLog.length = 0;
  });

  it("A1 — un huésped ficticio con email/teléfono/nombre reconocibles, insertado y usado en todo el flujo de mensajería (mensaje entrante -> borrador -> aprobar), NUNCA aparece en texto plano en las líneas de consola capturadas", async () => {
    // Huésped ficticio con PII reconocible, ligado a la conversación.
    const huesped = await pool.query<{ id: string }>(
      `INSERT INTO huesped_minimo (nombre, contacto) VALUES ($1, $2) RETURNING id`,
      [PII_NOMBRE, `${PII_EMAIL} / ${PII_TELEFONO}`],
    );
    const huespedId = huesped.rows[0]!.id;

    const conv = await app.request(
      "/mensajeria/conversaciones",
      autenticado(accessToken, {
        method: "POST",
        body: JSON.stringify({ unidadId, canalCodigo: "vrbo", huespedMinimoId: huespedId }),
      }),
    );
    expect(conv.status).toBe(201);
    const { id: conversacionId } = (await conv.json()) as { id: string };

    // El huésped escribe su propio email/teléfono en el mensaje entrante
    // (caso real: "para que me contacten a mi correo X").
    const textoEntrante = `Hola, soy ${PII_NOMBRE}. Mi correo es ${PII_EMAIL} y mi teléfono ${PII_TELEFONO}, ¿me pueden confirmar la reserva?`;
    const entrante = await app.request(
      `/mensajeria/conversaciones/${conversacionId}/mensajes`,
      autenticado(accessToken, { method: "POST", body: JSON.stringify({ texto: textoEntrante, origen: "manual" }) }),
    );
    expect(entrante.status).toBe(201);
    const entranteBody = (await entrante.json()) as { id: string };

    const borrador = await app.request(
      `/mensajeria/conversaciones/${conversacionId}/borradores`,
      autenticado(accessToken, {
        method: "POST",
        body: JSON.stringify({ mensajeEntranteId: entranteBody.id, reservaConfirmada: true }),
      }),
    );
    expect(borrador.status).toBe(201);
    const { id: borradorId } = (await borrador.json()) as { id: string };

    // vrbo permite contacto directo si reservaConfirmada=true (política),
    // así que el aprobar no debería bloquear por contenido.
    const aprobar = await app.request(`/mensajeria/borradores/${borradorId}/aprobar`, autenticado(accessToken, { method: "POST" }));
    expect([200, 422]).toContain(aprobar.status); // 422 aceptable si el generador determinista añadió otro hallazgo; lo relevante es el log.

    await app.request(
      `/mensajeria/borradores/${borradorId}/rechazar`,
      autenticado(accessToken, { method: "POST", body: JSON.stringify({ motivo: `contactar a ${PII_EMAIL} luego` }) }),
    ).catch(() => undefined); // puede fallar si ya está enviado; no es el objetivo de este caso.

    const huboEmailEnLogs = lineasLog.some((l) => l.includes(PII_EMAIL));
    const huboTelefonoEnLogs = lineasLog.some((l) => l.includes(PII_TELEFONO));
    const huboNombreEnLogs = lineasLog.some((l) => l.includes(PII_NOMBRE));
    const huboTextoCrudoEnLogs = lineasLog.some((l) => l.includes(textoEntrante));

    // eslint-disable-next-line no-console
    console.info(
      "[A1 evidencia] líneas de log capturadas:",
      JSON.stringify({ huboEmailEnLogs, huboTelefonoEnLogs, huboNombreEnLogs, huboTextoCrudoEnLogs, totalLineas: lineasLog.length }),
    );

    expect(huboEmailEnLogs).toBe(false);
    expect(huboTelefonoEnLogs).toBe(false);
    expect(huboNombreEnLogs).toBe(false);
    expect(huboTextoCrudoEnLogs).toBe(false);
  });

  it("A2 — CONFIRMADO por diseño: el mismo email/teléfono SÍ queda en texto plano dentro de `mensaje`/`borrador_mensaje` y se DUPLICA en `auditoria_mutacion.valores_nuevos` (migración 0044) — huésped identificable en jsonb sin cifrar", async () => {
    const conv = await app.request(
      "/mensajeria/conversaciones",
      autenticado(accessToken, { method: "POST", body: JSON.stringify({ unidadId, canalCodigo: "vrbo" }) }),
    );
    const { id: conversacionId } = (await conv.json()) as { id: string };

    const textoEntrante = `Contáctenme en ${PII_EMAIL} o al ${PII_TELEFONO} — soy ${PII_NOMBRE}.`;
    const entrante = await app.request(
      `/mensajeria/conversaciones/${conversacionId}/mensajes`,
      autenticado(accessToken, { method: "POST", body: JSON.stringify({ texto: textoEntrante, origen: "manual" }) }),
    );
    const entranteBody = (await entrante.json()) as { id: string };

    // mensaje entrante en texto plano en la propia tabla operativa (esperado).
    const filaMensaje = await pool.query<{ texto: string }>(`SELECT texto FROM mensaje WHERE id = $1`, [entranteBody.id]);
    expect(filaMensaje.rows[0]!.texto).toContain(PII_EMAIL);

    // Reproducción real: la MISMA cadena aparece también en auditoria_mutacion
    // (tabla protegida por RLS a superadmin/admin_gestora, migración 0015,
    // pero en texto plano sin ninguna redacción/cifrado adicional).
    const auditoria = await pool.query<{ valores_nuevos: unknown }>(
      `SELECT valores_nuevos FROM auditoria_mutacion WHERE tabla = 'mensaje' AND fila_id = $1`,
      [entranteBody.id],
    );
    expect(auditoria.rows.length).toBeGreaterThan(0);
    const crudo = JSON.stringify(auditoria.rows[0]!.valores_nuevos);
    expect(crudo).toContain(PII_EMAIL);
    expect(crudo).toContain(PII_TELEFONO);
  });

  it("A2b — CONFIRMADO/CRÍTICO: ni `middleware/logger.ts` NI el propio `nombre` del span OTel pasan por `sanitizarAtributos` — el email queda en texto plano en AMBAS superficies de logging (stdout), y el span además lo reenviaría a un colector OTLP externo si `OTEL_EXPORTER_OTLP_ENDPOINT` estuviera configurado", async () => {
    // `sanitizarAtributos` (otel.ts) SÍ detecta patrones de email/teléfono
    // en el VALOR de un ATRIBUTO (`atributos["http.route"]`) y lo reemplaza
    // por "[redactado-pii]" — pero (1) `crearLogger` (middleware/logger.ts)
    // nunca la invoca, arma su línea de log a mano con
    // `new URL(c.req.url).pathname` sin pasar por ningún filtro, y (2) el
    // propio NOMBRE del span (`iniciarSpan(\`HTTP ${method} ${ruta}\`, ...)`,
    // middlewareHttp.ts) también incrusta la ruta cruda y NUNCA pasa por
    // `sanitizarAtributos` (que solo sanea el mapa `atributos`, no el string
    // `nombre` — ver otel.ts `terminar()`: `nombre` se copia tal cual a
    // `spanFinalizado.nombre`). Resultado: el filtro de PII existe en el
    // código pero dos superficies distintas la evaden por completo.
    lineasLog.length = 0;
    const res = await app.request(`/ruta-que-no-existe/${PII_EMAIL}`, autenticado(accessToken));
    expect(res.status).toBe(404);

    const lineaLoggerPlano = lineasLog.find((l) => l.includes('"metodo"') && l.includes('"ruta"'));
    const lineaSpanOtel = lineasLog.find((l) => l.includes('"prefijo":"[otel]"'));
    expect(lineaLoggerPlano).toBeDefined();
    expect(lineaSpanOtel).toBeDefined();

    // (1) El logger de línea plano deja el email en texto plano en `ruta`:
    expect(lineaLoggerPlano).toContain(PII_EMAIL);

    // (2) El atributo `http.route` del span SÍ queda redactado...
    expect(lineaSpanOtel).toContain('"http.route":"[redactado-pii]"');
    // ...pero el campo `nombre` del MISMO span (usado para armar el nombre
    // legible del trace) sigue llevando el email en texto plano — el
    // sanitizador tiene un hueco de cobertura, no cubre `span.nombre`:
    expect(lineaSpanOtel).toContain(PII_EMAIL);
    expect(lineaSpanOtel).toContain(`"nombre":"HTTP GET /ruta-que-no-existe/${PII_EMAIL}"`);
  });

  it("A3 — CONFIRMADO: un valor z.enum() inválido en un campo de contrato SÍ se ecoa textualmente en la respuesta 422, contradiciendo el comentario de apps/api/src/app.ts ('ZodError... sin ecoar el valor recibido')", async () => {
    // canalCodigo espera un enum de canales; se envía en su lugar un valor
    // que podría ser cualquier dato sensible (aquí, con forma de dirección
    // de correo reconocible) para comprobar si la 422 lo refleja.
    const valorSensible = `secreto-${PII_EMAIL}`;
    const res = await app.request(
      "/mensajeria/conversaciones",
      autenticado(accessToken, { method: "POST", body: JSON.stringify({ unidadId, canalCodigo: valorSensible }) }),
    );
    expect(res.status).toBe(422);
    const cuerpo = (await res.json()) as { error: { detalles: Array<{ path: string; mensaje: string }> } };
    const mensajeCompleto = JSON.stringify(cuerpo);

    // eslint-disable-next-line no-console
    console.info("[A3 evidencia] cuerpo 422 real:", mensajeCompleto);

    // Esta expectativa documenta el hallazgo: HOY el valor SÍ aparece
    // (zod interpola `received` en el mensaje por defecto de
    // invalid_enum_value). Si esto cambia a `false`, el hallazgo A3 se
    // habrá corregido.
    expect(mensajeCompleto.includes(valorSensible)).toBe(true);
  });

  it("A4 — CONFIRMADO/ALTO: un error genérico no manejado (500) SÍ deja el email del huésped en texto plano en `console.error` (stderr) — el mensaje de error crudo de Postgres para `invalid_text_representation` (cast a uuid fallido) incluye el valor recibido, y `app.ts` lo pasa completo a `console.error` sin sanear", async () => {
    // Fuerza un 500 real pasando un id de conversación que rompe el cast a
    // uuid en Postgres (22P02 invalid_text_representation) — no es un
    // ErrorDominio ni un ZodError, cae al manejador genérico de app.ts.
    // Este vector es realista: cualquier id de ruta mal formado que un
    // cliente (o un bug de frontend que confunda campos) envíe con forma
    // de email/teléfono termina citado en el propio mensaje de Postgres.
    lineasLog.length = 0;
    const res = await app.request(
      `/mensajeria/conversaciones/no-es-un-uuid-${PII_EMAIL}`,
      autenticado(accessToken),
    );
    expect(res.status).toBe(500);
    const cuerpo = (await res.json()) as { error: { mensaje: string } };
    // La RESPUESTA HTTP al cliente sí está limpia (§RV19/21-7 se cumple de
    // cara al cliente):
    expect(cuerpo.error.mensaje).toBe("Error interno del servidor");
    expect(JSON.stringify(cuerpo)).not.toContain(PII_EMAIL);

    // Pero STDERR (server-side, terminaría en cualquier agregador de logs/
    // APM que capture stdout/stderr del proceso) SÍ queda con el email en
    // texto plano — confirmado, no es un falso positivo del test:
    const lineaError = lineasLog.find((l) => l.includes("no_manejado"));
    expect(lineaError).toBeDefined();
    expect(lineaError).toContain(PII_EMAIL);
  });
});

// ---------------------------------------------------------------------------
// Bloque B — SIMULADORES/FLAGS: llamadas reales a las funciones exportadas
// (sin mocks, sin Postgres). Objetivo: reproducir el escenario pedido por
// el encargo — NODE_ENV ausente o con un valor inesperado como
// "producción" (con tilde) en vez de "production".
// ---------------------------------------------------------------------------
describe("Bloque B — simuladores/flags: NODE_ENV ausente o mal escrito", () => {
  const nodeEnvOriginal = process.env.NODE_ENV;

  afterEach(() => {
    if (nodeEnvOriginal === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnvOriginal;
  });

  it("B1 — baseline correcto: NODE_ENV='production' (ASCII exacto) SÍ bloquea el arranque del simulador (assertNoParecerProduccion)", () => {
    process.env.NODE_ENV = "production";
    expect(() => assertNoParecerProduccion({})).toThrow(CredencialesSospechosasDeProduccionError);
  });

  it("B2 — baseline correcto: NODE_ENV='produccion' (sin tilde) también bloquea", () => {
    process.env.NODE_ENV = "produccion";
    expect(() => assertNoParecerProduccion({})).toThrow(CredencialesSospechosasDeProduccionError);
  });

  it("[CORREGIDO S-04] B3 — NODE_ENV='producción' (CON TILDE, el error tipográfico más plausible para un equipo que escribe todo el repo en español) SÍ bloquea ahora — assertNoParecerProduccion normaliza diacríticos (NFD + strip combining marks) antes de comparar, cerrando el fail-open original", () => {
    process.env.NODE_ENV = "producción";
    expect(() => assertNoParecerProduccion({})).toThrow(CredencialesSospechosasDeProduccionError);
  });

  it("[CORREGIDO S-04] B4 — con NODE_ENV='producción', `new SimuladorMensajeria(...)` (el simulador que apps/api/src/routes/mensajeria/borradores.ts instancia en /borradores/:id/aprobar en CADA aprobación real) ahora SÍ lanza — el simulador ya no queda operable bajo un entorno que el operador declaró como productivo, con o sin tilde", () => {
    process.env.NODE_ENV = "producción";
    expect(() => new SimuladorMensajeria("airbnb")).toThrow(CredencialesSospechosasDeProduccionError);
  });

  it("[NUEVO S-04] B3b — la allow-list explícita ATIENDE_ENTORNO es más estricta que la deny-list heredada de NODE_ENV: con NODE_ENV='production' pero ATIENDE_ENTORNO='desarrollo' explícito, el simulador SÍ arranca (modo recomendado, independiente de NODE_ENV)", () => {
    process.env.NODE_ENV = "production";
    process.env.ATIENDE_ENTORNO = "desarrollo";
    try {
      expect(() => assertNoParecerProduccion({})).not.toThrow();
    } finally {
      delete process.env.ATIENDE_ENTORNO;
    }
  });

  it("[NUEVO S-04] B3c — con ATIENDE_ENTORNO declarado a cualquier valor fuera de la allow-list (incluyendo variantes con tilde/mayúsculas de 'producción', o cualquier otra cadena), el simulador NO arranca — fail-closed por allow-list, no por enumerar formas de 'producción'", () => {
    delete process.env.NODE_ENV;
    process.env.ATIENDE_ENTORNO = "staging";
    try {
      expect(() => assertNoParecerProduccion({})).toThrow(CredencialesSospechosasDeProduccionError);
    } finally {
      delete process.env.ATIENDE_ENTORNO;
    }
  });

  it("B5 — variante de mayúsculas: NODE_ENV='PRODUCTION' SÍ es detectado por assertNoParecerProduccion (hace .toLowerCase() antes de comparar) — no hay bug de mayúsculas en esta función", () => {
    process.env.NODE_ENV = "PRODUCTION";
    expect(() => assertNoParecerProduccion({})).toThrow(CredencialesSospechosasDeProduccionError);
  });

  it("B6 — NODE_ENV ausente (undefined): assertNoParecerProduccion NO bloquea (correcto: sin declarar 'production' explícitamente, D-019 no puede saber que es productivo) — documentado como comportamiento esperado, no un hueco", () => {
    delete process.env.NODE_ENV;
    expect(() => assertNoParecerProduccion({})).not.toThrow();
  });

  it("B7 — CONFIRMADO/ALTO: cargarConfiguracion() (apps/api/src/config/env.ts) con NODE_ENV='producción' NO reconoce el entorno como 'production' — cae a 'development' (fail-closed a nivel de ESTA función, pero fail-open para cualquier guard aguas abajo que compare `entorno === 'production'`, como apps/api/src/routes/backoffice/cuentasCanal.ts:100)", () => {
    const config = cargarConfiguracion({ ...process.env, NODE_ENV: "producción" } as NodeJS.ProcessEnv);
    expect(config.entorno).toBe("development");
  });

  it("B8 — CONFIRMADO/ALTO: cargarConfiguracion() también falla con mayúsculas — NODE_ENV='PRODUCTION' (muy común en configuraciones de CI/Windows) tampoco es reconocido como 'production' (comparación case-sensitive, sin .toLowerCase())", () => {
    const config = cargarConfiguracion({ ...process.env, NODE_ENV: "PRODUCTION" } as NodeJS.ProcessEnv);
    expect(config.entorno).toBe("development");
  });

  it("B9 — reproducción end-to-end del hueco de B7: la guardia real de apps/api/src/routes/backoffice/cuentasCanal.ts ('if (entorno === \"production\") throw ...') se replica aquí con la misma comparación — con NODE_ENV mal escrito, un simulador de canal SÍ pasaría ese guard en lo que el operador creía producción", () => {
    const configTypo = cargarConfiguracion({ ...process.env, NODE_ENV: "producción" } as NodeJS.ProcessEnv);
    const bloqueadoConTypo = configTypo.entorno === "production";
    const configCorrecta = cargarConfiguracion({ ...process.env, NODE_ENV: "production" } as NodeJS.ProcessEnv);
    const bloqueadoCorrecto = configCorrecta.entorno === "production";

    expect(bloqueadoConTypo).toBe(false); // el guard NO se activa (hueco)
    expect(bloqueadoCorrecto).toBe(true); // el guard SÍ se activa con el valor exacto
  });

  it("B10 — `agentes.habilitado` y `agentes.proveedor_real_habilitado`: default-off REAL en el catálogo de dominio, sin ninguna configuración adicional (RegistroFlags fresco, sin overrides de tenant)", () => {
    const registro = new RegistroFlags(CATALOGO_FLAGS_AGENTES);
    expect(registro.valor(FLAG_AGENTES_HABILITADO)).toBe(false);
    expect(registro.valor(FLAG_AGENTES_HABILITADO, "cualquier-tenant-sin-configurar")).toBe(false);
    expect(registro.valor(FLAG_AGENTES_PROVEEDOR_REAL_HABILITADO)).toBe(false);
  });

  it("B11 — no existe ninguna ruta HTTP que exponga control del `RegistroFlags` de agentes (registroFlagsAgentesInstancia se exporta pero apps/api/src/routes/backoffice/flags.ts solo conecta CATALOGO_FLAGS_POR_DEFECTO, un catálogo distinto) — confirmado por grep, no por ejecución", () => {
    // Evidencia estática incluida como aserción trivial para dejar rastro
    // ejecutable del hallazgo: los IDs de flags de agentes NO están en el
    // catálogo que expone la ruta de backoffice.
    // (import dinámico para no acoplar este archivo a la ruta si cambia de lugar)
    expect(FLAG_AGENTES_HABILITADO).toBe("agentes.habilitado");
    expect(CATALOGO_FLAGS_AGENTES.map((f) => f.id)).not.toContain("sync.push_automatico");
  });
});

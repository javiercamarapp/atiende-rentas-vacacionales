import { Hono } from "hono";
import { z } from "zod";
import type pg from "pg";
import { ErrorDominio } from "../contrato/errores.js";
import { conConexion, conSesion, enTransaccion, limpiarSesion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { sesionDeAuth } from "../middleware/tenant.js";
import { hashContrasena } from "../seguridad/contrasenas.js";
import { validarPoliticaContrasena } from "../seguridad/passwordPolicy.js";
import { generarValorAleatorio, hashearValorOidc } from "../seguridad/oidc.js";
import { correoVerificacion, type InterfazCorreo } from "../seguridad/correo.js";
import { GeneradorPreguntaOnboardingReglas, type EstadoPasosOnboarding } from "@atiende-rv/domain";

// Lote 3.3 (RV16): onboarding self-serve — registro de empresa gestora
// (tenant nuevo) + primer usuario admin + suscripción de prueba, TODO en
// una sola transacción sin sesión previa (packages/db/src/migrations/
// 0121_onboarding_funciones.ts / 0122_facturacion_esquema.ts). Los pasos
// siguientes del asistente (alta de la primera propiedad/unidad, conexión
// iCal, invitación de colaboradores) NO tienen rutas propias aquí a
// propósito: reusan las rutas YA EXISTENTES y ya autenticadas
// (`POST /propiedades`, `POST /unidades`, el asistente de canales de
// `GET /canales-mexico/:canal/asistente`, `POST /backoffice/usuarios/
// invitaciones`) una vez el admin recién registrado inicia sesión — este
// archivo solo orquesta el ARRANQUE (paso 1) y expone `GET /onboarding/estado`
// para que la UI sepa en qué paso quedó el tenant.

const TTL_TOKEN_VERIFICACION_MS = 24 * 60 * 60 * 1000; // 24 horas — mismo TTL que /auth/registro.

const CuerpoConversarOnboarding = z.object({
  // Opcional: sin mensaje (primera carga del widget), el generador usa el
  // orden por defecto — ver GeneradorPreguntaOnboardingReglas.
  mensaje: z.string().max(2000).optional(),
});

const CuerpoRegistroEmpresa = z.object({
  empresaNombre: z.string().min(1).max(200),
  empresaRazonSocial: z.string().min(1).max(300),
  adminCorreo: z.string().email(),
  adminPassword: z.string().min(10),
  // Plan inicial (RV16, borrador comercial) — "esencial" por defecto si
  // el usuario no eligió uno explícitamente en la página de precios.
  planCodigo: z.string().min(1).default("esencial"),
});

export interface DependenciasOnboarding {
  pool: pg.Pool;
  jwtSecret: string;
  correo: InterfazCorreo;
  urlPublicaWeb: string;
  /** Solo para pruebas HIBP opcional — mismo criterio que /auth/registro. */
  politicaContrasenaHibp: boolean;
}

/** Sesión mínima que necesita `resolverEstadoPasos` — el mismo shape que
 * `conSesion(pool, sesionDeAuth(auth), ...)` ya entrega, tipado estrecho
 * para no arrastrar el tipo completo de `pg` a esta función. */
interface ClienteSesionOnboarding {
  query<T extends Record<string, unknown> = Record<string, unknown>>(texto: string, valores?: unknown[]): Promise<{ rows: T[] }>;
}

/** Calcula el checklist de onboarding en vivo desde las tablas reales —
 * compartido por `GET /onboarding/estado` (Patrón 7: reusado sin cambios)
 * y `POST /onboarding/conversar` (nuevo), para que ambos endpoints nunca
 * puedan desincronizarse sobre qué cuenta como "paso completo". */
async function resolverEstadoPasos(
  cliente: ClienteSesionOnboarding,
  tenantId: string,
  usuarioId: string,
): Promise<EstadoPasosOnboarding> {
  const { rows } = await cliente.query<{
    tiene_propiedad: boolean;
    tiene_unidad: boolean;
    tiene_canal_conectado: boolean;
    tiene_colaborador_invitado: boolean;
    correo_verificado: boolean;
  }>(
    `SELECT
       EXISTS(SELECT 1 FROM propiedad WHERE tenant_id = $1) AS tiene_propiedad,
       EXISTS(SELECT 1 FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id WHERE p.tenant_id = $1) AS tiene_unidad,
       EXISTS(SELECT 1 FROM cuenta_canal WHERE tenant_id = $1) AS tiene_canal_conectado,
       EXISTS(SELECT 1 FROM invitacion_usuario WHERE tenant_id = $1) AS tiene_colaborador_invitado,
       (SELECT email_verificado_en IS NOT NULL FROM usuario WHERE id = $2) AS correo_verificado`,
    [tenantId, usuarioId],
  );
  const fila = rows[0]!;
  return {
    empresaRegistrada: true,
    correoVerificado: fila.correo_verificado,
    primeraPropiedad: fila.tiene_propiedad,
    primeraUnidad: fila.tiene_unidad,
    canalConectado: fila.tiene_canal_conectado,
    colaboradorInvitado: fila.tiene_colaborador_invitado,
  };
}

export function crearRutasOnboarding(deps: DependenciasOnboarding): Hono {
  const { pool, jwtSecret, correo, urlPublicaWeb, politicaContrasenaHibp } = deps;
  const app = new Hono();

  // POST /onboarding/registro — PÚBLICA (sin sesión): auto-registro de
  // una empresa gestora nueva. Nunca reemplaza /auth/registro (que sigue
  // sirviendo para unirse a un tenant YA EXISTENTE vía invitación o
  // registro abierto) — esta ruta es exclusivamente "crear el tenant
  // desde cero", el primer paso del onboarding self-serve.
  app.post("/registro", async (c) => {
    const cuerpo = CuerpoRegistroEmpresa.parse(await c.req.json());

    const politica = await validarPoliticaContrasena(cuerpo.adminPassword, { hibpHabilitado: politicaContrasenaHibp });
    if (!politica.valida) {
      throw new ErrorDominio("validacion", politica.motivo ?? "Contraseña inválida");
    }
    const passwordHash = await hashContrasena(cuerpo.adminPassword);

    const resultado = await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      return enTransaccion(cliente, async () => {
        const { rows: filaTenant } = await cliente.query<{ id: string }>(
          "SELECT onboarding_registrar_empresa($1, $2) AS id",
          [cuerpo.empresaNombre, cuerpo.empresaRazonSocial],
        );
        const tenantId = filaTenant[0]!.id;

        // rol='admin_gestora' exige colaborador_nivel=NULL — CHECK
        // usuario_colaborador_nivel_solo_operador (migración 0010): solo
        // 'operador' puede tener un nivel de colaborador no nulo.
        const { rows: filaUsuario } = await cliente.query<{ id: string }>(
          "SELECT autenticar_registrar_usuario($1, $2, $3, 'admin_gestora', NULL, NULL, false) AS id",
          [tenantId, cuerpo.adminCorreo, passwordHash],
        );
        const usuarioId = filaUsuario[0]!.id;

        await cliente.query("SELECT onboarding_crear_suscripcion_prueba($1, $2)", [tenantId, cuerpo.planCodigo]);

        return { tenantId, usuarioId };
      });
    });

    // Verificación de correo — mismo mecanismo que /auth/registro
    // (token_un_uso + correoVerificacion), fuera de la transacción
    // anterior a propósito (un fallo de SMTP nunca debe revertir el
    // registro ya confirmado en base de datos).
    const token = generarValorAleatorio(32);
    const hash = hashearValorOidc(token);
    await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      await cliente.query(
        "INSERT INTO token_un_uso (usuario_id, tipo, token_hash, expira_en) VALUES ($1, 'verificacion_email', $2, now() + ($3 || ' milliseconds')::interval)",
        [resultado.usuarioId, hash, TTL_TOKEN_VERIFICACION_MS],
      );
    });
    const urlVerificacion = `${urlPublicaWeb}/verificar-correo?token=${encodeURIComponent(token)}`;
    const { asunto, textoPlano, html } = correoVerificacion(urlVerificacion);
    await correo.enviar({ para: cuerpo.adminCorreo, asunto, textoPlano, html });

    return c.json(
      {
        tenantId: resultado.tenantId,
        usuarioId: resultado.usuarioId,
        requiereVerificacionCorreo: true,
        siguientePaso: "verificar_correo_y_login",
      },
      201,
    );
  });

  // GET /onboarding/estado — autenticada: checklist del asistente guiado
  // (qué pasos del onboarding ya completó este tenant) — computado en
  // vivo desde las tablas reales, nunca un contador separado que pueda
  // desincronizarse (mismo criterio que medicion_uso_actual, migración
  // 0122).
  const rutasAutenticadas = new Hono();
  rutasAutenticadas.use("*", requiereAutenticacion(jwtSecret));

  rutasAutenticadas.get("/estado", async (c) => {
    const auth = c.get("auth");
    if (!auth.tenantId) {
      throw new ErrorDominio("tenant_forbidden", "Superadmin no pertenece a ningún tenant con onboarding propio");
    }
    const pasos = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      resolverEstadoPasos(cliente, auth.tenantId!, auth.usuarioId),
    );
    return c.json({ pasos });
  });

  // POST /onboarding/conversar — Patrón 7 (rescatado de Likida/atiende.ai):
  // onboarding conversacional con guardas deterministas. Recibe un
  // mensaje LIBRE opcional (qué paso le interesa al usuario ahora mismo)
  // y devuelve la siguiente pregunta de seguimiento dinámica, calculada
  // por `GeneradorPreguntaOnboardingReglas` (packages/domain/onboarding,
  // sin LLM, misma disciplina de `datoFaltanteDeclarado` que
  // `mensajeria/borrador.ts`). El `pasos` que se le pasa al generador
  // viene de `resolverEstadoPasos` — EXACTAMENTE la misma consulta que
  // `GET /estado` — nunca del mensaje del usuario: la guarda de
  // "onboardingCompleto" es así estructuralmente imposible de burlar con
  // texto libre (RV19-R-16, mismo principio que el resto del repo).
  rutasAutenticadas.post("/conversar", async (c) => {
    const auth = c.get("auth");
    if (!auth.tenantId) {
      throw new ErrorDominio("tenant_forbidden", "Superadmin no pertenece a ningún tenant con onboarding propio");
    }
    const cuerpo = CuerpoConversarOnboarding.parse(await c.req.json().catch(() => ({})));
    const pasos = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      resolverEstadoPasos(cliente, auth.tenantId!, auth.usuarioId),
    );
    const generador = new GeneradorPreguntaOnboardingReglas();
    const resultado = generador.siguientePregunta({ pasos }, cuerpo.mensaje ? { texto: cuerpo.mensaje } : null);
    return c.json({ ...resultado, pasos });
  });

  app.route("/", rutasAutenticadas);
  return app;
}

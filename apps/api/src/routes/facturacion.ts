import { Hono } from "hono";
import { z } from "zod";
import type pg from "pg";
import type { AdaptadorPagos, DesgloseSuscripcion, PlanFacturacion } from "@atiende-rv/domain/facturacion";
import { calcularDesgloseSuscripcion, ErrorFirmaWebhookInvalida, PagosStripe } from "@atiende-rv/domain/facturacion";
import { ErrorDominio } from "../contrato/errores.js";
import { conConexion, conSesion, enTransaccion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { ROLES_ADMIN, ROLES_SUPERADMIN } from "../rolesComunes.js";
import { sesionDeAuth } from "../middleware/tenant.js";

// Lote 3.3 (RV16): planes públicos (borrador comercial) + suscripción por
// tenant + medición de uso + checkout (PagosSimulado o Stripe real, según
// `construirPagosStripeDesdeEntorno`) + webhook firmado + portal de
// cliente + edición del catálogo (Superadmin).

interface FilaPlan {
  codigo: string;
  nombre: string;
  descripcion: string;
  escalones: PlanFacturacion["escalones"];
  add_ons: PlanFacturacion["addOnsDisponibles"];
  limite_unidades_activas: number | null;
  limite_mensajes_ia_mes: number | null;
  limite_cuentas_canal: number | null;
  dias_prueba: number;
  moneda: "USD";
  etiqueta_precio: "borrador_comercial";
  activo: boolean;
}

function planDesdeFila(f: FilaPlan): PlanFacturacion {
  return {
    codigo: f.codigo,
    nombre: f.nombre,
    descripcion: f.descripcion,
    escalones: f.escalones,
    addOnsDisponibles: f.add_ons,
    limites: {
      unidadesActivasMax: f.limite_unidades_activas,
      mensajesIaMesMax: f.limite_mensajes_ia_mes,
      cuentasCanalMax: f.limite_cuentas_canal,
    },
    diasPrueba: f.dias_prueba,
    moneda: f.moneda,
    etiquetaPrecio: f.etiqueta_precio,
    activo: f.activo,
  };
}

function serializarPlan(plan: PlanFacturacion) {
  return {
    codigo: plan.codigo,
    nombre: plan.nombre,
    descripcion: plan.descripcion,
    escalones: plan.escalones,
    addOnsDisponibles: plan.addOnsDisponibles,
    limites: plan.limites,
    diasPrueba: plan.diasPrueba,
    moneda: plan.moneda,
    // Campo deliberadamente presente en TODA respuesta de la API que
    // toque precios (RV16) — apps/web nunca debe mostrar un precio de
    // este endpoint sin la marca de agua correspondiente.
    etiquetaPrecio: plan.etiquetaPrecio,
    activo: plan.activo,
  };
}

const CuerpoActualizarPlan = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().default(""),
  escalones: z
    .array(z.object({ hastaUnidades: z.number().int().positive().nullable(), precioCentavosPorUnidad: z.number().int().nonnegative() }))
    .min(1),
  addOnsDisponibles: z
    .array(
      z.object({
        codigo: z.string().min(1),
        nombre: z.string().min(1),
        precioCentavosMes: z.number().int().nonnegative(),
        mensajesIncluidos: z.number().int().nonnegative().nullable(),
      }),
    )
    .default([]),
  limites: z.object({
    unidadesActivasMax: z.number().int().positive().nullable(),
    mensajesIaMesMax: z.number().int().positive().nullable(),
    cuentasCanalMax: z.number().int().positive().nullable(),
  }),
  diasPrueba: z.number().int().nonnegative(),
  activo: z.boolean(),
});

const CuerpoCheckout = z.object({
  planCodigo: z.string().min(1),
  addOnsActivos: z.array(z.string()).default([]),
});

export interface DependenciasFacturacion {
  pool: pg.Pool;
  jwtSecret: string;
  pagos: AdaptadorPagos;
  urlPublicaWeb: string;
}

export function crearRutasFacturacion(deps: DependenciasFacturacion): Hono {
  const { pool, jwtSecret, pagos, urlPublicaWeb } = deps;
  const app = new Hono();

  // GET /facturacion/planes — PÚBLICA (sin sesión): página de precios del
  // sitio público (apps/web/src/pages/publica/precios).
  app.get("/planes", async (c) => {
    const { rows } = await pool.query<FilaPlan>(
      "SELECT codigo, nombre, descripcion, escalones, add_ons, limite_unidades_activas, limite_mensajes_ia_mes, limite_cuentas_canal, dias_prueba, moneda, etiqueta_precio, activo FROM plan_facturacion WHERE activo = true ORDER BY codigo",
    );
    return c.json({ planes: rows.map((f) => serializarPlan(planDesdeFila(f))) });
  });

  const rutasAutenticadas = new Hono();
  rutasAutenticadas.use("*", requiereAutenticacion(jwtSecret));

  // GET /facturacion/suscripcion — estado + desglose de costo actual del
  // tenant (cálculo con decimal exacto, ver
  // packages/domain/src/facturacion/calculoSuscripcion.ts).
  rutasAutenticadas.get("/suscripcion", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    if (!auth.tenantId) throw new ErrorDominio("tenant_forbidden", "Superadmin no tiene suscripción propia");

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows: filasSus } = await cliente.query<{
        plan_codigo: string;
        add_ons_activos: string[];
        estado: string;
        inicio_periodo_prueba_en: string | null;
        fin_periodo_prueba_en: string | null;
        proxima_renovacion_en: string | null;
        proveedor_pago: string | null;
      }>(
        "SELECT plan_codigo, add_ons_activos, estado, inicio_periodo_prueba_en, fin_periodo_prueba_en, proxima_renovacion_en, proveedor_pago FROM suscripcion_tenant WHERE tenant_id = $1",
        [auth.tenantId],
      );
      const suscripcion = filasSus[0];
      if (!suscripcion) throw new ErrorDominio("suscripcion_no_encontrada", "Este tenant todavía no tiene una suscripción");

      const { rows: filasPlan } = await cliente.query<FilaPlan>(
        "SELECT codigo, nombre, descripcion, escalones, add_ons, limite_unidades_activas, limite_mensajes_ia_mes, limite_cuentas_canal, dias_prueba, moneda, etiqueta_precio, activo FROM plan_facturacion WHERE codigo = $1",
        [suscripcion.plan_codigo],
      );
      const filaPlan = filasPlan[0];
      if (!filaPlan) throw new ErrorDominio("plan_no_encontrado", `Plan "${suscripcion.plan_codigo}" ya no existe`);
      const plan = planDesdeFila(filaPlan);

      const periodo = new Date().toISOString().slice(0, 7);
      const { rows: filasUso } = await cliente.query<{ unidades_activas: number; mensajes_ia_mes: number; cuentas_canal: number }>(
        "SELECT * FROM medicion_uso_actual($1, $2)",
        [auth.tenantId, periodo],
      );
      const uso = filasUso[0]!;

      const desglose: DesgloseSuscripcion = calcularDesgloseSuscripcion({
        plan,
        unidadesActivas: uso.unidades_activas,
        addOnsActivos: suscripcion.add_ons_activos,
      });

      return { suscripcion, plan, uso, desglose };
    });

    return c.json({
      estado: resultado.suscripcion.estado,
      planCodigo: resultado.suscripcion.plan_codigo,
      addOnsActivos: resultado.suscripcion.add_ons_activos,
      inicioPeriodoPruebaEn: resultado.suscripcion.inicio_periodo_prueba_en,
      finPeriodoPruebaEn: resultado.suscripcion.fin_periodo_prueba_en,
      proximaRenovacionEn: resultado.suscripcion.proxima_renovacion_en,
      proveedorPago: resultado.suscripcion.proveedor_pago,
      uso: {
        unidadesActivas: resultado.uso.unidades_activas,
        mensajesIaMes: resultado.uso.mensajes_ia_mes,
        cuentasCanal: resultado.uso.cuentas_canal,
      },
      desglose: resultado.desglose,
      plan: serializarPlan(resultado.plan),
    });
  });

  // POST /facturacion/checkout — inicia (o cambia de) suscripción.
  rutasAutenticadas.post("/checkout", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    if (!auth.tenantId) throw new ErrorDominio("tenant_forbidden", "Superadmin no tiene suscripción propia");
    const cuerpo = CuerpoCheckout.parse(await c.req.json());

    const { rows: filasUsuario } = await pool.query<{ email: string }>(
      "SELECT * FROM autenticar_buscar_usuario_por_id($1)",
      [auth.usuarioId],
    );
    const correo = filasUsuario[0]?.email;
    if (!correo) throw new ErrorDominio("recurso_no_encontrado", "Usuario no encontrado");

    const cliente = await pagos.crearOReusarCliente({ tenantId: auth.tenantId, correo, nombre: auth.tenantId });
    const urlExito = `${urlPublicaWeb}/facturacion?checkout=exito`;
    const urlCancelacion = `${urlPublicaWeb}/facturacion?checkout=cancelado`;

    let sesion;
    if (pagos.proveedor === "stripe") {
      // Stripe real: requiere `price_id` resueltos por variable de
      // entorno (STRIPE_PRICE_<CODIGO_PLAN_MAYUSCULAS>,
      // STRIPE_PRICE_ADDON_<CODIGO_MAYUSCULAS>) — nunca hardcodeados,
      // dependen de lo que exista en el dashboard de Stripe del cliente.
      const priceIdPlan = process.env[`STRIPE_PRICE_${cuerpo.planCodigo.toUpperCase()}`];
      if (!priceIdPlan) {
        throw new ErrorDominio(
          "validacion",
          `Falta configurar STRIPE_PRICE_${cuerpo.planCodigo.toUpperCase()} en el entorno — ver docs/despliegue/README.md`,
        );
      }
      const priceIdsAddOns = cuerpo.addOnsActivos.map((codigo) => {
        const priceId = process.env[`STRIPE_PRICE_ADDON_${codigo.toUpperCase()}`];
        if (!priceId) {
          throw new ErrorDominio("validacion", `Falta configurar STRIPE_PRICE_ADDON_${codigo.toUpperCase()} en el entorno`);
        }
        return priceId;
      });
      sesion = await (pagos as PagosStripe).crearSesionCheckoutConPrecios({
        cliente,
        lineasPrecio: [priceIdPlan, ...priceIdsAddOns],
        urlExito,
        urlCancelacion,
      });
    } else {
      sesion = await pagos.crearSesionCheckout({
        cliente,
        planCodigo: cuerpo.planCodigo,
        addOnsActivos: cuerpo.addOnsActivos,
        urlExito,
        urlCancelacion,
      });
    }

    return c.json({ id: sesion.id, url: sesion.url, proveedor: pagos.proveedor });
  });

  // GET /facturacion/portal — portal de autoservicio (Stripe Billing
  // Portal real, o una página informativa con `PagosSimulado`).
  rutasAutenticadas.get("/portal", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    if (!auth.tenantId) throw new ErrorDominio("tenant_forbidden", "Superadmin no tiene suscripción propia");

    const { rows } = await pool.query<{ cliente_externo_id: string | null }>(
      "SELECT cliente_externo_id FROM suscripcion_tenant WHERE tenant_id = $1",
      [auth.tenantId],
    );
    const clienteExternoId = rows[0]?.cliente_externo_id;
    if (!clienteExternoId) {
      throw new ErrorDominio("suscripcion_no_encontrada", "Todavía no hay un checkout completado para este tenant");
    }
    const sesion = await pagos.crearSesionPortalCliente({
      cliente: { id: clienteExternoId, tenantId: auth.tenantId, correo: "" },
      urlRetorno: `${urlPublicaWeb}/facturacion`,
    });
    return c.json({ url: sesion.url });
  });

  // GET /facturacion/uso — medición de uso actual (RV16).
  rutasAutenticadas.get("/uso", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    if (!auth.tenantId) throw new ErrorDominio("tenant_forbidden", "Superadmin no tiene medición propia");
    const periodo = c.req.query("periodo") ?? new Date().toISOString().slice(0, 7);
    const uso = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query<{ unidades_activas: number; mensajes_ia_mes: number; cuentas_canal: number }>(
        "SELECT * FROM medicion_uso_actual($1, $2)",
        [auth.tenantId, periodo],
      );
      return rows[0]!;
    });
    return c.json({
      periodo,
      unidadesActivas: uso.unidades_activas,
      mensajesIaMes: uso.mensajes_ia_mes,
      cuentasCanal: uso.cuentas_canal,
    });
  });

  // PATCH /facturacion/planes/:codigo — edición del catálogo, Superadmin.
  rutasAutenticadas.patch("/planes/:codigo", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_SUPERADMIN);
    const cuerpo = CuerpoActualizarPlan.parse(await c.req.json());
    const codigo = c.req.param("codigo");

    await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        await cliente.query(
          `SELECT facturacion_actualizar_plan($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11)`,
          [
            codigo,
            cuerpo.nombre,
            cuerpo.descripcion,
            JSON.stringify(cuerpo.escalones),
            JSON.stringify(cuerpo.addOnsDisponibles),
            cuerpo.limites.unidadesActivasMax,
            cuerpo.limites.mensajesIaMesMax,
            cuerpo.limites.cuentasCanalMax,
            cuerpo.diasPrueba,
            cuerpo.activo,
            auth.usuarioId,
          ],
        );
      }),
    );
    return c.json({ ok: true });
  });

  // POST /facturacion/webhooks/stripe — PÚBLICA por diseño (sin sesión;
  // la ÚNICA credencial es la firma HMAC verificada abajo). Monta esta
  // ruta SIEMPRE (incluso con PagosSimulado activo) para responder 503
  // honesto en vez de 404 si alguien la golpea antes de configurar
  // Stripe — nunca deja creer que el endpoint "no existe".
  app.post("/webhooks/stripe", async (c) => {
    if (pagos.proveedor !== "stripe") {
      throw new ErrorDominio(
        "validacion",
        "Este despliegue no tiene Stripe configurado (STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET) — el webhook no está activo.",
      );
    }
    const cuerpoCrudo = await c.req.text();
    const firma = c.req.header("stripe-signature") ?? null;

    let evento;
    try {
      evento = pagos.verificarYParsearWebhook({ cuerpoCrudo, firma });
    } catch (err) {
      if (err instanceof ErrorFirmaWebhookInvalida) {
        throw new ErrorDominio("webhook_firma_invalida", err.message);
      }
      throw err;
    }

    if (!evento.clienteExternoId) {
      // Evento sin cliente asociado (p. ej. un ping de configuración) —
      // 200 sin efecto, Stripe no debe reintentar esto.
      return c.json({ recibido: true, ignorado: true });
    }

    const estadoPorTipo: Record<string, string | undefined> = {
      "checkout.session.completed": "activa",
      "customer.subscription.updated": "activa",
      "customer.subscription.deleted": "cancelada",
      "invoice.payment_failed": "pago_pendiente",
    };
    const estado = estadoPorTipo[evento.tipo];
    if (!estado) {
      // Tipo de evento que no mapeamos a un cambio de estado — 200 sin
      // efecto (Stripe envía decenas de tipos de evento; solo actuamos
      // sobre los que afectan el ciclo de vida de la suscripción).
      return c.json({ recibido: true, ignorado: true });
    }

    // Encontrado en pruebas de integración reales (ver comentario de
    // cabecera de la migración 0125): un `pool.query` normal aquí queda
    // BLOQUEADO en silencio por RLS (suscripcion_tenant está FORCEado y
    // exige una sesión de usuario que un webhook nunca trae) —
    // `facturacion_tenant_por_cliente_externo` es SECURITY DEFINER
    // precisamente para este caso legítimo sin sesión.
    const { rows } = await pool.query<{ facturacion_tenant_por_cliente_externo: string | null }>(
      "SELECT facturacion_tenant_por_cliente_externo($1)",
      [evento.clienteExternoId],
    );
    const tenantId = rows[0]?.facturacion_tenant_por_cliente_externo ?? undefined;
    if (!tenantId) {
      // Cliente de Stripe sin tenant asociado en nuestra base — no
      // debería ocurrir en operación normal, pero responder 200 evita
      // que Stripe reintente indefinidamente algo que nunca se va a
      // poder resolver del lado de Atiende.
      return c.json({ recibido: true, ignorado: true, motivo: "cliente_externo_sin_tenant" });
    }

    await pool.query("SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5)", [
      tenantId,
      evento.eventoId,
      evento.clienteExternoId,
      evento.suscripcionExternaId,
      estado,
    ]);

    return c.json({ recibido: true });
  });

  app.route("/", rutasAutenticadas);
  return app;
}

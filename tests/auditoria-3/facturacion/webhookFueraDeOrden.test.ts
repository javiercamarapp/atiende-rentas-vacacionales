// Auditoría-3 / A3-fact-01 — CORREGIDO (migración 0129_facturacion_orden_
// webhook.ts).
//
// Hallazgo original: `facturacion_registrar_pago()` (packages/db/src/
// migrations/0124_facturacion_webhook.ts:29-72) deduplica por
// `(proveedor, evento_id)` vía `evento_pago_procesado` (correcto para
// reintentos del MISMO evento), pero no tenía ninguna noción de orden
// cronológico entre eventos DISTINTOS del mismo tenant: cada llamada
// hacía un `UPDATE suscripcion_tenant SET estado = _estado ...`
// incondicional, sobrescribiendo cualquier estado anterior sin comparar
// marcas de tiempo.
//
// Stripe advierte explícitamente en su documentación que los webhooks
// pueden entregarse fuera de orden (reintentos, colas internas, etc.).
// El mapeo de tipos de evento a estado vive en
// `apps/api/src/routes/facturacion.ts` (`estadoPorTipo`):
//   checkout.session.completed   -> activa
//   customer.subscription.updated -> activa
//   customer.subscription.deleted -> cancelada
//   invoice.payment_failed        -> pago_pendiente
//
// Corrección: `facturacion_registrar_pago()` gana un séptimo parámetro,
// `_evento_creado_en` (epoch en segundos del campo `created` de Stripe),
// y solo aplica el `UPDATE` de estado si no hay ningún evento previo
// aplicado para ese tenant, o si el evento entrante es estrictamente más
// nuevo que el último aplicado — ver comentario de cabecera de
// packages/db/src/migrations/0129_facturacion_orden_webhook.ts.
//
// Esta suite cubre:
//   1) el bug original ya NO reproduce — un evento cronológicamente más
//      viejo entregado tarde NO reactiva una suscripción cancelada por
//      un evento más nuevo;
//   2) (a) variante del mismo caso con otro par de estados, para no
//      depender de un solo escenario ('pago_pendiente' que no debe
//      volver a 'activa');
//   3) (b) camino feliz: un evento nuevo llegando después de uno viejo
//      SÍ cambia el estado (la corrección no debe romper el orden
//      normal, el caso más común con diferencia);
//   4) (c) un reintento EXACTO del mismo evento_id sigue siendo
//      idempotente sin importar qué `_evento_creado_en` traiga el
//      reintento (la garantía de deduplicación de 0124 no depende del
//      timestamp);
//   5) un llamador que omite el séptimo parámetro (código previo a esta
//      migración) sigue funcionando sin romperse.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aplicarMigraciones, crearMotorPglite, migraciones } from "@atiende-rv/db";

let motor: Awaited<ReturnType<typeof crearMotorPglite>>;

beforeEach(async () => {
  motor = await crearMotorPglite();
  await aplicarMigraciones(motor.ejecutor, migraciones);
}, 60_000);

afterEach(async () => {
  await motor.cerrar();
});

async function crearTenantConSuscripcion(estadoInicial: string): Promise<string> {
  const { rows: tenantRows } = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre, tipo) VALUES ('Tenant auditoría webhook', 'empresa_gestora') RETURNING id`,
  );
  const tenantId = tenantRows[0]!.id;
  await motor.ejecutor.query(
    `INSERT INTO suscripcion_tenant (tenant_id, plan_codigo, estado, cliente_externo_id)
     VALUES ($1, 'esencial', $2, 'cus_auditoria_3')`,
    [tenantId, estadoInicial],
  );
  return tenantId;
}

async function estadoActual(tenantId: string): Promise<string> {
  const { rows } = await motor.ejecutor.query<{ estado: string }>(
    "SELECT estado FROM suscripcion_tenant WHERE tenant_id = $1",
    [tenantId],
  );
  return rows[0]!.estado;
}

describe("A3-fact-01: facturacion_registrar_pago ordena eventos de webhook fuera de secuencia (CORREGIDO)", () => {
  it("un evento 'updated' entregado DESPUÉS de un 'deleted', pero cronológicamente ANTERIOR, ya NO reactiva la suscripción", async () => {
    const tenantId = await crearTenantConSuscripcion("activa");

    // 1) Llega (y se procesa) el evento de CANCELACIÓN real — el más
    // reciente en el tiempo del mundo real (el cliente canceló su
    // tarjeta o su suscripción de verdad, ahora mismo: created = 2000).
    const cancelacion = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5, $6) AS facturacion_registrar_pago`,
      [tenantId, "evt_deleted_mas_reciente", "cus_auditoria_3", "sub_1", "cancelada", 2000],
    );
    expect(cancelacion.rows[0]!.facturacion_registrar_pago).toBe(true);
    expect(await estadoActual(tenantId)).toBe("cancelada");

    // 2) Llega TARDE un evento 'customer.subscription.updated' distinto
    // (evento_id diferente — no es un reintento del mismo evento, Stripe
    // simplemente lo entregó fuera de orden), que en el mundo real
    // ocurrió ANTES de la cancelación (created = 1000 < 2000) pero la
    // red/cola lo entregó después.
    const actualizacionTardia = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5, $6) AS facturacion_registrar_pago`,
      [tenantId, "evt_updated_entregado_tarde", "cus_auditoria_3", "sub_1", "activa", 1000],
    );
    // El evento SÍ se procesó por primera vez (queda registrado en
    // evento_pago_procesado, idempotencia preservada) — la función
    // devuelve true — pero NO debe pisar el estado más nuevo.
    expect(actualizacionTardia.rows[0]!.facturacion_registrar_pago).toBe(true);

    // CORREGIDO: la suscripción sigue "cancelada" — el evento más viejo
    // entregado tarde ya no reactiva una suscripción que un evento
    // cronológicamente posterior ya había cancelado.
    expect(await estadoActual(tenantId)).toBe("cancelada");
  });

  it("(a) un evento viejo que llega después de uno nuevo no cambia el estado ya aplicado (pago_pendiente no vuelve a 'activa')", async () => {
    const tenantId = await crearTenantConSuscripcion("prueba");

    // Evento NUEVO (created = 5000): factura fallida -> pago_pendiente.
    const facturaFallida = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5, $6) AS facturacion_registrar_pago`,
      [tenantId, "evt_invoice_failed", "cus_auditoria_3", "sub_1", "pago_pendiente", 5000],
    );
    expect(facturaFallida.rows[0]!.facturacion_registrar_pago).toBe(true);
    expect(await estadoActual(tenantId)).toBe("pago_pendiente");

    // Evento VIEJO (created = 4000 < 5000) que llega después, con un
    // evento_id nunca antes visto — no debe reactivar la suscripción.
    const checkoutViejoTardio = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5, $6) AS facturacion_registrar_pago`,
      [tenantId, "evt_checkout_viejo_tardio", "cus_auditoria_3", "sub_1", "activa", 4000],
    );
    expect(checkoutViejoTardio.rows[0]!.facturacion_registrar_pago).toBe(true);
    expect(await estadoActual(tenantId)).toBe("pago_pendiente");
  });

  it("(b) camino feliz: un evento nuevo que llega después de uno viejo SÍ cambia el estado (el orden normal no se rompe)", async () => {
    const tenantId = await crearTenantConSuscripcion("prueba");

    // Evento con created = 1000: checkout completado -> activa.
    const checkout = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5, $6) AS facturacion_registrar_pago`,
      [tenantId, "evt_checkout_1", "cus_auditoria_3", "sub_1", "activa", 1000],
    );
    expect(checkout.rows[0]!.facturacion_registrar_pago).toBe(true);
    expect(await estadoActual(tenantId)).toBe("activa");

    // Evento con created = 2000 (posterior, orden normal): cancelación
    // real -> cancelada. Debe aplicar sin ningún problema.
    const cancelacion = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5, $6) AS facturacion_registrar_pago`,
      [tenantId, "evt_deleted_1", "cus_auditoria_3", "sub_1", "cancelada", 2000],
    );
    expect(cancelacion.rows[0]!.facturacion_registrar_pago).toBe(true);
    expect(await estadoActual(tenantId)).toBe("cancelada");
  });

  it("(c) un reintento EXACTO del mismo evento_id sigue siendo idempotente, sin importar el _evento_creado_en del reintento", async () => {
    const tenantId = await crearTenantConSuscripcion("prueba");

    const primero = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5, $6) AS facturacion_registrar_pago`,
      [tenantId, "evt_idempotente", "cus_auditoria_3", "sub_1", "activa", 3000],
    );
    expect(primero.rows[0]!.facturacion_registrar_pago).toBe(true);
    expect(await estadoActual(tenantId)).toBe("activa");

    // Cambia el estado manualmente para poder detectar sin ambigüedad si
    // el reintento reaplica el efecto o no.
    await motor.ejecutor.query("UPDATE suscripcion_tenant SET estado = 'cancelada' WHERE tenant_id = $1", [
      tenantId,
    ]);

    // Reintento del MISMO evento_id — incluso con un _evento_creado_en
    // MAYOR que el original (9999 > 3000), lo que probaría que la
    // función SÍ lo está reevaluando como si fuera nuevo si el chequeo
    // de orden se colara dentro de la ruta de deduplicación — debe
    // seguir devolviendo `false` y no tocar el estado en absoluto,
    // exactamente como antes de esta migración (Stripe reintenta el
    // MISMO evento si no recibió 2xx a tiempo).
    const reintento = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5, $6) AS facturacion_registrar_pago`,
      [tenantId, "evt_idempotente", "cus_auditoria_3", "sub_1", "activa", 9999],
    );
    expect(reintento.rows[0]!.facturacion_registrar_pago).toBe(false);
    expect(await estadoActual(tenantId)).toBe("cancelada");
  });

  it("un llamador que omite _evento_creado_en (código previo a esta migración) sigue aplicando el cambio de estado", async () => {
    const tenantId = await crearTenantConSuscripcion("prueba");

    // Mismo llamado de 6 argumentos que usaban las pruebas de
    // integración previas a esta migración (packages/db/test/
    // integration/facturacionOnboardingRls.test.ts) — el DEFAULT del
    // séptimo parámetro sigue aplicando el efecto normalmente.
    const resultado = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5) AS facturacion_registrar_pago`,
      [tenantId, "evt_sin_timestamp", "cus_auditoria_3", "sub_1", "activa"],
    );
    expect(resultado.rows[0]!.facturacion_registrar_pago).toBe(true);
    expect(await estadoActual(tenantId)).toBe("activa");
  });
});

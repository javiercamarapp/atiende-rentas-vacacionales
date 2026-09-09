// Auditoría-3 / A3-fact-01
//
// Hallazgo: `facturacion_registrar_pago()` (packages/db/src/migrations/
// 0124_facturacion_webhook.ts:29-72) deduplica por `(proveedor, evento_id)`
// vía `evento_pago_procesado` (correcto para reintentos del MISMO evento),
// pero NO tiene ninguna noción de orden cronológico entre eventos
// DISTINTOS del mismo tenant: cada llamada hace un `UPDATE suscripcion_
// tenant SET estado = _estado ...` incondicional, sobrescribiendo
// cualquier estado anterior sin comparar marcas de tiempo/versión.
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
// Este test reproduce el escenario: un evento MÁS RECIENTE en el tiempo
// real (p. ej. la cancelación real y actual de la suscripción) se procesa
// primero, y un evento MÁS VIEJO (una actualización que en el mundo real
// ocurrió ANTES de la cancelación, pero que Stripe entregó después, con un
// evento_id distinto) llega después — la función lo aplica igual, dejando
// la suscripción "activa" a pesar de que la cancelación real ya sucedió.
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

describe("A3-fact-01: facturacion_registrar_pago no ordena eventos de webhook fuera de secuencia", () => {
  it("un evento 'updated' entregado DESPUÉS de un 'deleted' reactiva una suscripción ya cancelada", async () => {
    const { rows: tenantRows } = await motor.ejecutor.query<{ id: string }>(
      `INSERT INTO tenant (nombre, tipo) VALUES ('Tenant auditoría webhook', 'empresa_gestora') RETURNING id`,
    );
    const tenantId = tenantRows[0]!.id;

    await motor.ejecutor.query(
      `INSERT INTO suscripcion_tenant (tenant_id, plan_codigo, estado, cliente_externo_id)
       VALUES ($1, 'esencial', 'activa', 'cus_auditoria_3')`,
      [tenantId],
    );

    // 1) Llega (y se procesa) el evento de CANCELACIÓN real — el más
    // reciente en el tiempo del mundo real (el cliente canceló su tarjeta
    // o su suscripción de verdad, ahora mismo).
    const cancelacion = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5) AS facturacion_registrar_pago`,
      [tenantId, "evt_deleted_mas_reciente", "cus_auditoria_3", "sub_1", "cancelada"],
    );
    expect(cancelacion.rows[0]!.facturacion_registrar_pago).toBe(true);

    let estado = await motor.ejecutor.query<{ estado: string }>(
      "SELECT estado FROM suscripcion_tenant WHERE tenant_id = $1",
      [tenantId],
    );
    expect(estado.rows[0]!.estado).toBe("cancelada");

    // 2) Llega TARDE un evento 'customer.subscription.updated' distinto
    // (evento_id diferente — no es un reintento del mismo evento, Stripe
    // simplemente lo entregó fuera de orden), que en el mundo real ocurrió
    // ANTES de la cancelación pero la red/cola lo entregó después.
    const actualizacionTardia = await motor.ejecutor.query<{ facturacion_registrar_pago: boolean }>(
      `SELECT facturacion_registrar_pago($1, 'stripe', $2, $3, $4, $5) AS facturacion_registrar_pago`,
      [tenantId, "evt_updated_entregado_tarde", "cus_auditoria_3", "sub_1", "activa"],
    );
    expect(actualizacionTardia.rows[0]!.facturacion_registrar_pago).toBe(true);

    estado = await motor.ejecutor.query<{ estado: string }>(
      "SELECT estado FROM suscripcion_tenant WHERE tenant_id = $1",
      [tenantId],
    );
    // BUG reproducido: la suscripción vuelve a "activa" a pesar de que la
    // cancelación real (cronológicamente posterior) ya se había aplicado.
    // Un tenant con la tarjeta cancelada recupera acceso "pagado" hasta
    // que llegue, si llega, otro evento que lo corrija.
    expect(estado.rows[0]!.estado).toBe("activa");
  });
});

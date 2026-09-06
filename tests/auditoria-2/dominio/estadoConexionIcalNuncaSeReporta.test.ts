import { describe, expect, it } from "vitest";
import { evaluarEstadoConexion, type EstadoConexionCanal } from "@atiende-rv/domain";

/**
 * D-nn — auditoría dominio/sincronización/datos (fase 2), rubro "estado de
 * conexión honesto" (BLUEPRINT §2.3, D-017).
 *
 * `EstadoConexionCanal` (packages/domain/src/channelAdapter.ts:19-26)
 * declara `"ical"` como un estado propio y honesto, distinto de
 * `partner_pendiente`: "una conexión iCal activa es un estado propio
 * (latencia de horas, D-003), distinto de una integración API en
 * sandbox/producción". `tipo_conexion='ical'` es también un valor real y
 * de primera clase en el esquema (`packages/db/src/migrations/
 * 0064_cuenta_canal_conexion_honesta.ts`, `TipoConexionCuentaCanalContrato`
 * en `apps/api/src/contrato/tipos.ts:796`) — es la vía de conectividad
 * principal de la Etapa 1 (D-011: "iCal primero").
 *
 * Sin embargo, `evaluarEstadoConexion` (channelAdapter.ts:67-81) NUNCA
 * devuelve `"ical"` en ninguna de sus ramas — solo `simulador`,
 * `no_conectado`, `partner_pendiente`, `sandbox` o `produccion`. Y
 * `partner_aprobado` (la columna que decide si se sale de
 * `partner_pendiente`) tiene DEFAULT `false`
 * (`packages/db/src/migrations/0020_cuenta_canal.ts:28`) y NUNCA se
 * establece en `true` al crear una cuenta `tipo_conexion='ical'`
 * (`apps/api/src/routes/backoffice/cuentasCanal.ts`, el INSERT no incluye
 * `partner_aprobado` en absoluto).
 *
 * Consecuencia: una cuenta de canal conectada por iCal, sincronizando con
 * éxito y de forma reciente exactamente como D-011 la diseñó, se reporta
 * en `GET /canales` (`estadoConexion`) como `"partner_pendiente"` — un
 * estado que en la UI se lee como "bloqueado, a la espera de aprobación
 * externa", no como "conectado por iCal, funcionando". Es la dirección
 * opuesta al riesgo típico de "estado honesto" (que no exageremos a
 * 'producción'), pero sigue siendo un estado FALSO respecto a la realidad
 * operativa: una integración sana se muestra como si estuviera bloqueada.
 */
describe("D-nn — evaluarEstadoConexion nunca reporta 'ical' para una conexión iCal sana", () => {
  it("credenciales presentes, sync exitoso y reciente, tipo_conexion='ical' (partner_aprobado=false por defecto): se reporta como partner_pendiente, no como 'ical' ni 'produccion'", () => {
    const ahoraIso = new Date().toISOString();
    const resultado: EstadoConexionCanal = evaluarEstadoConexion({
      credencialesPresentes: true,
      esSimulador: false,
      ultimaSincronizacionExitosaEn: ahoraIso, // sync exitoso ahora mismo
      ventanaMaximaMs: 6 * 60 * 60 * 1000,
      partnerAprobado: false, // default real de una cuenta tipo_conexion='ical'
      esSandbox: false,
    });

    // Comportamiento honesto esperado para una conexión iCal sana: debería
    // reportarse como "ical" (el estado propio que el tipo declara para
    // este caso exacto), nunca como "partner_pendiente" (que implica un
    // bloqueo externo que no existe para iCal).
    expect(resultado).toBe("ical");
  });
});

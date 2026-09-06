import { describe, expect, it } from "vitest";
import { calcularHashContenido, resolverVersion, type VersionEvento } from "@atiende-rv/domain";

/**
 * D-nn — auditoría dominio/sincronización/datos (fase 2).
 *
 * Hipótesis: la heurística de "UID reciclado" de `resolverVersion`
 * (packages/domain/src/resolucionVersion.ts líneas 75-98) SOLO se activa
 * cuando `SEQUENCE` es comparable en ambos lados (`actual.sequence !== null
 * && entrante.sequence !== null`). El propio comentario del archivo (líneas
 * 9-12) reconoce que "NO hay evidencia primaria de que los canales
 * incrementen SEQUENCE de forma fiable en feeds PUBLISH" — es decir, el
 * caso `sequence === null` en ambos lados (feed que nunca expone SEQUENCE)
 * es exactamente el caso que el propio diseño anticipa como plausible.
 *
 * En ese caso, un UID reciclado por el canal para una reserva nueva y no
 * relacionada, con un DTSTAMP más reciente y contenido (fechas) totalmente
 * distinto, NUNCA se marca `revisar_uid_reciclado`: cae directamente en la
 * rama "DTSTAMP entrante más reciente" → `aplicar`. El motor de sync
 * (packages/adapters/src/sync/motor.ts líneas 359-362) entonces llama
 * `modificarFechasReserva` sobre la fila EXISTENTE, fusionando en silencio
 * dos reservas no relacionadas bajo el mismo UID — sin alerta ni revisión
 * humana, contradiciendo el propósito declarado del caso adversarial 13.
 */
describe("D-nn — UID reciclado sin SEQUENCE nunca se marca para revisión", () => {
  it("DTSTAMP más reciente + hash totalmente distinto, SEQUENCE ausente en ambos: se aplica en silencio, no se marca para revisión", () => {
    const uid = "reserva-1234@canal-externo.com";

    // Versión previa: reserva real, huésped A, 2027-01-10..2027-01-15.
    const actual: VersionEvento = {
      uid,
      sequence: null,
      dtstamp: "2026-12-01T00:00:00.000Z",
      hash: calcularHashContenido({
        unidadId: "unidad-1",
        dtstart: "2027-01-10",
        dtend: "2027-01-15",
        razon: "RESERVA_CANAL",
      }),
    };

    // El canal RECICLA el mismo UID meses después para una reserva
    // completamente distinta (huésped B, fechas totalmente distintas) —
    // el escenario que "caso adversarial 13" (RV07) exige tratar con
    // sospecha, nunca fusionar en silencio.
    const entrante: VersionEvento = {
      uid,
      sequence: null,
      dtstamp: "2027-06-01T00:00:00.000Z",
      hash: calcularHashContenido({
        unidadId: "unidad-1",
        dtstart: "2027-11-20",
        dtend: "2027-11-22",
        razon: "RESERVA_CANAL",
      }),
    };

    const resolucion = resolverVersion(actual, entrante);

    // Comportamiento esperado por el propósito declarado de "UID
    // reciclado" (RV07 caso 13): debería marcarse para revisión humana,
    // nunca aplicarse en silencio como una modificación legítima de la
    // misma reserva.
    expect(resolucion.accion).toBe("revisar_uid_reciclado");
  });
});

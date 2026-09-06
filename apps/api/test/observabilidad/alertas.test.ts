import { describe, expect, it } from "vitest";
import { CATALOGO_FLAGS_POR_DEFECTO, FLAG_SYNC_CANAL_PAUSADO_POR_ALERTA, RegistroFlags } from "@atiende-rv/domain";
import { crearMotorPglite, aplicarMigraciones, migraciones } from "@atiende-rv/db";
import { dispararAlertas, evaluarAlertas, reconocerAlerta, resolverAlerta } from "../../src/workers/observabilidad/alertas.js";

/**
 * §Operación-1/DEFINICION-DE-HECHO §3.5: simula el disparo END-TO-END de
 * las 6 alertas (edad de sync, feed en cuarentena, conflicto pendiente,
 * outbox atascada, drift, token de canal revocado) y confirma que el
 * ÚNICO efecto automatizado observado es una notificación (fila `alerta`)
 * o una pausa reversible (`sync.canal_pausado_por_alerta=true`) — nunca
 * una cancelación de reserva ni un envío a huésped.
 */
describe("evaluarAlertas (lógica pura de reglas)", () => {
  it("dispara sync_sin_exito cuando la edad supera el umbral configurable POR CANAL", () => {
    const alertas = evaluarAlertas({
      umbrales: {
        edadSyncSinExitoSegundosPorCanal: { airbnb: 60 },
        edadSyncSinExitoSegundosPorDefecto: 21600,
        outboxAtascadaMs: 1_800_000,
        intentosTokenRevocado: 3,
      },
      syncPorCanal: [
        {
          canalNombre: "airbnb",
          canalId: "c1",
          edadUltimaSyncExitosaSegundos: 120,
          errorClaseUltimoIntento: null,
          intentosFallidosConsecutivos: 0,
        },
        {
          canalNombre: "vrbo", // usa el umbral por defecto (21600s) — no dispara con 120s.
          canalId: "c2",
          edadUltimaSyncExitosaSegundos: 120,
          errorClaseUltimoIntento: null,
          intentosFallidosConsecutivos: 0,
        },
      ],
    });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]!.tipo).toBe("sync_sin_exito");
    expect(alertas[0]!.accionReversible).toBeNull();
  });

  it("dispara feed_en_cuarentena", () => {
    const alertas = evaluarAlertas({
      feedsEnCuarentena: [{ canalId: "c1", unidadId: "u1", canalNombre: "airbnb", motivoCuarentena: "3 fallos consecutivos" }],
    });
    expect(alertas.map((a) => a.tipo)).toEqual(["feed_en_cuarentena"]);
    expect(alertas[0]!.accionReversible).toBeNull();
  });

  it("dispara conflicto_pendiente (siempre revisión humana, nunca resolución automática)", () => {
    const alertas = evaluarAlertas({
      conflictosPendientes: [{ conflictoId: "conf1", unidadId: "u1", tipoConflicto: "capa_cruzada" }],
    });
    expect(alertas.map((a) => a.tipo)).toEqual(["conflicto_pendiente"]);
    expect(alertas[0]!.accionReversible).toBeNull();
  });

  it("dispara outbox_atascada cuando el pendiente más viejo supera el umbral", () => {
    const alertas = evaluarAlertas({
      outbox: { edadPendienteMasViejoMs: 40 * 60 * 1000, tamanoCola: 50 },
    });
    expect(alertas.map((a) => a.tipo)).toEqual(["outbox_atascada"]);
  });

  it("NO dispara outbox_atascada si no hay pendientes o están bajo el umbral", () => {
    expect(evaluarAlertas({ outbox: { edadPendienteMasViejoMs: null, tamanoCola: 0 } })).toEqual([]);
    expect(evaluarAlertas({ outbox: { edadPendienteMasViejoMs: 1000, tamanoCola: 1 } })).toEqual([]);
  });

  it("dispara drift cuando hay UIDs solo en feed o solo en BD", () => {
    const alertas = evaluarAlertas({
      drifts: [{ canalId: "c1", unidadId: "u1", canalNombre: "airbnb", uidsSoloEnFeed: 2, uidsSoloEnBd: 0 }],
    });
    expect(alertas.map((a) => a.tipo)).toEqual(["drift"]);
    expect(alertas[0]!.accionReversible).toBeNull();
  });

  it("dispara token_canal_revocado y su ÚNICA acción reversible es pausar el push del canal (H-090)", () => {
    const alertas = evaluarAlertas({
      syncPorCanal: [
        {
          canalNombre: "airbnb",
          canalId: "c1",
          errorClaseUltimoIntento: "token_invalido",
          edadUltimaSyncExitosaSegundos: null,
          intentosFallidosConsecutivos: 3,
        },
      ],
    });
    expect(alertas.map((a) => a.tipo)).toEqual(["token_canal_revocado"]);
    expect(alertas[0]!.accionReversible).toBe("sync.canal_pausado_por_alerta=true");
  });

  it("NO dispara token_canal_revocado por debajo del umbral de intentos", () => {
    const alertas = evaluarAlertas({
      syncPorCanal: [
        {
          canalNombre: "airbnb",
          canalId: "c1",
          errorClaseUltimoIntento: "token_invalido",
          edadUltimaSyncExitosaSegundos: null,
          intentosFallidosConsecutivos: 1,
        },
      ],
    });
    expect(alertas).toEqual([]);
  });

  it("ninguna de las 6 reglas produce jamás una acción de cancelación o contacto a huésped", () => {
    const todas = evaluarAlertas({
      syncPorCanal: [
        { canalNombre: "airbnb", canalId: "c1", edadUltimaSyncExitosaSegundos: 999999, errorClaseUltimoIntento: "token_invalido", intentosFallidosConsecutivos: 5 },
      ],
      feedsEnCuarentena: [{ canalId: "c2", unidadId: "u1", canalNombre: "vrbo", motivoCuarentena: "malformado" }],
      conflictosPendientes: [{ conflictoId: "x", unidadId: "u1", tipoConflicto: "capa_cruzada" }],
      outbox: { edadPendienteMasViejoMs: 3_600_000, tamanoCola: 10 },
      drifts: [{ canalId: "c3", unidadId: "u2", canalNombre: "booking", uidsSoloEnFeed: 1, uidsSoloEnBd: 1 }],
    });
    expect(todas.length).toBeGreaterThanOrEqual(5);
    for (const alerta of todas) {
      expect(alerta.accionReversible === null || alerta.accionReversible === "sync.canal_pausado_por_alerta=true").toBe(true);
    }
  });
});

describe("dispararAlertas / reconocerAlerta / resolverAlerta (persistencia + flag reversible)", () => {
  async function motorConDatosMinimos() {
    const motor = await crearMotorPglite();
    await aplicarMigraciones(motor.ejecutor, migraciones);
    const tenant = await motor.ejecutor.query<{ id: string }>(`INSERT INTO tenant (nombre) VALUES ('t') RETURNING id`);
    const tenantId = tenant.rows[0]!.id;
    const propiedad = await motor.ejecutor.query<{ id: string }>(
      `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'p', 'America/Mexico_City') RETURNING id`,
      [tenantId],
    );
    const unidad = await motor.ejecutor.query<{ id: string }>(
      `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'u') RETURNING id`,
      [propiedad.rows[0]!.id],
    );
    const canal = await motor.ejecutor.query<{ id: string }>(`SELECT id FROM canal WHERE codigo = 'airbnb'`);
    const usuario = await motor.ejecutor.query<{ id: string }>(
      `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'operador@example.test', 'operador', 'hash') RETURNING id`,
      [tenantId],
    );
    return { motor, unidadId: unidad.rows[0]!.id, canalId: canal.rows[0]!.id, usuarioId: usuario.rows[0]!.id };
  }

  it("persiste cada alerta evaluada como fila en la tabla alerta con estado='activa'", async () => {
    const { motor, unidadId } = await motorConDatosMinimos();
    try {
      const entradas = evaluarAlertas({
        conflictosPendientes: [{ conflictoId: "x", unidadId, tipoConflicto: "capa_cruzada" }],
      });
      const ids = await dispararAlertas(motor.ejecutor, entradas);
      expect(ids).toHaveLength(1);

      const fila = await motor.ejecutor.query<{ estado: string; tipo: string }>(`SELECT estado, tipo FROM alerta WHERE id = $1`, [ids[0]]);
      expect(fila.rows[0]!.estado).toBe("activa");
      expect(fila.rows[0]!.tipo).toBe("conflicto_pendiente");
    } finally {
      await motor.cerrar();
    }
  });

  it("token_canal_revocado activa sync.canal_pausado_por_alerta (pausa reversible, no cancela nada)", async () => {
    const { motor, canalId } = await motorConDatosMinimos();
    try {
      const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
      expect(registroFlags.valor(FLAG_SYNC_CANAL_PAUSADO_POR_ALERTA)).toBe(false);

      const entradas = evaluarAlertas({
        syncPorCanal: [
          { canalNombre: "airbnb", canalId, edadUltimaSyncExitosaSegundos: null, errorClaseUltimoIntento: "token_invalido", intentosFallidosConsecutivos: 4 },
        ],
      });
      await dispararAlertas(motor.ejecutor, entradas, { registroFlags, actor: "motor-alertas" });

      expect(registroFlags.valor(FLAG_SYNC_CANAL_PAUSADO_POR_ALERTA)).toBe(true);
      const auditoria = registroFlags.auditoria(FLAG_SYNC_CANAL_PAUSADO_POR_ALERTA);
      expect(auditoria).toHaveLength(1);
      expect(auditoria[0]!.actor).toBe("motor-alertas");
    } finally {
      await motor.cerrar();
    }
  });

  it("reconocerAlerta (ack) marca reconocida_por/reconocida_en y no toca alertas ya resueltas", async () => {
    const { motor, unidadId, usuarioId } = await motorConDatosMinimos();
    try {
      const ids = await dispararAlertas(motor.ejecutor, evaluarAlertas({
        conflictosPendientes: [{ conflictoId: "x", unidadId, tipoConflicto: "capa_cruzada" }],
      }));
      await reconocerAlerta(motor.ejecutor, ids[0]!, usuarioId);

      const fila = await motor.ejecutor.query<{ estado: string; reconocida_por: string }>(
        `SELECT estado, reconocida_por FROM alerta WHERE id = $1`,
        [ids[0]],
      );
      expect(fila.rows[0]!.estado).toBe("reconocida");
      expect(fila.rows[0]!.reconocida_por).toBe(usuarioId);
    } finally {
      await motor.cerrar();
    }
  });

  it("resolverAlerta marca estado='resuelta'", async () => {
    const { motor, unidadId } = await motorConDatosMinimos();
    try {
      const ids = await dispararAlertas(motor.ejecutor, evaluarAlertas({
        conflictosPendientes: [{ conflictoId: "x", unidadId, tipoConflicto: "capa_cruzada" }],
      }));
      await resolverAlerta(motor.ejecutor, ids[0]!);
      const fila = await motor.ejecutor.query<{ estado: string }>(`SELECT estado FROM alerta WHERE id = $1`, [ids[0]]);
      expect(fila.rows[0]!.estado).toBe("resuelta");
    } finally {
      await motor.cerrar();
    }
  });
});

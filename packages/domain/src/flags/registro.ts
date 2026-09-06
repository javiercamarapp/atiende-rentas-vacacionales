import { CategoriaRiesgoFlag, type AuditoriaFlagEntry, type CambioFlagEntrada, type FlagDefinicion, type FlagId } from "./tipos.js";

/**
 * Error lanzado al registrar una definición que viola la regla H-089:
 * ninguna funcionalidad que module dinero/cancelación/contacto puede
 * nacer activada por defecto.
 */
export class FlagRiesgoDefaultActivoError extends Error {
  constructor(id: FlagId) {
    super(
      `El flag "${id}" está categorizado como dinero_cancelacion_contacto ` +
        `pero se intentó registrar con defaultValor=true (REQ-163/H-089): ` +
        `toda funcionalidad de ese riesgo nace desactivada.`,
    );
    this.name = "FlagRiesgoDefaultActivoError";
  }
}

export class FlagNoRegistradoError extends Error {
  constructor(id: FlagId) {
    super(`El flag "${id}" no está registrado en el catálogo.`);
    this.name = "FlagNoRegistradoError";
  }
}

interface EstadoFlag {
  definicion: FlagDefinicion;
  valorGlobal: boolean;
  overridesPorTenant: Map<string, boolean>;
  auditoria: AuditoriaFlagEntry[];
}

/**
 * Registro tipado de feature flags en memoria (referencia; ver nota de
 * `tipos.ts` sobre persistencia). Reglas:
 * - Registrar un flag `DINERO_CANCELACION_CONTACTO` con `defaultValor:
 *   true` lanza `FlagRiesgoDefaultActivoError` — no se puede ni construir
 *   el registro con esa combinación (falla al arrancar, no en producción).
 * - `valor(flagId, tenantId)` resuelve override de tenant si existe,
 *   si no cae al valor global (que arranca en `defaultValor`).
 * - Toda mutación (`establecer`) queda en `auditoria()` con actor, motivo
 *   y timestamp — nunca silenciosa.
 */
export class RegistroFlags {
  private readonly estados = new Map<FlagId, EstadoFlag>();
  private readonly ahora: () => Date;

  constructor(definiciones: FlagDefinicion[], opciones: { ahora?: () => Date } = {}) {
    this.ahora = opciones.ahora ?? (() => new Date());
    for (const definicion of definiciones) {
      this.registrar(definicion);
    }
  }

  registrar(definicion: FlagDefinicion): void {
    if (definicion.categoriaRiesgo === CategoriaRiesgoFlag.DINERO_CANCELACION_CONTACTO && definicion.defaultValor) {
      throw new FlagRiesgoDefaultActivoError(definicion.id);
    }
    this.estados.set(definicion.id, {
      definicion,
      valorGlobal: definicion.defaultValor,
      overridesPorTenant: new Map(),
      auditoria: [],
    });
  }

  private obtener(flagId: FlagId): EstadoFlag {
    const estado = this.estados.get(flagId);
    if (!estado) throw new FlagNoRegistradoError(flagId);
    return estado;
  }

  definicion(flagId: FlagId): FlagDefinicion {
    return this.obtener(flagId).definicion;
  }

  listar(): FlagDefinicion[] {
    return [...this.estados.values()].map((e) => e.definicion);
  }

  valor(flagId: FlagId, tenantId?: string): boolean {
    const estado = this.obtener(flagId);
    if (tenantId && estado.overridesPorTenant.has(tenantId)) {
      return estado.overridesPorTenant.get(tenantId)!;
    }
    return estado.valorGlobal;
  }

  establecer(entrada: CambioFlagEntrada): AuditoriaFlagEntry {
    const estado = this.obtener(entrada.flagId);
    const valorAnterior = this.valor(entrada.flagId, entrada.tenantId);

    if (entrada.tenantId) {
      estado.overridesPorTenant.set(entrada.tenantId, entrada.valor);
    } else {
      estado.valorGlobal = entrada.valor;
    }

    const registro: AuditoriaFlagEntry = {
      ...entrada,
      valorAnterior,
      en: this.ahora().toISOString(),
    };
    estado.auditoria.push(registro);
    return registro;
  }

  /** Quita el override de un tenant — vuelve a heredar el valor global. */
  limpiarOverrideTenant(flagId: FlagId, tenantId: string, actor: string, motivo: string): AuditoriaFlagEntry {
    const estado = this.obtener(flagId);
    const valorAnterior = this.valor(flagId, tenantId);
    estado.overridesPorTenant.delete(tenantId);
    const registro: AuditoriaFlagEntry = {
      flagId,
      valor: estado.valorGlobal,
      tenantId,
      actor,
      motivo: `${motivo} (override de tenant eliminado)`,
      valorAnterior,
      en: this.ahora().toISOString(),
    };
    estado.auditoria.push(registro);
    return registro;
  }

  auditoria(flagId?: FlagId): AuditoriaFlagEntry[] {
    if (flagId) return [...this.obtener(flagId).auditoria];
    return [...this.estados.values()].flatMap((e) => e.auditoria);
  }
}

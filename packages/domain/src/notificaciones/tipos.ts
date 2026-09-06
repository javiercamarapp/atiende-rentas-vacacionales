/**
 * H-054 (BACKLOG E08/E15, REQ-117, §Limpieza-2): notificaciones internas
 * multicanal para operación/alertas. Sin IO: solo formas de datos — los
 * adaptadores concretos (correo simulado, webhook saliente) viven en
 * `packages/sim`/`apps/api` respectivamente.
 *
 * Tres canales, deliberadamente distintos en madurez:
 * - `in_app`: YA existe (tabla `alerta` de Lote 10 + `notificacion_tarea`
 *   de Lote 5) — este módulo no lo reimplementa, solo lo nombra como
 *   miembro del catálogo de canales para que las preferencias por usuario
 *   puedan referirse a él uniformemente.
 * - `correo`: interfaz + implementación SIMULADA (packages/sim), con
 *   punto de extensión real documentado (SMTP configurable por variable
 *   de entorno, desactivado por defecto — `apps/api/src/workers/
 *   notificaciones/adaptadorCorreo.ts`).
 * - `webhook`: firmado con HMAC por tenant, entrega real vía POST HTTP
 *   (`apps/api/src/workers/notificaciones/webhookSaliente.ts`), SSRF-safe
 *   reutilizando los validadores ya existentes de `@atiende-rv/adapters`.
 */
export type CanalNotificacion = "in_app" | "correo" | "webhook";

export const CANALES_NOTIFICACION: readonly CanalNotificacion[] = ["in_app", "correo", "webhook"];

/**
 * Tipos de evento notificables — deliberadamente un subconjunto pequeño y
 * explícito (no "cualquier string"), para que una preferencia mal
 * configurada no pueda referirse a un evento que no existe.
 */
export type TipoEventoNotificable =
  | "alerta_observabilidad"
  | "paridad_precio"
  | "tarea_limpieza";

export const TIPOS_EVENTO_NOTIFICABLE: readonly TipoEventoNotificable[] = [
  "alerta_observabilidad",
  "paridad_precio",
  "tarea_limpieza",
];

/** Preferencia de un usuario: para un tipo de evento dado, qué canales
 * quiere activos. `in_app` no es opcional — un usuario siempre ve sus
 * notificaciones dentro de la app (§Limpieza-2, "sin punto ciego
 * operativo"); las preferencias solo gobiernan `correo`/`webhook`. */
export interface PreferenciaNotificacionUsuario {
  usuarioId: string;
  tipoEvento: TipoEventoNotificable;
  canal: Extract<CanalNotificacion, "correo" | "webhook">;
  activo: boolean;
}

/** Contenido mínimo de una notificación — SIN PII innecesaria: nunca
 * lleva email/teléfono/nombre de huésped, solo metadatos operativos
 * (mismo criterio que `sanitizarAtributos` de observabilidad,
 * §RV19/21-7). */
export interface ContenidoNotificacion {
  tipoEvento: TipoEventoNotificable;
  titulo: string;
  cuerpoTexto: string;
  /** Metadatos estructurados opcionales (ids, umbrales, conteos) — nunca
   * datos de contacto de huéspedes. */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DestinatarioCorreo {
  usuarioId: string;
  email: string;
}

export interface ResultadoEnvioCorreo {
  enviado: boolean;
  /** `true` en la implementación simulada — SIEMPRE presente y NUNCA
   * omitido, para que ningún consumidor pueda confundir un envío
   * simulado con uno real (D-019, mismo criterio que los simuladores de
   * canal de `packages/sim`). */
  simulado: boolean;
  motivo?: string;
}

/** Contrato del adaptador de correo — implementaciones concretas viven
 * fuera de `domain` (packages/sim para la simulada, apps/api para un
 * futuro SMTP real). */
export interface AdaptadorCorreo {
  enviar(destinatario: DestinatarioCorreo, contenido: ContenidoNotificacion): Promise<ResultadoEnvioCorreo>;
}

export interface ConfiguracionWebhookTenant {
  tenantId: string;
  url: string;
  activo: boolean;
}

/** Payload exacto que se firma y se envía — estable y versionado
 * (`version`) para que el receptor pueda verificar la firma sobre
 * bytes deterministas (JSON.stringify de este objeto, sin espacios). */
export interface PayloadWebhookNotificacion {
  version: 1;
  tipoEvento: TipoEventoNotificable;
  titulo: string;
  cuerpoTexto: string;
  metadata: Record<string, string | number | boolean | null>;
  emitidoEn: string;
}

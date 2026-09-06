import type { CanalNotificacion, PreferenciaNotificacionUsuario, TipoEventoNotificable } from "./tipos.js";

/**
 * H-054: resuelve qué canales EFECTIVOS aplican para un usuario y un tipo
 * de evento — pura, sin IO. `in_app` siempre está activo (§Limpieza-2:
 * nunca hay un punto ciego operativo dentro de la app); `correo`/
 * `webhook` solo si el usuario los activó explícitamente para ESE tipo de
 * evento (opt-in, no opt-out — default seguro: sin preferencia guardada,
 * no se manda correo/webhook a nadie).
 *
 * `webhook` es una excepción declarada aparte: es una configuración POR
 * TENANT (`ConfiguracionWebhookTenant`), no por usuario — esta función
 * solo decide `correo`, el llamador decide `webhook` según si el tenant
 * tiene uno configurado y activo (ver `apps/api/src/workers/
 * notificaciones/dispatcher.ts`).
 */
export function resolverCanalesActivos(
  preferencias: readonly PreferenciaNotificacionUsuario[],
  usuarioId: string,
  tipoEvento: TipoEventoNotificable,
): CanalNotificacion[] {
  const canales: CanalNotificacion[] = ["in_app"];
  const correoActivo = preferencias.some(
    (p) => p.usuarioId === usuarioId && p.tipoEvento === tipoEvento && p.canal === "correo" && p.activo,
  );
  if (correoActivo) canales.push("correo");
  return canales;
}

/** `true` si el usuario activó explícitamente el canal `webhook` para
 * este tipo de evento — usado por el dispatcher solo como un "opt-out
 * adicional" del lado del usuario sobre un webhook ya configurado a
 * nivel de tenant (un tenant puede tener el webhook activo pero un
 * usuario puede no querer que SUS eventos lo disparen — hoy no
 * modelado por fila; documentado como límite: el webhook de tenant hoy
 * es todo-o-nada, sin exclusión por usuario). */
export function usuarioActivoParaCanal(
  preferencias: readonly PreferenciaNotificacionUsuario[],
  usuarioId: string,
  tipoEvento: TipoEventoNotificable,
  canal: Extract<CanalNotificacion, "correo" | "webhook">,
): boolean {
  return preferencias.some((p) => p.usuarioId === usuarioId && p.tipoEvento === tipoEvento && p.canal === canal && p.activo);
}

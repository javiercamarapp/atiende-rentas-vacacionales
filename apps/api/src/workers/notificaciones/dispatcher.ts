import {
  resolverCanalesActivos,
  usuarioActivoParaCanal,
  type AdaptadorCorreo,
  type ContenidoNotificacion,
  type PreferenciaNotificacionUsuario,
  type TipoEventoNotificable,
} from "@atiende-rv/domain/notificaciones";
import { descifrarSecretoWebhook } from "./cifradoSecreto.js";
import { enviarWebhookFirmado, type OpcionesEnviarWebhook } from "./webhookSaliente.js";

/**
 * H-054: orquesta el abanico multicanal para UN evento notificable hacia
 * UN usuario destinatario, más el webhook de tenant si está configurado.
 * `in_app` no se toca aquí — YA existe como una fila de `alerta`/
 * `notificacion_tarea` que el llamador insertó ANTES de invocar este
 * dispatcher (este módulo solo añade correo/webhook sobre ese mismo
 * evento, nunca duplica el registro in-app).
 *
 * Best-effort deliberado: un fallo de correo/webhook NUNCA debe tumbar la
 * operación que generó la notificación (p. ej. `POST /pricing/.../
 * paridad` de H-071) — cada envío se intenta de forma independiente y sus
 * errores se devuelven en el resultado, nunca se lanzan.
 */
/** Mínimo común entre `EjecutorSql` (`@atiende-rv/db`, usado por
 * `workers/observabilidad`) y `pg.PoolClient` (usado por el resto de
 * `apps/api/src/routes/*.ts` vía `conSesion`) — el dispatcher solo hace
 * `SELECT`/`INSERT` simples, nunca necesita `.exec()` de statements
 * múltiples, así que se declara la intersección mínima en vez de acoplar
 * este módulo a uno de los dos tipos concretos. */
export interface EjecutorConsultaMinimo {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface DependenciasDispatcher {
  ejecutor: EjecutorConsultaMinimo;
  adaptadorCorreo: AdaptadorCorreo;
  enviarWebhook?: typeof enviarWebhookFirmado;
}

export interface ResultadoDespacho {
  canalesIntentados: string[];
  correoEnviado: boolean;
  webhookEntregado: boolean | null; // null = tenant sin webhook activo, no se intentó.
}

interface FilaPreferencia {
  usuario_id: string;
  tipo_evento: string;
  canal: string;
  activo: boolean;
}

async function cargarPreferenciasUsuario(
  ejecutor: EjecutorConsultaMinimo,
  usuarioId: string,
): Promise<PreferenciaNotificacionUsuario[]> {
  const { rows } = await ejecutor.query<FilaPreferencia>(
    "SELECT usuario_id, tipo_evento, canal, activo FROM preferencia_notificacion_usuario WHERE usuario_id = $1",
    [usuarioId],
  );
  return rows.map((r) => ({
    usuarioId: r.usuario_id,
    tipoEvento: r.tipo_evento as TipoEventoNotificable,
    canal: r.canal as "correo" | "webhook",
    activo: r.activo,
  }));
}

interface FilaWebhookTenant {
  url: string;
  secreto_cifrado: Buffer;
  secreto_iv: Buffer;
  secreto_tag: Buffer;
  activo: boolean;
}

export async function despacharNotificacion(
  deps: DependenciasDispatcher,
  opciones: {
    usuarioId: string;
    usuarioEmail: string;
    tenantId: string | null;
    contenido: ContenidoNotificacion;
    opcionesWebhook?: OpcionesEnviarWebhook;
  },
): Promise<ResultadoDespacho> {
  const { ejecutor, adaptadorCorreo } = deps;
  const enviarWebhook = deps.enviarWebhook ?? enviarWebhookFirmado;
  const { usuarioId, usuarioEmail, tenantId, contenido } = opciones;

  const preferencias = await cargarPreferenciasUsuario(ejecutor, usuarioId);
  const canales = resolverCanalesActivos(preferencias, usuarioId, contenido.tipoEvento);

  let correoEnviado = false;
  if (canales.includes("correo")) {
    const resultado = await adaptadorCorreo.enviar({ usuarioId, email: usuarioEmail }, contenido);
    correoEnviado = resultado.enviado;
  }

  let webhookEntregado: boolean | null = null;
  if (tenantId) {
    const { rows } = await ejecutor.query<FilaWebhookTenant>(
      "SELECT url, secreto_cifrado, secreto_iv, secreto_tag, activo FROM webhook_tenant WHERE tenant_id = $1",
      [tenantId],
    );
    const config = rows[0];
    // El webhook de tenant es todo-o-nada salvo que el usuario lo haya
    // desactivado explícitamente para este tipo de evento (ver
    // `usuarioActivoParaCanal` — hoy sin fila guardada se considera
    // "sin opinión", así que el webhook de TENANT manda por defecto;
    // documentado en `preferencias.ts`).
    const usuarioOptOut =
      preferencias.some((p) => p.tipoEvento === contenido.tipoEvento && p.canal === "webhook") &&
      !usuarioActivoParaCanal(preferencias, usuarioId, contenido.tipoEvento, "webhook");
    if (config && config.activo && !usuarioOptOut) {
      const secreto = descifrarSecretoWebhook({
        secretoCifrado: config.secreto_cifrado,
        secretoIv: config.secreto_iv,
        secretoTag: config.secreto_tag,
      });
      const resultado = await enviarWebhook(
        config.url,
        secreto,
        {
          version: 1,
          tipoEvento: contenido.tipoEvento,
          titulo: contenido.titulo,
          cuerpoTexto: contenido.cuerpoTexto,
          metadata: contenido.metadata ?? {},
          emitidoEn: new Date().toISOString(),
        },
        opciones.opcionesWebhook,
      );
      webhookEntregado = resultado.entregado;
    } else {
      webhookEntregado = null;
    }
  }

  const canalesIntentados = [...canales];
  if (webhookEntregado !== null) canalesIntentados.push("webhook");

  return { canalesIntentados, correoEnviado, webhookEntregado };
}

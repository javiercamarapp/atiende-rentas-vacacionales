import { Hono } from "hono";
import type pg from "pg";
import { ErrorDominio } from "../contrato/errores.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";

/**
 * Catálogo de canales de distribución usados en México (Lote 3.4, RV22) +
 * asistente de conexión. Lee `canal_catalogo` (migración 0110) —
 * declarativo, SIN RLS (no es dato de tenant, es catálogo compartido de
 * "qué canales existen y qué se sabe de cada uno"), por eso consulta el
 * `pool` directamente sin `conSesion`/contexto de rol.
 *
 * RV22-R-06: estas rutas son de SOLO LECTURA a propósito — no existe
 * ningún endpoint para marcar un canal como "conectado" manualmente. El
 * único camino real hacia un estado de conexión honesto distinto de
 * `no_conectado` sigue siendo `POST /canales/cuentas` (credenciales
 * reales) + evidencia de sync (`GET /canales`, ambos en
 * `./canales.ts`) — este archivo solo describe el catálogo y guía al
 * usuario sobre qué necesita conseguir antes de eso.
 */

interface FilaCanalCatalogo {
  canal_codigo: string;
  nombre: string;
  nivel: "A" | "B" | "C";
  via_tecnica: string;
  estado_honesto: "ical" | "partner_pendiente" | "manual" | "no_aplica";
  capacidades: Record<string, boolean>;
  latencia: { texto: string; confianza: string; minutosEstimados: number | null } | null;
  url_proceso_oficial: string | null;
  requisitos_credenciales: string[];
  motivo: string | null;
  fuente: string;
  puente_canal_codigo: string | null;
}

async function listarCatalogo(pool: pg.Pool): Promise<FilaCanalCatalogo[]> {
  const { rows } = await pool.query<FilaCanalCatalogo>(
    `SELECT canal_codigo, nombre, nivel, via_tecnica, estado_honesto, capacidades, latencia,
            url_proceso_oficial, requisitos_credenciales, motivo, fuente, puente_canal_codigo
     FROM canal_catalogo
     ORDER BY orden ASC, canal_codigo ASC`,
  );
  return rows;
}

/** Pasos del asistente de conexión — DERIVADOS del estado honesto de la
 * vía, nunca una promesa de "esto ya está conectado" (RV22-R-06). */
function pasosAsistente(fila: FilaCanalCatalogo): string[] {
  if (fila.estado_honesto === "ical") {
    return [
      "Obtén la URL del calendario iCal de esta unidad en el panel del canal (ver 'requisitos' abajo).",
      "Pégala en el formulario de conexión de la matriz de conectividad (import).",
      "Copia la URL de exportación de Atiende y pégala en el canal, si el canal también acepta import (export).",
      "El estado pasará a 'ical' automáticamente solo tras una sincronización real exitosa — nunca antes.",
    ];
  }
  if (fila.via_tecnica === "channel_manager_puente") {
    return [
      "Contrata/activa el contrato comercial con el proveedor puente indicado en 'URL del proceso oficial'.",
      "Solicita las credenciales de API una vez aprobado el contrato.",
      "Carga esas credenciales en Atiende — el estado pasará a 'sandbox'/'producción' solo con evidencia real de sync.",
    ];
  }
  if (fila.estado_honesto === "partner_pendiente") {
    return [
      "Solicita el acceso de partner en 'URL del proceso oficial' (proceso externo, fuera de Atiende).",
      "Reúne los requisitos listados (NDA, PCI, contrato comercial, etc. según el canal).",
      "Cuando el canal apruebe el acceso, carga las credenciales en Atiende.",
      "El estado pasará a 'sandbox' o 'producción' según el entorno, solo con evidencia real de sync — nunca antes.",
    ];
  }
  if (fila.estado_honesto === "manual") {
    return [
      "Este canal no sincroniza disponibilidad automáticamente — solo permite presencia/publicación manual.",
      "Atiende nunca cierra disponibilidad en este canal: cualquier reserva ahí debe bloquearse manualmente en el calendario unificado.",
    ];
  }
  return [
    "Este canal no tiene ninguna vía de integración implementable hoy (ver 'motivo').",
    "No hay ninguna acción disponible en Atiende para este canal.",
  ];
}

export function crearRutasCanalesCatalogo(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // GET /canales-mexico/catalogo — todas las vías de todos los canales
  // (niveles A/B/C), agrupadas por canal para la matriz de conectividad.
  app.get("/catalogo", async (c) => {
    const filas = await listarCatalogo(pool);
    const porCanal = new Map<string, { canalCodigo: string; nombre: string; vias: unknown[] }>();
    for (const fila of filas) {
      const clave = fila.canal_codigo;
      if (!porCanal.has(clave)) {
        porCanal.set(clave, { canalCodigo: clave, nombre: fila.nombre, vias: [] });
      }
      porCanal.get(clave)!.vias.push({
        viaTecnica: fila.via_tecnica,
        nivel: fila.nivel,
        estadoHonesto: fila.estado_honesto,
        capacidades: fila.capacidades,
        latencia: fila.latencia,
        urlProcesoOficial: fila.url_proceso_oficial,
        requisitosCredenciales: fila.requisitos_credenciales,
        motivo: fila.motivo,
        fuente: fila.fuente,
        puenteCanalCodigo: fila.puente_canal_codigo,
      });
    }
    return c.json({ canales: Array.from(porCanal.values()) });
  });

  // GET /canales-mexico/:canalCodigo/asistente — asistente de conexión
  // para UNA vía de un canal (si tiene más de una, ?via=ical|api_partner|
  // channel_manager_puente selecciona cuál; por defecto la de menor
  // 'orden', normalmente la más recomendable).
  app.get("/:canalCodigo/asistente", async (c) => {
    const canalCodigo = c.req.param("canalCodigo");
    const viaSolicitada = c.req.query("via");
    const filas = await listarCatalogo(pool);
    const delCanal = filas.filter((f) => f.canal_codigo === canalCodigo);
    if (delCanal.length === 0) {
      throw new ErrorDominio("recurso_no_encontrado", `Canal desconocido en el catálogo: "${canalCodigo}"`);
    }
    const fila = viaSolicitada ? delCanal.find((f) => f.via_tecnica === viaSolicitada) : delCanal[0];
    if (!fila) {
      throw new ErrorDominio("recurso_no_encontrado", `Vía "${viaSolicitada}" no encontrada para el canal "${canalCodigo}"`);
    }

    return c.json({
      canalCodigo: fila.canal_codigo,
      nombre: fila.nombre,
      nivel: fila.nivel,
      viaTecnica: fila.via_tecnica,
      estadoHonesto: fila.estado_honesto,
      urlProcesoOficial: fila.url_proceso_oficial,
      requisitosCredenciales: fila.requisitos_credenciales,
      motivo: fila.motivo,
      fuente: fila.fuente,
      puenteCanalCodigo: fila.puente_canal_codigo,
      pasos: pasosAsistente(fila),
      // RV22-R-06: recordatorio explícito para el consumidor de la API
      // (la web nunca debe pintar un botón "marcar como conectado").
      avisoNoAutoconexion:
        "El estado de conexión nunca se marca manualmente — cambia solo cuando hay evidencia real de sincronización.",
    });
  });

  return app;
}

import { Hono } from "hono";
import type pg from "pg";
import { exportarFeedIcs, type BloqueoExportable } from "@atiende-rv/adapters";
import { ErrorDominio } from "../contrato/errores.js";
import { conConexion, limpiarSesion } from "../db/contexto.js";

interface FilaUnidadPorToken {
  unidad_id: string;
  canal_id: string;
  nombre_calendario: string;
}

interface FilaOcupacionExportable {
  ocupacion_unidad_id: string;
  inicio: string;
  fin: string;
  razon: BloqueoExportable["razon"];
  version: number;
}

/**
 * Ruta PÚBLICA (sin `requiereAutenticacion`, corrección Lote 11B #3): el
 * feed `.ics` propio que un canal externo (Airbnb/Booking/Vrbo, vía
 * "importar calendario desde URL") puede suscribir. El token opaco EN LA
 * URL es la única credencial — no hay sesión de aplicación, así que las
 * dos consultas van por funciones `SECURITY DEFINER` (migración
 * `0100_feed_ical_token.ts`, mismo patrón que login/refresh en
 * `0016_rls_funciones_autenticacion.ts`) que nunca aceptan un `unidad_id`
 * directo del cliente: el único id que la ruta pasa a la segunda función
 * es el que la primera ya resolvió a partir del token.
 *
 * D-021 (nunca datos de huésped en un feed exportado): `exportarFeedIcs`
 * ya construye el `SUMMARY` solo a partir de `razon` (packages/adapters/
 * src/ical/exportador.ts) — esta ruta nunca lee ni pasa nombre/contacto de
 * huésped, tarifa, ni ningún otro dato de negocio.
 *
 * Rate limiting: cubierto por el limitador global ya montado en
 * `apps/api/src/app.ts` (`crearRateLimit`, por IP+método+ruta) — la ruta
 * pública no necesita uno propio porque cada token tiene su propia ruta
 * exacta (`/feed/ical/:token`), así que golpear un token repetidamente ya
 * cae en el mismo bucket que cualquier otra ruta.
 */
export function crearRutasFeedIcal(pool: pg.Pool): Hono {
  const app = new Hono();

  app.get("/:token", async (c) => {
    const tokenCrudo = c.req.param("token");
    // Tolera que el cliente pida la URL con sufijo ".ics" (convención de
    // los clientes de calendario) o sin él — el token en sí nunca lo lleva.
    const token = tokenCrudo.endsWith(".ics") ? tokenCrudo.slice(0, -4) : tokenCrudo;

    const resultado = await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);

      const { rows: filasUnidad } = await cliente.query<FilaUnidadPorToken>(
        "SELECT * FROM feed_ical_unidad_por_token($1)",
        [token],
      );
      const unidad = filasUnidad[0];
      if (!unidad) return null;

      const { rows: filasOcupacion } = await cliente.query<FilaOcupacionExportable>(
        "SELECT * FROM feed_ical_ocupaciones_unidad($1)",
        [unidad.unidad_id],
      );

      const bloqueos: BloqueoExportable[] = filasOcupacion.map((f) => ({
        ocupacionUnidadId: f.ocupacion_unidad_id,
        unidadId: unidad.unidad_id,
        rango: { inicio: f.inicio, fin: f.fin },
        razon: f.razon,
        sequence: f.version,
      }));

      return exportarFeedIcs(unidad.nombre_calendario, bloqueos);
    });

    if (!resultado) {
      throw new ErrorDominio("recurso_no_encontrado", "Feed de exportación no encontrado");
    }

    return c.body(resultado.contenidoIcs, 200, {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "no-store",
    });
  });

  return app;
}

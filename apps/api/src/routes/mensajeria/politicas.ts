import { Hono } from "hono";
import type pg from "pg";
import { CANALES_MENSAJERIA, POLITICAS_POR_CANAL } from "@atiende-rv/domain";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";

/**
 * H-061 (REQ-109, §Privacidad-2) + transparencia de políticas por canal
 * (H-057/H-058): expone, tal cual, las políticas declaradas en
 * `packages/domain/src/mensajeria/politica.ts` — incluida su fuente
 * (`[DATO]`/`[R]`/`[E]`, ver RV10) para que apps/web muestre el aviso de
 * escaneo de Airbnb y el origen de cada límite sin duplicar el texto.
 */
export function crearRutasPoliticas(_pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", (c) => {
    const politicas = CANALES_MENSAJERIA.map((canal) => POLITICAS_POR_CANAL[canal]);
    return c.json({
      politicas,
      // H-061: aviso explícito, requerido por §Privacidad-2 — "documentación
      // de usuario del producto" visible también vía API, no solo en la UI.
      avisoEscaneoAirbnb:
        "Los mensajes enviados por Airbnb pueden ser escaneados/analizados por Airbnb (de forma automatizada y, ocasionalmente, manual) con fines de fraude y seguridad (RV10 (f), Airbnb Privacy Policy).",
    });
  });

  return app;
}

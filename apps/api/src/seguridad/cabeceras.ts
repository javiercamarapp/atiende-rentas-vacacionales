import { secureHeaders } from "hono/secure-headers";

/** Cabeceras de seguridad básicas (LOTES.md Lote 3), vía el middleware
 * incluido de Hono: CSP restrictiva (sin scripts/estilos inline por
 * defecto), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
 * `Referrer-Policy` estricta. apps/api sirve solo JSON — no necesita
 * relajar CSP para servir HTML/JS propio. */
export const cabecerasSeguridad = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
  xFrameOptions: "DENY",
  referrerPolicy: "no-referrer",
});

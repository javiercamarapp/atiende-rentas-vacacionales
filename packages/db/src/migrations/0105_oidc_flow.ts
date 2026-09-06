import type { Migracion } from "../runner/tipos.js";

// Lote 3.2 (H-096+): estado efímero del flujo Authorization Code + PKCE
// (RFC 7636) entre `GET /auth/google/inicio` y `GET /auth/google/callback`
// — apps/api no tiene sesión de servidor (JWT sin estado), así que el
// `code_verifier`/`nonce`/`state` deben persistir en algún lado entre esas
// dos peticiones HTTP separadas. Se guarda el HASH de `state` (igual
// criterio que cualquier otro secreto de un solo uso en este esquema) y el
// `code_verifier`/`nonce` en claro porque NUNCA salen de esta tabla hacia
// el cliente (a diferencia de `state`, que sí viaja de ida y vuelta en la
// URL pública). `expira_en` corto (10 minutos, ver seguridad/oidc.ts) y
// `consumido_en` impide reutilizar el mismo flujo dos veces.
export const migracion0105OidcFlow: Migracion = {
  id: "0105_oidc_flow",
  descripcion: "oidc_flow (estado efímero de PKCE/state/nonce para Google/OIDC simulado)",
  up: `
    CREATE TABLE oidc_flow (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      proveedor              text NOT NULL,
      state_hash             text NOT NULL,
      code_verifier          text NOT NULL,
      nonce                  text NOT NULL,
      redirect_uri           text NOT NULL,
      cliente                text NOT NULL DEFAULT 'web' CHECK (cliente IN ('web', 'api')),
      invitacion_token_hash  text,
      creado_en              timestamptz NOT NULL DEFAULT now(),
      expira_en              timestamptz NOT NULL,
      consumido_en           timestamptz
    );
    CREATE UNIQUE INDEX oidc_flow_state_hash_idx ON oidc_flow (state_hash);
  `,
  down: `
    DROP TABLE IF EXISTS oidc_flow;
  `,
};

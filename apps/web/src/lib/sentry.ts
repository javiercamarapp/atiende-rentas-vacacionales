// Sentry (bucle B, docs/PROGRAMA-PUNTA-A-PUNTA.md): monitoreo de errores
// del frontend, ESTRICTAMENTE OPCIONAL por entorno — sin `VITE_SENTRY_DSN`
// (variable de build de Vite, embebida en el bundle SOLO si se define en
// tiempo de build), `iniciarSentryWeb` no llama `Sentry.init` en absoluto:
// el bundle nunca abre una conexión de red hacia Sentry ni instala su
// captura global de errores/promesas — mismo criterio fail-closed/"nada
// finge producción" que el resto de este repo (D-017/D-019).
//
// Archivo `.ts` (no `.tsx`) a propósito, mismo nombre exacto que reserva
// docs/PROGRAMA-PUNTA-A-PUNTA.md para este paquete — el fallback usa
// `React.createElement` en vez de JSX para no necesitar la extensión
// `.tsx`.
import { createElement, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";

let sentryWebHabilitado = false;

/** Solo para pruebas/inspección — nunca para ramificar lógica de negocio. */
export function sentryWebEstaHabilitado(): boolean {
  return sentryWebHabilitado;
}

/**
 * Inicializa Sentry en el navegador SOLO si `VITE_SENTRY_DSN` está
 * definida. `env` es inyectable en pruebas (por defecto `import.meta.env`)
 * para no depender de variables reales de Vite en el entorno de Vitest.
 * Sin tracing de performance por defecto (`tracesSampleRate: 0`): el
 * alcance de este lote es captura de errores, no rendimiento — evita
 * tráfico de red adicional que nadie pidió.
 */
export function iniciarSentryWeb(env: Record<string, unknown> = import.meta.env): boolean {
  const dsn = typeof env.VITE_SENTRY_DSN === "string" ? env.VITE_SENTRY_DSN.trim() : "";
  if (!dsn) {
    sentryWebHabilitado = false;
    return false;
  }

  Sentry.init({
    dsn,
    environment: typeof env.MODE === "string" ? env.MODE : "production",
    tracesSampleRate: 0,
  });

  sentryWebHabilitado = true;
  return true;
}

/**
 * Fallback en español del `Sentry.ErrorBoundary` que envuelve `<App />`
 * en `main.tsx` — coherente con el resto de la UI pública (mismos
 * componentes de `@atiende-rv/ui-atiende` que usa, p. ej.,
 * `apps/web/src/pages/publica/EstadoPage.tsx`). Nunca expone el mensaje
 * técnico del error (`error.message`/stack) al usuario final — eso ya
 * viaja a Sentry (si está configurado) para quien opera el sistema, no a
 * la pantalla de un huésped o anfitrión.
 */
export function PantallaErrorInesperado({ resetError }: { resetError?: () => void }): ReactNode {
  return createElement(
    "div",
    { className: "flex min-h-screen items-center justify-center bg-background px-6" },
    createElement(
      Card,
      { className: "max-w-md" },
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "Algo salió mal"),
        createElement(
          CardDescription,
          null,
          "Ocurrió un error inesperado en esta página. Ya quedó registrado — puedes intentar recargar.",
        ),
      ),
      createElement(
        CardContent,
        null,
        createElement(
          Button,
          { onClick: () => (resetError ? resetError() : window.location.reload()) },
          "Reintentar",
        ),
      ),
    ),
  );
}

/**
 * `Sentry.ErrorBoundary` real de `@sentry/react`: atrapa cualquier error
 * de render de `children` y muestra `PantallaErrorInesperado` en su
 * lugar — SIEMPRE, con o sin Sentry configurado (el boundary de React
 * sigue funcionando aunque `Sentry.init` nunca se haya llamado; solo el
 * reporte a Sentry es lo condicional). Envuelve `<App />` completa en
 * `main.tsx`.
 */
export function LimiteErroresSentry({ children }: { children: ReactNode }): ReactNode {
  return createElement(
    Sentry.ErrorBoundary,
    { fallback: ({ resetError }: { resetError: () => void }) => createElement(PantallaErrorInesperado, { resetError }) },
    children,
  );
}

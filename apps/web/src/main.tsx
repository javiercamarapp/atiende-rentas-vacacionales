import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { iniciarSentryWeb, LimiteErroresSentry } from "./lib/sentry";

// Sentry (bucle B): no-op total sin VITE_SENTRY_DSN — ver
// apps/web/src/lib/sentry.ts.
iniciarSentryWeb();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LimiteErroresSentry>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LimiteErroresSentry>
  </StrictMode>,
);

import { Link } from "react-router-dom";
import { AtiendeWordmark, Button } from "@atiende-rv/ui-atiende";

/** Encabezado compartido del sitio público (Lote 3.3) — landing, precios,
 * estado, legal. Nunca aparece dentro del panel autenticado (ese usa
 * `AdminLayout`, sin relación con este componente). */
export function PublicaHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <AtiendeWordmark markClassName="h-6 w-auto" />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link to="/precios" className="hover:text-foreground">
            Precios
          </Link>
          <Link to="/estado" className="hover:text-foreground">
            Estado del sistema
          </Link>
          <Link to="/login" className="hover:text-foreground">
            Iniciar sesión
          </Link>
          <Button asChild size="sm">
            <Link to="/onboarding">Empezar gratis</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function PublicaFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Atiende Rentas Vacacionales.</p>
        <nav className="flex flex-wrap gap-4">
          <Link to="/legal/aviso-de-privacidad" className="hover:text-foreground">
            Aviso de privacidad
          </Link>
          <Link to="/legal/terminos" className="hover:text-foreground">
            Términos
          </Link>
          <Link to="/legal/cookies" className="hover:text-foreground">
            Cookies
          </Link>
          <Link to="/legal/dpa" className="hover:text-foreground">
            DPA
          </Link>
        </nav>
      </div>
    </footer>
  );
}

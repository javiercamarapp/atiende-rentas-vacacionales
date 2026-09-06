import { LegalLayout } from "./LegalLayout";

export function CookiesPage() {
  return (
    <LegalLayout titulo="Política de cookies">
      <p>
        Este sitio y el panel de Atiende Rentas Vacacionales usan un número reducido de cookies —
        deliberadamente sin rastreo publicitario ni de terceros.
      </p>

      <h2>Cookies que usamos hoy</h2>
      <ul>
        <li>
          <strong>Cookie de sesión (refresh token, httpOnly)</strong> — necesaria para mantener la sesión
          iniciada en el panel; nunca accesible desde JavaScript, nunca compartida con terceros.
        </li>
        <li>
          <strong>Cookie CSRF (no httpOnly)</strong> — protege las peticiones que modifican datos contra
          ataques de falsificación de solicitud entre sitios; solo se lee para reenviarse a la propia API.
        </li>
      </ul>

      <h2>Lo que NO hacemos</h2>
      <p>
        No usamos cookies de publicidad, de analítica de terceros ni de redes sociales en este borrador. Si
        eso cambia en el futuro, esta página se actualizará antes del cambio, no después.
      </p>

      <h2>Almacenamiento local del navegador</h2>
      <p>
        El panel guarda el access token en <code>localStorage</code> del navegador (no es una cookie) para
        mantener la sesión activa entre recargas de página — se borra al cerrar sesión.
      </p>
    </LegalLayout>
  );
}

import { LegalLayout } from "./LegalLayout";

export function TerminosPage() {
  return (
    <LegalLayout titulo="Términos de servicio">
      <p>
        Estos términos, en borrador, rigen el uso del panel de Atiende Rentas Vacacionales por una empresa
        gestora y sus colaboradores. No constituyen un contrato vigente hasta que un abogado los revise y la
        empresa gestora los acepte expresamente en el onboarding.
      </p>

      <h2>1. Descripción del servicio</h2>
      <p>
        Software de gestión de rentas vacacionales: calendario unificado multicanal, mensajería con
        huéspedes, finanzas y reportes. Atiende sincroniza disponibilidad con canales externos mediante feeds
        iCal públicos o integraciones de partner certificadas — nunca mediante scraping o automatización de
        sesión, que los términos de uso de esos canales prohíben explícitamente.
      </p>

      <h2>2. Responsabilidades del anfitrión/empresa gestora</h2>
      <p>
        La empresa gestora sigue siendo la responsable primaria de cumplir sus obligaciones fiscales
        (retención ISR/IVA aplicable a plataformas — ver <code>docs/BLOQUEOS.md</code> B-005, vigencia sin
        confirmar), de registro turístico/de viajeros donde aplique, y de la veracidad de los datos que
        publica en cada canal. Atiende facilita el cumplimiento; no lo sustituye.
      </p>

      <h2>3. Límites del plan y suscripción</h2>
      <p>
        El uso del servicio está sujeto a los límites del plan contratado (unidades activas, mensajes de IA,
        cuentas de canal) — ver la página de <a href="/precios">precios</a>. El plan es un borrador comercial
        y puede cambiar; los cambios de precio no aplican retroactivamente a un periodo ya facturado.
      </p>

      <h2>4. Cancelación</h2>
      <p>
        La empresa gestora puede cancelar su suscripción en cualquier momento desde el portal de facturación.
        [PENDIENTE — política exacta de reembolso/prorrateo, requiere decisión de producto].
      </p>

      <h2>5. Limitación de responsabilidad</h2>
      <p>[PENDIENTE — cláusula estándar a redactar por un abogado, específica a cada jurisdicción aplicable].</p>

      <h2>6. Jurisdicción aplicable</h2>
      <p>
        [PENDIENTE] — depende de en qué país(es) opere la empresa gestora; ver <code>docs/BLOQUEOS.md</code>{" "}
        B-003 (normativa española de registro, sin confirmar) y B-004 (regulación local CDMX, sin confirmar)
        para las lagunas jurisdiccionales todavía abiertas.
      </p>
    </LegalLayout>
  );
}

import { describe, expect, it } from "vitest";
import { escaparHtml } from "../../src/seguridad/plantillasCorreo/escape.js";
import { layoutCorreoHtml } from "../../src/seguridad/plantillasCorreo/layout.js";
import { correoVerificacionHtml } from "../../src/seguridad/plantillasCorreo/verificacion.js";
import { correoRestablecerPasswordHtml } from "../../src/seguridad/plantillasCorreo/restablecerPassword.js";
import { correoNotificacionHtml } from "../../src/seguridad/plantillasCorreo/notificacion.js";

const URL_PUBLICA = "https://midominio.example";

describe("escaparHtml", () => {
  it("escapa &, <, >, comillas dobles y simples", () => {
    expect(escaparHtml(`<script>alert('x')</script> & "comillas"`)).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;comillas&quot;",
    );
  });
});

describe("layoutCorreoHtml", () => {
  it("incluye el logo como URL pública absoluta (no relativa, no data-URI)", () => {
    const html = layoutCorreoHtml({
      titulo: "Título",
      parrafosHtml: ["<p>hola</p>"],
      urlPublica: URL_PUBLICA,
    });
    expect(html).toContain(`src="${URL_PUBLICA}/correo/logo-atiende.png"`);
    expect(html).not.toContain("data:image");
  });

  it("normaliza una urlPublica con barra final (no genera '//correo/')", () => {
    const html = layoutCorreoHtml({
      titulo: "Título",
      parrafosHtml: ["cuerpo"],
      urlPublica: `${URL_PUBLICA}/`,
    });
    expect(html).toContain(`src="${URL_PUBLICA}/correo/logo-atiende.png"`);
    expect(html).not.toContain("//correo/logo-atiende.png");
  });

  it("sin textoBoton/urlBoton, no incluye el botón CTA (solo el enlace del pie)", () => {
    const html = layoutCorreoHtml({ titulo: "Título", parrafosHtml: ["cuerpo"], urlPublica: URL_PUBLICA });
    const enlaces = html.match(/<a /g) ?? [];
    expect(enlaces).toHaveLength(1); // solo el enlace del pie a urlPublica, sin botón CTA

    const conBoton = layoutCorreoHtml({
      titulo: "Título",
      parrafosHtml: ["cuerpo"],
      textoBoton: "Ir",
      urlBoton: "https://x.example",
      urlPublica: URL_PUBLICA,
    });
    expect(conBoton.match(/<a /g)).toHaveLength(2); // pie + botón CTA
  });

  it("escapa un título con caracteres peligrosos (XSS) tanto en <title> como en el encabezado", () => {
    const html = layoutCorreoHtml({
      titulo: `<script>alert(1)</script>`,
      parrafosHtml: ["cuerpo"],
      urlPublica: URL_PUBLICA,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapa la urlBoton y el textoBoton antes de insertarlos", () => {
    const html = layoutCorreoHtml({
      titulo: "Título",
      parrafosHtml: ["cuerpo"],
      textoBoton: `Ir <script>alert(1)</script>`,
      urlBoton: `https://x.example/"><script>alert(2)</script>`,
      urlPublica: URL_PUBLICA,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert(2)</script>");
  });
});

describe("correoVerificacionHtml / correoRestablecerPasswordHtml — CTA con la URL correcta", () => {
  it("correoVerificacionHtml apunta el botón a la urlVerificacion exacta", () => {
    const url = "https://app.ejemplo.com/verificar?token=abc123";
    const html = correoVerificacionHtml(url, URL_PUBLICA);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("válido por 24 horas");
  });

  it("correoRestablecerPasswordHtml apunta el botón a la urlRestablecer exacta", () => {
    const url = "https://app.ejemplo.com/restablecer?token=xyz789";
    const html = correoRestablecerPasswordHtml(url, URL_PUBLICA);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("válido por 1 hora");
  });
});

describe("correoNotificacionHtml — plantilla genérica (título, cuerpo, CTA opcional)", () => {
  it("escapa <script> incrustado en el título y el cuerpo dinámicos", () => {
    const html = correoNotificacionHtml(
      {
        titulo: `Reserva <script>alert('t')</script> confirmada`,
        cuerpo: `Hola <script>alert('c')</script>, tu reserva fue confirmada.`,
      },
      URL_PUBLICA,
    );
    expect(html).not.toContain("<script>alert('t')</script>");
    expect(html).not.toContain("<script>alert('c')</script>");
    expect(html).toContain("Hola &lt;script&gt;alert(&#39;c&#39;)&lt;/script&gt;, tu reserva fue confirmada.");
  });

  it("convierte saltos de línea del cuerpo en <br /> después de escapar", () => {
    const html = correoNotificacionHtml({ titulo: "Aviso", cuerpo: "Línea 1\nLínea 2" }, URL_PUBLICA);
    expect(html).toContain("Línea 1<br />Línea 2");
  });

  it("incluye el botón CTA solo cuando se pasan textoBoton y urlBoton", () => {
    const sinBoton = correoNotificacionHtml({ titulo: "Aviso", cuerpo: "cuerpo" }, URL_PUBLICA);
    expect(sinBoton.match(/<a /g)).toHaveLength(1); // solo el enlace del pie, sin botón CTA

    const conBoton = correoNotificacionHtml(
      { titulo: "Aviso", cuerpo: "cuerpo", textoBoton: "Ver detalle", urlBoton: "https://app.ejemplo.com/x" },
      URL_PUBLICA,
    );
    expect(conBoton).toContain('href="https://app.ejemplo.com/x"');
    expect(conBoton).toContain("Ver detalle");
  });
});

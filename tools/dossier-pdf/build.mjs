#!/usr/bin/env node
/**
 * Genera docs/DOSSIER-FASE1.html a partir de los Markdown fuente del dossier
 * de Fase 1 de Atiende Rentas Vacacionales. NO modifica ningún Markdown.
 *
 * Uso: node build.mjs
 * (La conversión a PDF con Chrome headless se hace en un paso aparte, ver README.md)
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DOCS = path.join(REPO_ROOT, "docs");
const INVESTIGACION = path.join(DOCS, "investigacion");
const AUDITORIA = path.join(DOCS, "auditoria-investigacion-1");

const OUT_HTML = path.join(DOCS, "DOSSIER-FASE1.html");

const TITLE = "Atiende Rentas Vacacionales — Dossier de investigación y blueprint (Fase 1)";
const FECHA = "2026-09-05";
const NOTA = "Carpeta provisional; ver BLOQUEOS B-001.";

// Orden de las fuentes, tal como se solicitó. Cada entrada es una ruta relativa
// a docs/. Las marcadas como opcional se omiten silenciosamente si no existen.
const RV_FILES = [
  "RV01-segmentacion.md",
  "RV02-operacion-reserva-salida.md",
  "RV03-airbnb-capacidades.md",
  "RV04-booking-connectivity.md",
  "RV05-vrbo-extensibilidad.md",
  "RV06-ical-rfc5545.md",
  "RV07-sincronizacion-overbooking.md",
  "RV08-directa-vs-channel-manager.md",
  "RV09-calendario-ux.md",
  "RV10-mensajes-huesped.md",
  "RV11-limpieza-mantenimiento.md",
  "RV12-roles-owners-contabilidad.md",
  "RV13-pricing-revenue.md",
  "RV14-competencia.md",
  "RV15-mercado.md",
  "RV16-modelo-negocio-costos.md",
  "RV17-arquitectura-datos.md",
  "RV18-agentes-automatizacion.md",
  "RV19-seguridad-privacidad-legal.md",
  "RV20-operacion-observabilidad.md",
  "RV21-pruebas-aceptacion.md",
].map((f) => ({ file: path.join(INVESTIGACION, f), optional: false }));

const SOURCES = [
  { file: path.join(INVESTIGACION, "00-INDICE.md"), optional: false },
  { file: path.join(INVESTIGACION, "00-PLAN.md"), optional: false },
  ...RV_FILES,
  { file: path.join(DOCS, "BLUEPRINT.md"), optional: false },
  { file: path.join(DOCS, "DECISIONES.md"), optional: false },
  { file: path.join(DOCS, "REQUISITOS.md"), optional: false },
  { file: path.join(DOCS, "ACEPTACION.md"), optional: false },
  { file: path.join(DOCS, "LAGUNAS.md"), optional: false },
  { file: path.join(DOCS, "BLOQUEOS.md"), optional: false },
  { file: path.join(DOCS, "FUENTES.md"), optional: false },
  { file: path.join(AUDITORIA, "00-RESUMEN.md"), optional: true },
  { file: path.join(AUDITORIA, "blueprint-00-RESUMEN.md"), optional: true },
  { file: path.join(AUDITORIA, "REVERIFICACION.md"), optional: true },
  { file: path.join(AUDITORIA, "CIERRE-FASE1.md"), optional: true },
];

function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function docLabel(relPath) {
  // Etiqueta legible para portada/índice a partir del nombre de archivo.
  const base = path.basename(relPath, ".md");
  return base;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});
md.use(markdownItAnchor, {
  slugify,
  permalink: false,
});

// Bloques ```mermaid -> bloque de código preformateado con etiqueta, sin CDN.
const defaultFence =
  md.renderer.rules.fence ||
  function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const info = (token.info || "").trim().toLowerCase();
  if (info === "mermaid") {
    const escaped = md.utils.escapeHtml(token.content);
    return (
      '<div class="mermaid-block">' +
      '<div class="mermaid-label">Diagrama (mermaid)</div>' +
      `<pre class="mermaid-source"><code>${escaped}</code></pre>` +
      "</div>\n"
    );
  }
  return defaultFence(tokens, idx, options, env, self);
};

let docCounter = 0;
const tocEntries = []; // { id, title, docNumber }
const sectionsHtml = [];

for (const src of SOURCES) {
  if (!existsSync(src.file)) {
    if (src.optional) {
      console.log(`[omitido] ${src.file} no existe (opcional).`);
      continue;
    } else {
      throw new Error(`Fuente requerida no encontrada: ${src.file}`);
    }
  }

  docCounter += 1;
  const raw = readFileSync(src.file, "utf8");
  const relFromDocs = path.relative(DOCS, src.file);
  const label = docLabel(src.file);
  const docId = `doc-${docCounter}-${slugify(label)}`;

  // Render markdown a HTML.
  const bodyHtml = md.render(raw);

  const docTitle = `${docCounter}. ${label}`;
  tocEntries.push({ id: docId, title: docTitle });

  sectionsHtml.push(
    `<section class="doc-section" id="${docId}">` +
      `<div class="doc-header">` +
      `<h2>${docTitle}</h2>` +
      `<div class="doc-path">${relFromDocs}</div>` +
      `</div>` +
      `<div class="doc-body">${bodyHtml}</div>` +
      `</section>`
  );

  console.log(`[ok] (${docCounter}) ${relFromDocs}`);
}

const tocHtml = tocEntries
  .map((e) => `<li><a href="#${e.id}">${e.title}</a></li>`)
  .join("\n");

const CSS = `
:root {
  --fg: #111111;
  --fg-muted: #4a4a4a;
  --bg: #ffffff;
  --accent: #7a1f2b;
  --border: #d8d8d8;
  --border-strong: #999999;
  --code-bg: #f4f4f4;
  --table-header-bg: #f0f0f0;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.5;
}

@page {
  size: A4;
  margin: 18mm;
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-size: 9pt;
    color: #666666;
  }
}

.cover {
  min-height: 240mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  page-break-after: always;
  break-after: page;
  text-align: left;
  border-bottom: 3px solid var(--accent);
  padding-bottom: 24px;
}

.cover .kicker {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10pt;
  color: var(--accent);
  margin-bottom: 12px;
  font-weight: 600;
}

.cover h1 {
  font-size: 26pt;
  line-height: 1.25;
  margin: 0 0 18px 0;
  font-weight: 700;
}

.cover .meta {
  font-size: 11pt;
  color: var(--fg-muted);
  margin: 4px 0;
}

.cover .nota {
  margin-top: 28px;
  padding: 12px 16px;
  border: 1px solid var(--border-strong);
  background: #fafafa;
  font-size: 10pt;
  color: var(--fg);
}

.toc {
  page-break-after: always;
  break-after: page;
}

.toc h2 {
  font-size: 16pt;
  border-bottom: 2px solid var(--accent);
  padding-bottom: 6px;
  margin-bottom: 16px;
}

.toc ol, .toc ul {
  list-style: none;
  margin: 0;
  padding: 0;
  columns: 1;
}

.toc li {
  margin: 0 0 6px 0;
  font-size: 10.5pt;
}

.toc a {
  color: var(--fg);
  text-decoration: none;
  border-bottom: 1px dotted var(--border-strong);
}

.doc-section {
  page-break-before: always;
  break-before: page;
  margin-bottom: 24px;
}

.doc-section:first-of-type {
  page-break-before: auto;
  break-before: auto;
}

.doc-header {
  border-bottom: 2px solid var(--accent);
  margin-bottom: 14px;
  padding-bottom: 6px;
}

.doc-header h2 {
  font-size: 16pt;
  margin: 0 0 2px 0;
}

.doc-path {
  font-size: 9pt;
  color: var(--fg-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.doc-body h1 {
  font-size: 15pt;
  margin-top: 22px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}

.doc-body h2 {
  font-size: 13pt;
  margin-top: 18px;
}

.doc-body h3 {
  font-size: 11.5pt;
  margin-top: 14px;
}

.doc-body h4, .doc-body h5, .doc-body h6 {
  font-size: 10.5pt;
  margin-top: 12px;
}

.doc-body p {
  margin: 8px 0;
}

.doc-body a {
  color: var(--accent);
  word-break: break-word;
}

.doc-body ul, .doc-body ol {
  margin: 8px 0;
  padding-left: 22px;
}

.doc-body li {
  margin: 3px 0;
}

.doc-body blockquote {
  margin: 10px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--accent);
  color: var(--fg-muted);
  background: #fafafa;
}

.doc-body hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 18px 0;
}

.doc-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--code-bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.92em;
  word-break: break-word;
}

.doc-body pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  padding: 10px 12px;
  overflow-x: auto;
  font-size: 8.5pt;
  line-height: 1.4;
  page-break-inside: avoid;
}

.doc-body pre code {
  background: none;
  padding: 0;
  word-break: normal;
  white-space: pre;
}

.mermaid-block {
  margin: 12px 0;
  border: 1px dashed var(--border-strong);
  page-break-inside: avoid;
}

.mermaid-label {
  font-size: 8.5pt;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-muted);
  background: #efefef;
  padding: 4px 10px;
  border-bottom: 1px dashed var(--border-strong);
}

.mermaid-source {
  margin: 0;
  border: none;
}

.doc-body table {
  width: 100%;
  table-layout: auto;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 8.5pt;
  page-break-inside: auto;
}

.doc-body table caption {
  caption-side: top;
  text-align: left;
  font-size: 8.5pt;
  color: var(--fg-muted);
  margin-bottom: 4px;
}

.doc-body th, .doc-body td {
  border: 1px solid var(--border);
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
  word-break: break-word;
  overflow-wrap: break-word;
}

.doc-body th {
  background: var(--table-header-bg);
  font-weight: 600;
}

.doc-body tr {
  page-break-inside: avoid;
}

.doc-body img {
  max-width: 100%;
}

.doc-body strong {
  font-weight: 700;
}
`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${TITLE}</title>
<style>${CSS}</style>
</head>
<body>

<section class="cover">
  <div class="kicker">Atiende Rentas Vacacionales</div>
  <h1>${TITLE}</h1>
  <p class="meta">Fecha: ${FECHA}</p>
  <p class="meta">Documento consolidado generado automáticamente a partir de los Markdown fuente en <code>docs/</code>.</p>
  <div class="nota">${NOTA}</div>
</section>

<section class="toc">
  <h2>Tabla de contenidos</h2>
  <ol>
    ${tocHtml}
  </ol>
</section>

${sectionsHtml.join("\n")}

</body>
</html>
`;

writeFileSync(OUT_HTML, html, "utf8");
console.log(`\nHTML generado: ${OUT_HTML}`);
console.log(`Documentos incluidos: ${docCounter}`);

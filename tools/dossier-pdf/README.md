# dossier-pdf

Genera `docs/DOSSIER-FASE1.html` y `docs/DOSSIER-FASE1.pdf` a partir de los Markdown fuente del dossier de Fase 1 (no los modifica). Requiere `npm install` una vez (markdown-it + markdown-it-anchor, sin red externa en tiempo de build) y Google Chrome instalado localmente.

Regenerar todo (desde la raíz del repo):

```
(cd tools/dossier-pdf && npm install && node build.mjs) && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="docs/DOSSIER-FASE1.pdf" "file://$(pwd)/docs/DOSSIER-FASE1.html"
```

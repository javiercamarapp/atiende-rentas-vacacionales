# Ledger de fuentes — plan de investigación Fase 1

Fecha de consulta: 2026-09-05. Todo lo listado aquí es **lectura de referencia
en modo solo-lectura** desde fuera de este staging; ninguna conclusión de
dominio (hotelería/restaurantes/licitaciones) se copió al plan RV — solo se
extrajo **estructura, densidad, formato de cita y método**, tal como pedía el
encargo. Rutas fuera de este repo son de la carpeta de referencia del usuario:
`~/Desktop/PlataformaAgenticaBlueprintseInvestigacionPDF/`.

## 1. Inventario completo (estructura y tamaño)

- **Archivo**: `00-INDICE.pdf` (y su duplicado `00INDICE.pdf`), 9 páginas,
  200 233 bytes.
  **Evidencia**: índice general de 78 archivos (75 `.docx` + 3 `.json` de
  supuestos de ROI) en 5 carpetas (`01-Blueprints`, `02-Restaurantes-
  investigacion`, `03-Hoteles-investigacion`, `04-Licitaciones-investigacion`,
  `05-Gobierno-y-protocolo`). Documenta la convención de etiquetas de
  confianza `[DATO]`/`[CITADO]`, `[R]`, `[E]`/`[ESTIMACIÓN]` usada en los 63
  informes, y una advertencia explícita de que la cuota de búsqueda web se
  agotó a mitad de proceso en las tres rondas (bloqueo real, declarado, no
  oculto). Extraído a texto con `pdftotext -layout` para lectura completa (9
  páginas, 387 líneas).

- **Inventario completo de páginas/tamaño de los 76 PDF** (todas las carpetas
  01–05 más los 3 `DECISIONLLM*.pdf` raíz): generado con `pdfinfo` sobre cada
  archivo (`find ... -iname "*.pdf"` + `pdfinfo | grep Pages`). Rango
  observado: informes de investigación de línea de negocio entre 16 y 37
  páginas (mediana ~22-24 páginas); blueprints 53-56 páginas; documentos de
  gobierno/protocolo 2-4 páginas; `DECISIONLLM*.pdf` 27-33 páginas. Este
  inventario fundamenta el orden de magnitud de "mínimo de fuentes primarias"
  y densidad esperada por módulo en `00-PLAN.md` §1.

## 2. Blueprint (estructura de alto nivel)

- **Archivo**: `01-Blueprints/BLUEPRINT-HOTELES.pdf`, 56 páginas.
  **Evidencia**: extraído con `pdftotext -layout` (2755 líneas). Estructura en
  6 partes: PARTE I · NEGOCIO, PARTE II · PRODUCTO, PARTE III · ARQUITECTURA,
  PARTE IV · PLAN DE CONSTRUCCIÓN, PARTE V · PROTOCOLO DE CONSTRUCCIÓN
  AUTÓNOMA, PARTE VI · GO-TO-MARKET Y OPERACIÓN. Confirma que el blueprint es
  el documento que consolida y decide sobre los informes de investigación
  (citándolos como `[H06 §7]`, etc., según explica el índice), y que el
  informe de investigación individual (RVnn) es la unidad atómica de
  evidencia, no el blueprint. No se leyó el contenido completo de negocio del
  dominio hotelero (fuera de alcance), solo la tabla de contenidos y
  encabezados de sección para caracterizar la jerarquía documental.

## 3. Módulos completos de Hoteles (estructura, densidad, citas)

- **Archivo**: `03-Hoteles-investigacion/H02-revenue-management-distribucion-
  directo.pdf`, 24 páginas, 406 567 bytes. **Leído completo** vía
  `pdftotext -layout` (1162 líneas).
  **Evidencia extraída**: estructura confirmada — cabecera con proyecto/caso
  ancla/fecha/autor/informes relacionados; "Nota metodológica" declarando qué
  búsquedas funcionaron y qué proxies/dominios bloquearon la sesión; `0.
  Resumen ejecutivo` con 10 hallazgos numerados, cada uno con cifras y
  etiqueta `[DATO]`/`[R]`/`[E]` inline; secciones numeradas 1–7 con
  subsecciones (1.1, 1.2…) y tablas comparativas de proveedores con columna
  "Etiqueta" por fila; sección "7. Cifras de referencia" como tabla resumen
  antes de implicaciones; sección "8. Implicaciones para nuestro producto"
  con subsecciones de agentes/roles, stack a integrar y ROI; sección "9.2 Para
  re-verificar [R] (no accesibles o no encontradas en esta sesión)" como
  sección de lagunas explícita; sección de fuentes agrupada por subtema con
  2-5 URLs por bullet; cierre con línea "Fin del informe H02. Siguiente paso
  sugerido: …". Este patrón es la base directa de la plantilla de módulo RV en
  `00-PLAN.md` §3.

- **Archivo**: `03-Hoteles-investigacion/H15-integraciones-pms-apis-hotel.pdf`,
  26 páginas, 506 437 bytes. **Leído completo** vía `pdftotext -layout`
  (1252 líneas).
  **Evidencia extraída** (el módulo más análogo a RV03–RV08/RV17 de
  rentas vacacionales, por tratar integraciones de calendario/PMS/canal):
  nota metodológica declarando 19/19 dominios de proveedores bloqueados por
  proxy y el pivote a fuentes primarias alternativas (repos oficiales en
  GitHub, paquetes npm/PyPI con versión y fecha verificadas); sección "6.2
  Modelo de datos canónico" con notación de entidades y campos (Property,
  RoomType, Reservation, Folio, Charge, Payment, Event) que sirve de
  referencia de nivel de detalle esperado para RV17; sección "6.3 Patrón de
  conectores" con ingreso webhook-first + polling incremental de respaldo,
  idempotencia, orden/concurrencia, seguridad y observabilidad — base directa
  de las dimensiones de la matriz en `docs/LAGUNAS.md` (webhook vs. polling,
  UID/dedupe, anti-eco); "7. TABLA MAESTRA DE INTEGRACIONES" con columnas
  Presencia/Tipo de API/Capacidades/Auth/Costo/Dificultad/Prioridad/Etiqueta;
  "8.4 Riesgos y mitigaciones" (tabla probabilidad/impacto/mitigación); "8.5
  Qué verificar en la siguiente iteración (bloqueado por proxy/cuota)" como
  sección de lagunas explícita ligada a bloqueos reales declarados; "9. Fuentes
  consultadas" agrupada en "Repositorios y paquetes oficiales (accedidos en
  esta sesión)" vs. el resto — separación explícita entre fuente primaria
  verificada y fuente secundaria.

## 4. Módulo completo de Licitaciones (estructura, densidad, citas)

- **Archivo**: `04-Licitaciones-investigacion/L07-agente-analista-bases-
  cumplimiento.pdf`, 22 páginas, 353 307 bytes. **Leído completo** vía
  `pdftotext -layout` (1033 líneas).
  **Evidencia extraída**: mismo patrón estructural que los informes de
  Hoteles (0. Resumen ejecutivo con 10 hallazgos; secciones numeradas 1-N con
  subsecciones; tablas comparativas) confirmando que la plantilla de módulo es
  **consistente entre las tres líneas de negocio** (Restaurantes, Hoteles,
  Licitaciones), lo cual justifica adoptar la misma plantilla para Rentas
  Vacacionales. Contiene además ejemplo de "principio de diseño" explícito
  (separar "leer" de "entender" en el pipeline de extracción) y regla de "cita
  obligatoria y verificable" (cada requisito extraído lleva cita textual +
  página) — patrón de trazabilidad que se adapta en `00-PLAN.md` a la
  exigencia de URL verificable por afirmación.

## 5. Decisión de modelos (formato de convención de confianza, no de dominio)

- **Archivo**: `DECISIONLLMHOTELES.pdf`, 33 páginas, 840 701 bytes.
  **Leído parcialmente** (primeras ~90 líneas vía `pdftotext -layout`, para
  confirmar formato, no contenido de decisión de modelos de IA).
  **Evidencia extraída**: mismo esquema de convención de confianza
  (`[DATO]`/`[R]`/`[E]`) reutilizado en un documento de decisión técnica (no
  solo en informes de mercado), con declaración explícita de qué dominios
  bloqueó el proxy de salida y qué cuota de búsqueda se agotó antes de cerrar
  huecos — confirma que la práctica de declarar bloqueos y lagunas es
  transversal a todo tipo de documento en la referencia, no solo a los
  informes de investigación de mercado. No se usó ningún contenido de la
  decisión de modelos en sí (fuera de alcance del encargo).

## 6. Metodología deep-research (OpenAI Codex)

- **Archivo**: `~/.codex/plugins/cache/openai-curated-remote/deep-research-
  work/0.1.14/skills/deep-research/SKILL.md`, 183 líneas. **Leído completo**.
  **Evidencia extraída**: 5 fases (definir alcance y plan; investigar y
  reconciliar evidencia con "gap matrix" — afirmación, evidencia, confianza,
  contradicciones, siguiente búsqueda; sintetizar el reporte con ledger
  claim-to-source; crear y verificar el artefacto; entregar el resultado
  verificado). Jerarquía de fuentes en 4 niveles (investigación
  original/fuente oficial > análisis independiente de calidad > comentario de
  especialista > foros/redes como señal anecdótica). Regla de verificación
  cruzada de las afirmaciones de mayor impacto antes de síntesis. Regla de
  rendimiento decreciente para detener la búsqueda. Distinción explícita entre
  hecho citado, inferencia, evidencia inaccesible e incertidumbre — nunca
  mezclarlas bajo una sola etiqueta ni inventar una fuente. Estas reglas se
  incorporaron literalmente en `docs/investigacion/00-PLAN.md` §4.

## 7. Herramientas usadas para esta caracterización

- `pdfinfo` / `pdftotext -layout` (Homebrew, `/opt/homebrew/bin/`) para extraer
  metadatos (páginas, tamaño) y texto con preservación aproximada de tablas de
  los PDF de referencia, todo en modo solo-lectura sobre la carpeta de
  Escritorio del usuario. Ningún archivo de la carpeta de referencia fue
  modificado.
- Salidas de texto intermedias guardadas en el scratchpad de la sesión
  (`/private/tmp/claude-501/.../scratchpad/*.txt`), no en este staging — no
  forman parte del repositorio.

## Cobertura y limitaciones de esta caracterización

- No se leyeron los 76 PDF completos (fuera de alcance del encargo, que pedía
  "al menos 2 módulos completos de Hoteles y 1 de Licitaciones, el índice y un
  blueprint"). Se leyeron 2 módulos de Hoteles completos (H02, H15), 1 módulo
  de Licitaciones completo (L07), el índice completo (9/9 páginas) y la tabla
  de contenidos del blueprint de Hoteles (56 páginas, headers de sección, no
  el cuerpo completo de negocio).
- El inventario de páginas/tamaño sí cubre el 100 % de los PDF encontrados
  (76 archivos) vía `pdfinfo`, aunque no se leyó su contenido.
- No se leyeron `02-Restaurantes-investigacion/*` en detalle (solo aparecen en
  el índice) ni `05-Gobierno-y-protocolo/*` en detalle — no eran parte de la
  muestra pedida y no aportaban a la barra de calidad de investigación de
  mercado (son reglas de operación de Claude Code, no investigación).

# Operación del bucle — Atiende Rentas Vacacionales (continuidad real)

Creado 2026-09-05 desde la sesión Fable (claude-fable-5-1). Mecanismos reales de esta versión de Claude Code: `ScheduleWakeup` (modo dinámico de `/loop`), `CronCreate/CronList/CronDelete` (solo sesión), notificaciones de agentes en segundo plano. Independiente de los crons de Hoteles (`f24bfd35`) y Licitaciones: no se tocan.

## Mecanismo primario — ScheduleWakeup (bucle dinámico)
- **Identificador:** no emite ID. Evidencia: llamada `ScheduleWakeup` al cierre de cada turno + línea "DESPERTAR" en `docs/logs/bucle.log`.
- **Frecuencia:** autoprogramada 60–3600 s. Con agentes Sonnet en curso: 1200–1800 s (las notificaciones de fin de agente despiertan antes). Con trabajo inmediato: 60–300 s.
- **Prompt de reanudación (verbatim):** `Lee /Users/javiercamaraportepetit/Documents/Codex/atiende-rentas-vacacionales-staging/docs/operacion-bucle.md, docs/PROGRESO.md, docs/BLOQUEOS.md y docs/AGENTES.md y continúa el ciclo de Atiende Rentas Vacacionales; Fable solo orquesta; todo agente model=sonnet explícito.`
- **Persistencia:** solo sesión.

## Mecanismo de respaldo — CronCreate
- **ID:** `71e0bad6` (Fase 1–2, eliminado al cierre) → **Fase 3: `95b67309`** (`41 */2 * * *`, creado 2026-09-06 08:20)
- **Cron:** `23 */2 * * *` (cada 2 h al minuto 23, hora local). Recurrente. Solo dispara con la sesión ociosa.
- **Persistencia:** solo sesión; **autoexpira a los 7 días** (~2026-09-12) tras un último disparo.
- **Alcance del prompt:** si el bucle dinámico vive → solo latido en `docs/logs/bucle.log`; si murió → reanudar desde `docs/PROGRESO.md`.

## Alcance del ciclo
**Fase 1 (activa):** investigación por familias RV01–RV21 (Sonnet) → auditoría de investigación (Sonnet independiente: afirmaciones de mayor impacto, contradicciones, matriz por canal) → corrección (Sonnet) → consolidación (00-INDICE, FUENTES, LAGUNAS, BLUEPRINT, DECISIONES, REQUISITOS, ACEPTACION; PDF si hay herramientas) → **cierre auditado registrado en PROGRESO.md**. Solo entonces:
**Fase 2:** backlog trazable → implementación (Sonnet) → pruebas con salida real en `docs/logs/` → auditoría adversarial (Sonnet, contexto independiente, `docs/auditoria-N/`) → corrección (un hallazgo = un commit) → reverificación.
Fable solo despacha, reconcilia, verifica aceptación y decide; nunca investiga a fondo ni construye.

## Condición de parada
1. Todos los criterios de `docs/ACEPTACION.md` con evidencia (comando + salida) y sin defectos críticos/altos abiertos; o
2. Bloqueo externo real sin trabajo independiente restante: 3 intentos sin progreso en `docs/BLOQUEOS.md`.
Al parar: `ScheduleWakeup(stop:true)`, `CronDelete 71e0bad6`, `PushNotification` al usuario, entrada final en `docs/PROGRESO.md`. Un fallo que resiste 3 intentos se documenta y se continúa con tareas independientes.

## Reanudación tras cierre de sesión
```
cd /Users/javiercamaraportepetit/Documents/Codex/atiende-rentas-vacacionales-staging
claude --model fable
/loop
# pegar el prompt de reanudación de arriba
```
Reanudar desde `docs/PROGRESO.md` (último paso), `docs/BLOQUEOS.md`, `docs/AGENTES.md`, `docs/investigacion/`. No repetir trabajo validado.

## Evidencia de ejecución
- 2026-09-05 — `CronCreate` → `Scheduled recurring job 71e0bad6 (Every 2 hours at :23). Session-only... Auto-expires after 7 days.`
- Latidos/despertares: `docs/logs/bucle.log`.

## Parada del bucle — 2026-09-06 08:08
- Condición 1 satisfecha: cierre auditado de Fase 2 aprobado (docs/auditoria-2/00-SINTESIS.md), sin defectos críticos/altos abiertos, evidencia de alcance en docs/logs, docs/capturas y pruebas. Lo no cerrable es exclusivamente externo (B-001..B-005).
- Acciones: `ScheduleWakeup(stop:true)`, `CronDelete 71e0bad6`, `PushNotification` al usuario, entrada final en docs/PROGRESO.md.

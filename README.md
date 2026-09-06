# Atiende Rentas Vacacionales — staging provisional

Software enterprise para anfitriones, coanfitriones y administradores de alojamientos en Airbnb, Booking.com y otros canales. Pregunta central: calendario unificado y sincronizado (cerrar disponibilidad entre canales; nunca cancelar reservas ni contactar huéspedes sin autorización).

**Esta carpeta es provisional** (`~/Documents/Codex/atiende-rentas-vacacionales-staging`). La carpeta definitiva de "empresas agénticas" no está localizada (ver `docs/BLOQUEOS.md` B-001). Nada aquí finge ser la ubicación definitiva.

Orquestación: Fable 5.1 solo coordina; toda investigación, construcción y auditoría la ejecutan agentes `model=sonnet` explícitos (ver `docs/AGENTES.md`).

Fases: 1) investigación profunda + auditoría (`docs/investigacion/`, `docs/FUENTES.md`, `docs/LAGUNAS.md`, `docs/BLUEPRINT.md`) → 2) construcción enterprise. Continuidad: `docs/operacion-bucle.md`, `docs/PROGRESO.md`, `docs/logs/bucle.log`.

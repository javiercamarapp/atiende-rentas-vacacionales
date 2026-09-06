# Alternativa de despliegue a Vercel (Lote 3.3): un VPS propio con Docker
# Compose (deploy/docker-compose.yml) — tres imágenes a partir de este
# único Dockerfile multi-stage: `api` (Node.js + Hono, sirviendo con
# `@hono/node-server`, igual que en desarrollo) y `web` (build estático de
# Vite servido con un `nginx` mínimo). Postgres corre como su propia
# imagen oficial en `docker-compose.yml`, no aquí.
#
# NOTA IMPORTANTE (documentada, no oculta): los paquetes internos del
# monorepo (`@atiende-rv/domain`, `/adapters`, `/sim`, `/db`) exponen su
# `package.json` `main`/`exports` directo a `./src/index.ts` (TypeScript
# SIN compilar) — el mismo motivo por el que el empaquetado de Vercel
# necesitó un bundle explícito con esbuild (ver deploy/build-api-vercel.mjs
# y su comentario de cabecera). Para no duplicar esa complejidad aquí, la
# etapa `api` de este Dockerfile corre el servidor con `tsx` (el mismo
# intérprete de TypeScript que usa `npm run dev`) en vez de compilar con
# `tsc` — funciona, pero es más lento para arrancar que un `dist/`
# puramente JS; si el rendimiento de arranque en frío importa en tu VPS,
# considera adaptar `deploy/build-api-vercel.mjs` para generar también
# este artefacto (fuera del alcance de este Lote).

FROM node:22-bookworm-slim AS base
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/sim/package.json packages/sim/package.json
COPY packages/ui-atiende/package.json packages/ui-atiende/package.json
RUN npm ci

FROM base AS repo-completo
COPY . .

# --- Imagen `api` ---------------------------------------------------------
FROM repo-completo AS api
ENV NODE_ENV=production
EXPOSE 8787
# Fail-closed sin cambios (apps/api/src/config/env.ts): el contenedor
# ABORTA al arrancar si faltan JWT_SECRET/CANAL_CIFRADO_CLAVES — nunca
# arranca "a medias" en modo inseguro. Ver deploy/docker-compose.yml y
# docs/despliegue/README.md para las variables obligatorias.
CMD ["npx", "tsx", "apps/api/src/index.ts"]

# --- Imagen `web` (build estático + nginx) --------------------------------
FROM repo-completo AS web-build
# Mismo origen relativo que en Vercel (nginx hace de proxy de /api/* hacia
# el contenedor `api` — ver docker-compose.yml `nginx.conf`).
ENV VITE_API_URL=/api
RUN npm run build --workspace=@atiende-rv/web

FROM nginx:1.27-alpine AS web
COPY --from=web-build /repo/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

// PLACEHOLDER commiteado a proposito - ver el comentario junto a
// `/api/` en `.gitignore` (raiz del repo) para el porque.
//
// Este archivo se sobreescribe SIEMPRE con el bundle real generado por
// `npm run build:api-vercel` (deploy/build-api-vercel.mjs, a partir de
// `apps/api/api/index.ts`) como parte de `buildCommand` en `vercel.json`,
// tanto en `vercel build`/`vercel deploy` locales como en cualquier
// deploy disparado desde GitHub. Existe en git unicamente para que
// Vercel lo detecte como Serverless Function (y aplique el `maxDuration`
// de `vercel.json`) ANTES de correr el build - que es cuando escanea
// `/api/` en el checkout inicial. Su contenido real nunca se sirve en
// produccion.
export const fetch = async () =>
  new Response("placeholder sin build - corre npm run build:api-vercel", {
    status: 503,
  });

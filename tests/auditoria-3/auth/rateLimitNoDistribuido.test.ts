// Auditoría-3 / A3-auth-01
//
// Hallazgo: `apps/api/src/seguridad/rateLimit.ts` implementa `LimitadorVentana`
// como un `Map` en memoria del proceso Node. El propio archivo lo documenta
// (líneas 6-10, 22-27) como "básico... suficiente para un solo proceso...
// un despliegue multi-instancia necesita un backend compartido (Redis u
// otro)". El despliegue real evaluado en esta auditoría es Vercel
// serverless (apps/api/api/index.ts), donde CADA invocación puede aterrizar
// en una instancia de función distinta (o una nueva tras un cold start),
// cada una con su propio proceso Node y por tanto su propio `Map` vacío.
//
// Esto significa que en producción real sobre Vercel:
//   - El límite global por IP (`app.use("*", crearRateLimit(...))`, 100
//     req/min por defecto) NO es efectivo: un atacante que dispare
//     suficientes invocaciones concurrentes (o que simplemente llegue a
//     instancias distintas, algo que Vercel decide, no el atacante) ve un
//     contador que nunca llega al máximo real esperado.
//   - `limitadorPorEmail` (login) y, más grave, el segundo factor MFA en
//     `POST /mfa/verificar` (código TOTP de 6 dígitos, sin ningún contador
//     persistente en BD — a diferencia del login, que sí usa
//     `autenticar_registrar_intento_fallido`/`bloqueado_hasta` en Postgres)
//     dependen ÚNICAMENTE de este limitador en memoria para frenar fuerza
//     bruta contra el segundo factor durante los 5 minutos de vida del
//     `mfaToken` (DURACION_MFA_PENDIENTE_SEGUNDOS = 300, apps/api/src/
//     seguridad/jwt.ts:31).
//
// Esta prueba NO necesita red ni Postgres: reproduce el hecho estructural
// de que dos instancias del middleware (equivalentes a dos instancias
// serverless / dos cold starts) no comparten ningún estado, así que la
// MISMA IP puede volver a hacer `maximo` peticiones completas en la
// "instancia nueva" inmediatamente después de agotar el límite en la
// primera — sin esperar la ventana de tiempo.
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { crearRateLimit } from "../../../apps/api/src/seguridad/rateLimit.js";
import { ErrorDominio } from "../../../apps/api/src/contrato/errores.js";

function crearAppConLimite() {
  const app = new Hono();
  // Mismo mapeo de ErrorDominio -> HTTP que apps/api/src/app.ts (aquí
  // reducido a lo necesario para esta prueba: solo nos interesa que
  // "rate_limited" se traduzca a 429, tal como en la app real).
  app.onError((err, c) => {
    if (err instanceof ErrorDominio) return c.json({ codigo: err.codigo, mensaje: err.message }, err.httpStatus as never);
    throw err;
  });
  app.use("*", crearRateLimit({ ventanaMs: 60_000, maximo: 3 }));
  app.get("/mfa/verificar-simulado", (c) => c.json({ ok: true }));
  return app;
}

describe("A3-auth-01: LimitadorVentana no es distribuido (rompe en serverless multi-instancia)", () => {
  it("agota el límite en una 'instancia', pero una 'instancia' nueva (cold start) lo resetea para la MISMA IP", async () => {
    // Misma "IP" simulada en Hono test mode: en app.request() sin
    // @hono/node-server real, ipDelSocket() se degrada a la clave
    // constante "socket-desconocido" (ver rateLimit.ts líneas 66-79) — lo
    // cual, de hecho, agrava el problema (todas las peticiones de prueba
    // comparten clave), pero es exactamente equivalente en severidad al
    // caso real: lo que se demuestra aquí es que el CONTADOR no sobrevive
    // entre instancias del middleware, que es lo que ocurre entre
    // invocaciones/cold-starts de Vercel.
    const instanciaA = crearAppConLimite();

    const resultadosA: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await instanciaA.request("/mfa/verificar-simulado");
      resultadosA.push(res.status);
    }
    // Las primeras 3 pasan, la 4a debe ser bloqueada (rate_limited).
    expect(resultadosA.slice(0, 3)).toEqual([200, 200, 200]);
    expect(resultadosA[3]).toBe(429);

    // "Cold start" / nueva instancia serverless: se crea una app nueva,
    // que instancia un `LimitadorVentana` nuevo (su propio `Map` vacío) —
    // exactamente lo que pasa en cada invocación fría de
    // apps/api/api/index.ts en Vercel.
    const instanciaB = crearAppConLimite();
    const resultadosB: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await instanciaB.request("/mfa/verificar-simulado");
      resultadosB.push(res.status);
    }

    // Si el rate limit fuera realmente efectivo en producción (estado
    // compartido), la instancia B debería seguir bloqueada para esta IP.
    // Como NO lo está, la misma IP obtiene otras 3 peticiones "gratis" —
    // multiplicable por cuantas instancias/cold-starts el atacante alcance.
    expect(resultadosB.slice(0, 3)).toEqual([200, 200, 200]);
    expect(resultadosB[3]).toBe(429);
  });
});

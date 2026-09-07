#!/usr/bin/env -S npx tsx
/**
 * Envía un correo de prueba con el adaptador que resulte de construir
 * desde el entorno actual (`construirAdaptadorCorreo`) — el mismo código
 * que usa la API real, no un cliente HTTP aparte. Ver
 * `apps/api/src/seguridad/plantillasCorreo/DESPLIEGUE.md` para el
 * procedimiento completo de verificación de dominio y variables en
 * Vercel.
 *
 * Uso (desde la raíz del monorepo, con las variables de entorno de
 * Resend/SMTP ya exportadas en el shell):
 *
 *   npx tsx apps/api/scripts/enviarCorreoPrueba.ts destinatario@ejemplo.com
 *
 * Sin RESEND_API_KEY ni SMTP_HOST en el entorno, usa el adaptador
 * SIMULADO (nunca envía correo real) y solo imprime el correo generado —
 * mismo comportamiento fail-safe que el resto de la API.
 */
import { construirAdaptadorCorreo, correoVerificacion, AdaptadorCorreoSimulado } from "../src/seguridad/correo.js";

async function main(): Promise<void> {
  const destinatario = process.argv[2];
  if (!destinatario) {
    console.error("uso: npx tsx apps/api/scripts/enviarCorreoPrueba.ts destinatario@ejemplo.com");
    process.exitCode = 1;
    return;
  }

  const adaptador = construirAdaptadorCorreo(process.env);
  const { asunto, textoPlano, html } = correoVerificacion("https://ejemplo.invalido/verificar?token=prueba");

  await adaptador.enviar({ para: destinatario, asunto: `[PRUEBA] ${asunto}`, textoPlano, html });

  if (adaptador instanceof AdaptadorCorreoSimulado) {
    console.log(
      "Adaptador SIMULADO (sin RESEND_API_KEY ni SMTP_HOST en el entorno) — no se envió ningún correo real. " +
        "Correo generado arriba (log 'correo-simulado').",
    );
  } else {
    console.log(`Correo de prueba enviado a ${destinatario}.`);
  }
}

main().catch((error) => {
  console.error("Fallo al enviar el correo de prueba:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

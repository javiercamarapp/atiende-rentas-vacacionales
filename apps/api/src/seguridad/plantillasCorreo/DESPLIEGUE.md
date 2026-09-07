# Correo transaccional (Resend) — despliegue

> Nota de ubicación: este documento vive aquí (y no en `docs/despliegue/`)
> porque, en el programa de este lote (`docs/PROGRAMA-PUNTA-A-PUNTA.md`),
> `docs/despliegue/**` es un archivo mutable exclusivo del paquete
> `db-supabase` — este paquete (`correo-resend`) no lo toca para no
> solaparse. Si el orquestador quiere consolidar toda la documentación de
> despliegue en `docs/despliegue/correo.md`, mover este archivo ahí es un
> cambio mecánico (sin lógica que migrar).

## 1. Verificar el dominio en Resend (DKIM/SPF)

1. En el dashboard de Resend, ir a **Domains → Add Domain** y agregar el
   dominio de envío (p. ej. `useatiende.ai`, o un subdominio dedicado como
   `mail.useatiende.ai` — recomendado para no arriesgar la reputación del
   dominio raíz).
2. Resend genera 3 registros DNS a agregar en el registrador del dominio:
   - Un registro **TXT** para SPF (o se añade `include:amazonses.com` al
     TXT de SPF existente si ya hay uno — nunca dos registros SPF
     separados, DNS solo respeta el primero).
   - Dos registros **CNAME** para DKIM.
   - Opcional pero recomendado: un registro **TXT** para DMARC
     (`_dmarc.<dominio>`) con al menos `p=none` para empezar a monitorear
     sin rechazar correo.
3. Esperar la propagación DNS (minutos a horas) y pulsar **Verify** en el
   dashboard de Resend. El dominio pasa a estado `verified`.
4. `RESEND_FROM` debe usar una dirección de ese dominio verificado, p. ej.
   `Atiende <no-responder@useatiende.ai>` — Resend rechaza (o marca como
   no confiable) el envío desde un dominio no verificado.

## 2. Variables de entorno en Vercel

En el proyecto de `apps/api` en Vercel (Settings → Environment Variables),
para el entorno de Production (y Preview si se quiere probar antes):

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | API key creada en Resend (Settings → API Keys) — permiso mínimo "Sending access", no "Full access" |
| `RESEND_FROM` | p. ej. `Atiende <no-responder@useatiende.ai>` (dominio verificado en el paso 1) |
| `APP_PUBLIC_URL` | URL pública del frontend, p. ej. `https://atiende-rentas-vacacionales.vercel.app` (o el dominio propio si ya está configurado) |

Sin `RESEND_API_KEY`, la API sigue funcionando exactamente igual que hoy
(SMTP si `SMTP_HOST` está definido, si no el adaptador simulado) — activar
Resend es un cambio de configuración explícito, nunca automático.

**Fail-closed:** si se define `RESEND_API_KEY` sin `RESEND_FROM`, el
arranque de la API falla explícitamente (`construirAdaptadorCorreo` lanza)
en vez de enviar correos con un remitente inventado. Definir ambas
variables juntas.

## 3. Enviar un correo de prueba

Con las variables de entorno cargadas (`RESEND_API_KEY`, `RESEND_FROM`, y
opcionalmente `APP_PUBLIC_URL`), desde la raíz del monorepo:

```bash
npx tsx apps/api/scripts/enviarCorreoPrueba.ts destinatario@ejemplo.com
```

El script construye el adaptador de correo desde el entorno (misma
función `construirAdaptadorCorreo` que usa la API real) y envía un correo
de verificación de ejemplo con el HTML de marca — así se prueba el mismo
código que corre en producción, no un cliente HTTP aparte. Si no hay
`RESEND_API_KEY` ni `SMTP_HOST` en el entorno, el script usa el adaptador
simulado y solo imprime el correo por consola (no falla, mismo
comportamiento fail-safe que la API).

Equivalente en curl directo contra la API de Resend (para probar la
cuenta/clave sin pasar por este repo):

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "'"$RESEND_FROM"'",
    "to": ["destinatario@ejemplo.com"],
    "subject": "Prueba Atiende",
    "html": "<p>Correo de prueba.</p>",
    "text": "Correo de prueba."
  }'
```

import type { Migracion } from "../runner/tipos.js";

// Rango 0110-0119 reservado a Lote 3.4 (Fase 3, RV22 "canales de
// distribución usados en México") — numerado lejos de 0001-0108 (ya
// asignados a Lotes 0-11B y Lote 3.2, ver cabeceras de esas migraciones)
// para no colisionar con el trabajo concurrente de Lote 3.0/3.2 sobre el
// mismo archivo `index.ts` (misma técnica ya usada por 0090/0100).
//
// `canal_catalogo`: catálogo DECLARATIVO de "qué canales existen y qué se
// sabe de cada uno" — independiente de si el tenant ya tiene una
// `cuenta_canal` configurada (esa es la capa transaccional de la
// migración 0020/0064/0090). Una fila por VÍA técnica de un canal (no por
// canal): Airbnb tiene dos filas (`ical` y `api_partner`) porque RV22 las
// documenta con niveles/estados distintos; lo mismo Vrbo. Fuente única de
// verdad de cada campo: `docs/investigacion/RV22-canales-mexico.md`
// (matriz §1, fichas §2) — cada fila cita su(s) F-xxx en `fuente`, nunca
// se inventa un dato sin cita.
//
// `nivel` ('A'/'B'/'C') replica la clasificación de RV22 §4. `estado_
// honesto` usa el vocabulario de catálogo (distinto del
// `EstadoConexionCanal` de tiempo de ejecución en `@atiende-rv/domain`,
// que solo aplica a una `cuenta_canal` real con evidencia de sync): un
// canal Nivel C sin ninguna vía de sincronización (p. ej. Plum Guide) no
// tiene "conexión" que evaluar, así que su estado honesto es `no_aplica`
// o `manual`, nunca uno de los seis valores de `EstadoConexionCanal`
// (RV22-R-06/R-07/R-08).
export const migracion0110CatalogoCanalesMexico: Migracion = {
  id: "0110_catalogo_canales_mexico",
  descripcion: "canal_catalogo: niveles A/B/C, estado honesto, capacidades, latencia, requisitos (RV22)",
  up: `
    CREATE TABLE canal_catalogo (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      canal_codigo              text NOT NULL,
      nombre                    text NOT NULL,
      nivel                     text NOT NULL CHECK (nivel IN ('A', 'B', 'C')),
      via_tecnica               text NOT NULL CHECK (via_tecnica IN (
                                  'ical_import_export', 'ical_export_equivalente', 'api_partner',
                                  'channel_manager_puente', 'feed_ari', 'catalogo_manual', 'ninguna'
                                )),
      -- Vocabulario de catálogo (RV22-R-06), NUNCA los valores de tiempo de
      -- ejecución de EstadoConexionCanal (@atiende-rv/domain): este campo
      -- describe la vía en abstracto, no una cuenta concreta ya conectada.
      estado_honesto            text NOT NULL CHECK (estado_honesto IN ('ical', 'partner_pendiente', 'manual', 'no_aplica')),
      capacidades               jsonb NOT NULL DEFAULT '{}'::jsonb,
      latencia                  jsonb,
      url_proceso_oficial       text,
      requisitos_credenciales   jsonb NOT NULL DEFAULT '[]'::jsonb,
      motivo                    text,
      fuente                    text NOT NULL,
      -- Para canales "vía puente" (Despegar/PriceTravel vía SiteMinder):
      -- código del canal_catalogo que actúa de intermediario.
      puente_canal_codigo       text,
      orden                     integer NOT NULL DEFAULT 0,
      creado_en                 timestamptz NOT NULL DEFAULT now(),
      UNIQUE (canal_codigo, via_tecnica)
    );
    CREATE INDEX canal_catalogo_nivel_idx ON canal_catalogo (nivel);

    -- Restricción de coherencia (RV22-R-06/R-09): un estado_honesto
    -- 'partner_pendiente' o 'no_aplica' siempre exige un motivo citado —
    -- nunca un bloqueo sin explicación visible en la UI.
    ALTER TABLE canal_catalogo ADD CONSTRAINT canal_catalogo_motivo_requerido CHECK (
      estado_honesto NOT IN ('partner_pendiente', 'no_aplica') OR btrim(COALESCE(motivo, '')) <> ''
    );

    -- ==========================================================
    -- NIVEL A — iCal / vía pública sin aprobación de partner
    -- ==========================================================
    INSERT INTO canal_catalogo
      (canal_codigo, nombre, nivel, via_tecnica, estado_honesto, capacidades, latencia,
       url_proceso_oficial, requisitos_credenciales, motivo, fuente, orden)
    VALUES
      ('airbnb', 'Airbnb — iCal', 'A', 'ical_import_export', 'ical',
       '{"availabilityPush": true, "ratesPush": false, "reservationsPull": false, "icalImportExport": true, "messaging": false}'::jsonb,
       '{"texto": "~3 horas; ventana de importación de hasta 2 años", "confianza": "baja-media", "minutosEstimados": 180, "ventanaImportacionAnios": 2}'::jsonb,
       'https://www.airbnb.mx/help/article/99',
       '["URL del calendario iCal de la unidad en Airbnb (Configuración > Disponibilidad > Sincronizar calendarios)"]'::jsonb,
       NULL, 'RV22 F01-F02, D-003', 1),

      ('vrbo', 'Vrbo — iCal', 'A', 'ical_import_export', 'ical',
       '{"availabilityPush": true, "ratesPush": false, "reservationsPull": false, "icalImportExport": true, "messaging": false}'::jsonb,
       '{"texto": "~30 min + hasta 20 min de propagación", "confianza": "media-alta", "minutosEstimados": 50}'::jsonb,
       'https://www.vrbo.com/help',
       '["URL del calendario iCal de la unidad en el Owner Dashboard de Vrbo"]'::jsonb,
       NULL, 'RV22 F14, D-003', 2),

      ('agoda', 'Agoda — calendar link', 'A', 'ical_export_equivalente', 'ical',
       '{"availabilityPush": true, "ratesPush": false, "reservationsPull": false, "icalImportExport": true, "messaging": false}'::jsonb,
       '{"texto": "\\"varias veces al día\\" (no oficial exacto)", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://ycs.agoda.com',
       '["URL del \\"calendar link\\" del extranet/YCS de Agoda para la propiedad"]'::jsonb,
       NULL, 'RV22 §2.8/§4 Nivel A #3, RV05 [R]', 3),

      ('mercadolibre', 'Mercado Libre — Renta Vacacional (sin calendario)', 'A', 'catalogo_manual', 'manual',
       '{"availabilityPush": false, "ratesPush": false, "reservationsPull": false, "icalImportExport": false, "messaging": false}'::jsonb,
       NULL, 'https://vendedores.mercadolibre.com.mx',
       '["Cuenta de Mercado Libre para publicar el anuncio (API pública de ítems, sin credenciales de partner)"]'::jsonb,
       'Categoría "MLM-APARTMENTS_FOR_VACATION_RENTAL" con "reservation_allowed":"not_allowed" — solo anuncio clasificado estático, sin motor de reservas ni calendario (RV22-R-07): nunca se promete cierre de disponibilidad en este canal.',
       'RV22 F43-F45', 4)
    ;

    -- ==========================================================
    -- NIVEL B — spec pública, bloqueado por partner/credenciales
    -- ==========================================================
    INSERT INTO canal_catalogo
      (canal_codigo, nombre, nivel, via_tecnica, estado_honesto, capacidades, latencia,
       url_proceso_oficial, requisitos_credenciales, motivo, fuente, puente_canal_codigo, orden)
    VALUES
      ('booking', 'Booking.com — API Connectivity (OTA/B.XML)', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "pull de reservas cada ~20s con ack; sin cifra de latencia de push publicada", "confianza": "media", "minutosEstimados": null}'::jsonb,
       'https://connect.booking.com',
       '["Machine account de Booking.com (usuario/clave del Connectivity Partner Program)", "Certificación PCI/PII diferenciada por API"]'::jsonb,
       'Booking pausa nuevos connectivity providers (connect.booking.com, 2026-09-06) — "pausing integrations with new connectivity providers until further notice"',
       'RV22 F03, D-011 (evidencia B-002)', NULL, 10),

      ('expedia', 'Expedia Group — Lodging Connectivity API', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "sin SLA publicado para Availability & Rates; Booking Notification push único al crear la reserva", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://connectivityportal.expediagroup.com',
       '["Cuenta de partner con licencia comercial (Expedia Partner Solutions)", "Attestation of Compliance PCI anual", "TLS 1.2+", "Credenciales OAuth2 client_credentials del sandbox api.sandbox.expediagroup.com"]'::jsonb,
       'Requiere PCI/TLS/license agreement y aprobación de partner; formulario comercial no público (sin autoservicio)',
       'RV22 F04-F13', NULL, 11),

      ('vrbo', 'Vrbo — API propia (stack HomeAway)', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "sin SLA propio confirmado", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://connectivityportal.expediagroup.com/documentation/vrbo',
       '["Integration Engagement Manager de Vrbo (onboarding artesanal, no autoservicio)", "Whitelisting de IP, hasta ~3 semanas"]'::jsonb,
       'Onboarding vía Integration Engagement Manager con whitelisting de hasta 3 semanas; NO comparte superficie técnica con Expedia (RV22-R-02/R-05)',
       'RV22 F13', NULL, 12),

      ('airbnb', 'Airbnb — API partner (Homes/Activities)', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": false, "reservationsPull": true, "icalImportExport": false, "messaging": true}'::jsonb,
       '{"texto": "sin SLA documentado", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://developer.withairbnb.com/join-airbnb-api-program',
       '["NDA firmado con Airbnb", "Revisión de seguridad de datos", "Certificación de partner", "6 meses post-aprobación para features obligatorias"]'::jsonb,
       'NDA + revisión de seguridad + certificación de partner (RV03); sin fecha estimada de aprobación',
       'RV22 §2.1, RV03', NULL, 13),

      ('google_vr', 'Google Vacation Rentals — feed ARI', 'B', 'feed_ari', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": false, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "sin SLA publicado", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://developers.google.com/hotels/vacation-rentals/dev-guide/onboarding',
       '["Invitación de un Technical Account Manager de Google (sin autoservicio)", "Feeds XML: Property Listings + Pricing + Landing Pages"]'::jsonb,
       'Programa exclusivamente por invitación (Technical Account Manager); sin autoservicio (RV22-R-08)',
       'RV22 F29-F30', NULL, 14),

      ('siteminder', 'SiteMinder pmsXchange (puente)', 'B', 'channel_manager_puente', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "push \\"real-time\\" declarado, sin cifra numérica", "confianza": "media", "minutosEstimados": null}'::jsonb,
       'https://developer.siteminder.com',
       '["Contrato comercial con SiteMinder (no autoservicio)", "Credenciales de pmsXchange (API pública documentada)"]'::jsonb,
       'Requiere contrato comercial con SiteMinder; cubre Booking.com/Expedia/Vrbo/Despegar/PriceTravel como intermediario ya certificado (Best Day no confirmado)',
       'RV22 F24-F25', NULL, 15),

      ('despegar', 'Despegar/Decolar (vía puente)', 'B', 'channel_manager_puente', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "onboarding 3-5 días declarado por el channel manager (vía tercero)", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://www.rentalsunited.com/connected-listings/despegar',
       '["Sin API/spec pública propia — requiere alta con un channel manager certificado (SiteMinder/Rentals United)"]'::jsonb,
       'Sin API/spec técnica pública propia (developers.despegar.com no resuelve); solo vía channel manager certificado',
       'RV22 F16-F19', 'siteminder', 16),

      ('pricetravel', 'PriceTravel (vía puente)', 'B', 'channel_manager_puente', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "onboarding 2-3 semanas declarado por el channel manager (vía tercero)", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://autoenrollment.pricetravel.com',
       '["Sin API/spec pública propia confirmada para vacation rentals — requiere alta con un channel manager certificado (SiteMinder/Rentals United)"]'::jsonb,
       'Portal de auto-registro sin contenido funcional verificado; conectividad de vacation rentals solo confirmada por un channel manager tercero',
       'RV22 F22-F23', 'siteminder', 17),

      ('holidu', 'Holidu', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       NULL, 'https://www.holidu.com/host/partners',
       '["Confirmar cobertura LatAm directamente con Holidu antes de cualquier integración"]'::jsonb,
       'Cobertura LatAm/México no confirmada (enfoque predominantemente europeo); requiere verificación de geografía antes de invertir',
       'RV08 LAGUNAS §4.1', NULL, 18),

      ('hotels_com', 'Hotels.com', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": false, "ratesPush": false, "reservationsPull": false, "icalImportExport": false, "messaging": false}'::jsonb,
       NULL, 'https://connectivityportal.expediagroup.com',
       '["Sin árbol de documentación propio confirmado — probablemente requiere el mismo stack de Expedia"]'::jsonb,
       'Sin confirmación de token/onboarding separado del de Expedia Group (laguna); no construido como adaptador propio',
       'RV22 §2.3 (laguna)', NULL, 19)
    ;

    -- ==========================================================
    -- NIVEL C — sin vía técnica implementable (manual/no_aplica)
    -- ==========================================================
    INSERT INTO canal_catalogo
      (canal_codigo, nombre, nivel, via_tecnica, estado_honesto, capacidades, url_proceso_oficial,
       requisitos_credenciales, motivo, fuente, orden)
    VALUES
      ('bestday', 'Best Day', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, NULL, '[]'::jsonb,
       'Sin evidencia verificable de ningún tipo (bloqueo total 403/ENOTFOUND en todos los intentos); requiere verificación humana directa antes de reclasificar (RV22-R-09)',
       'RV22 F20-F21', 30),

      ('tripadvisor_rentals', 'TripAdvisor Rentals', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, NULL, '[]'::jsonb,
       'Estado operativo indeterminado (403 persistente en 2 sesiones, sin herramientas de archivo disponibles); reverificar cada 4-6 semanas (RV22-R-10)',
       'RV22 F33', 31),

      ('flipkey', 'FlipKey', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, NULL, '[]'::jsonb,
       'Canal cerrado, confirmado en vivo ("Flipkey has closed down, please visit Tripadvisor")',
       'RV22 F32', 32),

      ('hometogo', 'HomeToGo', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, 'https://www.hometogo.com/list-your-property', '[]'::jsonb,
       'Solo acepta Smoobu como channel manager certificado; sin API abierta para PMS de terceros',
       'RV22 F35-F37', 33),

      ('marriott_hv', 'Marriott Homes & Villas', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, 'https://homes-and-villas.marriott.com', '[]'::jsonb,
       'Solo vía 32 channel managers ya certificados (7 Elite + 25 Standard); sin autoservicio ni ruta de aplicación directa',
       'RV22 F39-F40', 34),

      ('plumguide', 'Plum Guide', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, 'https://plumguide.com/become-a-host', '[]'::jsonb,
       'Sin presencia confirmada en México; modelo de curación (solo 3% aceptado) incompatible con integración masiva',
       'RV22 F41', 35),

      ('hopper', 'Hopper Homes', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, NULL, '[]'::jsonb,
       'Sin programa de partner/API identificable; estado del producto en 2026 no verificable (SPA sin renderizar, cero capturas de archivo)',
       'RV22 F42', 36),

      ('facebook_marketplace', 'Facebook Marketplace', 'C', 'catalogo_manual', 'manual', '{}'::jsonb, NULL,
       '["Cuenta de Facebook para publicar el anuncio manualmente"]'::jsonb,
       'Sin evidencia de API estructurada para renta de corto plazo ni de uso significativo verificado; solo publicación manual, nunca sincronización de disponibilidad (RV22-R-07)',
       'RV22 F46', 37)
    ;
  `,
  down: `
    DROP TABLE IF EXISTS canal_catalogo;
  `,
};

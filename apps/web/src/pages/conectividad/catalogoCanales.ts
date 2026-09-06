// Catálogo estático de canales (LOTES.md Lote 4 punto 3): capacidades
// declaradas, latencia externa declarada con nota de confianza, y motivo
// exacto de cualquier estado bloqueado/pausado. Fuente: docs/fase2/
// PLAN-CONSTRUCCION.md §6 ("Qué queda BLOQUEADO por externo y cómo lo
// muestra la UI") — cada cifra/cita se copia literal de ahí, ninguna se
// inventa aquí. `GET /canales` (Lote 3) solo devuelve las CUENTAS ya
// configuradas por tenant; este catálogo es la capa de "qué canales
// existen y qué se sabe de cada uno", independiente de si hay o no una
// cuenta creada todavía.
export type CanalCodigo = "airbnb" | "vrbo" | "booking";

export interface CapacidadesDeclaradas {
  import: boolean;
  export: boolean;
  tarifas: boolean;
  mensajes: boolean;
}

export interface LatenciaDeclarada {
  texto: string;
  confianza: "alta" | "media" | "baja" | "sin_evidencia";
  nota: string;
}

export interface InfoCanalCatalogo {
  codigo: CanalCodigo;
  nombre: string;
  viaDisponibleFase2: string;
  capacidades: CapacidadesDeclaradas;
  latencia: LatenciaDeclarada;
  /** Solo si la vía directa/preferida está bloqueada por el canal — motivo
   * exacto + cita de origen, nunca una fecha estimada de reapertura
   * (D-017, ACEPTACION §Conectividad-2/§Conectividad-4). */
  bloqueoPartnerDirecto?: { motivo: string; cita: string };
  notaAntiParidad: string;
}

export const CATALOGO_CANALES: Record<CanalCodigo, InfoCanalCatalogo> = {
  airbnb: {
    codigo: "airbnb",
    nombre: "Airbnb",
    viaDisponibleFase2: "iCal import/export (única vía sin aprobación de partner)",
    capacidades: { import: true, export: true, tarifas: false, mensajes: false },
    latencia: {
      texto: "~3 horas",
      confianza: "baja",
      nota:
        "[DATO, confianza baja/media al generalizar a cualquier conexión iCal producto-Airbnb — RV03 S1, " +
        "corrección BC5]. Latencia externa no controlada por Atiende — nunca se suma a la latencia interna.",
    },
    bloqueoPartnerDirecto: {
      motivo: "API partner (Homes/Activities certificada) requiere NDA + revisión de seguridad + 6 meses post-aprobación",
      cita: "PLAN-CONSTRUCCION.md §6 — sin fecha estimada de aprobación",
    },
    notaAntiParidad:
      "El modelo de permisos/latencia de Airbnb no es equivalente al de Vrbo/Booking.com — no asumas el mismo efecto (H-016, REQ-018).",
  },
  vrbo: {
    codigo: "vrbo",
    nombre: "Vrbo",
    viaDisponibleFase2: "iCal import/export (única vía sin aprobación de partner)",
    capacidades: { import: true, export: true, tarifas: false, mensajes: false },
    latencia: {
      texto: "~30 min + 20 min de propagación",
      confianza: "media",
      nota: "[DATO] — confianza media, latencia externa no controlada por Atiende.",
    },
    bloqueoPartnerDirecto: {
      motivo:
        "Connectivity Partner Program (Elite/Preferred/Integrated) — requisitos/costos exactos no confirmados; sin selector de nivel en esta UI",
      cita: "PLAN-CONSTRUCCION.md §6 — solicitar información directa con Expedia Partner Central",
    },
    notaAntiParidad:
      "El modelo de permisos/latencia de Vrbo no es equivalente al de Airbnb/Booking.com — no asumas el mismo efecto (H-016, REQ-018).",
  },
  booking: {
    codigo: "booking",
    nombre: "Booking.com",
    viaDisponibleFase2: "Ninguna vía directa disponible en Fase 2 — solo extranet manual o channel manager certificado de terceros",
    capacidades: { import: false, export: false, tarifas: false, mensajes: false },
    latencia: {
      texto: "SIN EVIDENCIA",
      confianza: "sin_evidencia",
      nota:
        "Cero fuente primaria sobre iCal de Booking.com (elegibilidad/frecuencia), ni viva ni archivada — no se " +
        "muestra ninguna cifra estimada.",
    },
    bloqueoPartnerDirecto: {
      motivo: 'Pausado activamente por el canal: "pausing integrations with new connectivity providers until further notice"',
      cita: "docs/fuentes/b002-archivo.md F01 — no es 'pendiente de aprobación', es puerta cerrada hoy",
    },
    notaAntiParidad:
      "Booking.com no acepta conexiones directas de propiedades individuales (F02) — sin botón de 'conectar directo' en ningún flujo.",
  },
};

export const LISTA_CANALES = Object.values(CATALOGO_CANALES);

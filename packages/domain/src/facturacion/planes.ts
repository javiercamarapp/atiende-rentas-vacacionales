import { centavosDesdeDecimal } from "../finanzas/redondeo.js";
import type { PlanFacturacion } from "./tipos.js";

/**
 * Catálogo de planes POR DEFECTO — usado solo para: (a) sembrar la tabla
 * `plan_facturacion` (migración 0121) en un ambiente nuevo, y (b) como
 * respaldo en pruebas unitarias que no tocan base de datos. El catálogo
 * REAL y editable en runtime vive en la base de datos — Superadmin puede
 * cambiar precios/escalones/límites vía `PATCH /facturacion/planes/:codigo`
 * (`apps/api/src/routes/facturacionAdmin.ts`) sin requerir un despliegue.
 *
 * BORRADOR COMERCIAL (RV16, docs/investigacion/RV16-modelo-negocio-
 * costos.md) — NINGUNA de estas cifras es un precio definitivo. Ancladas
 * en el rango de mercado observado en competidores con precio público
 * (§2: ~15–60 USD/mes/unidad en planes de entrada/medios, bajando en
 * volumen) y en el costo real por conversación de IA calculado en §3b
 * (0.0045–0.0225 USD/conversación con los modelos ahí listados — el
 * add-on de 500 conversaciones/mes asume el escenario Sonnet 5 con
 * margen, NO un compromiso de costo). `etiquetaPrecio: "borrador_comercial"`
 * en cada plan es lo que hace que la UI (apps/web/src/pages/publica/
 * precios) muestre la marca de agua "Precios en borrador — ver RV16" y
 * que el backoffice de Superadmin nunca los presente como definitivos.
 */
export const planesPorDefecto: PlanFacturacion[] = [
  {
    codigo: "esencial",
    nombre: "Esencial",
    descripcion: "Para gestoras con un portafolio pequeño empezando en Atiende.",
    escalones: [
      { hastaUnidades: 5, precioCentavosPorUnidad: centavosDesdeDecimal("35.00") },
      { hastaUnidades: null, precioCentavosPorUnidad: centavosDesdeDecimal("30.00") },
    ],
    addOnsDisponibles: [
      {
        codigo: "ia_conversacional_500",
        nombre: "IA conversacional — 500 mensajes/mes",
        precioCentavosMes: centavosDesdeDecimal("15.00"),
        mensajesIncluidos: 500,
      },
    ],
    limites: { unidadesActivasMax: 15, mensajesIaMesMax: null, cuentasCanalMax: 3 },
    diasPrueba: 14,
    moneda: "USD",
    etiquetaPrecio: "borrador_comercial",
    activo: true,
  },
  {
    codigo: "profesional",
    nombre: "Profesional",
    descripcion: "Para gestoras en crecimiento con varios canales activos.",
    escalones: [
      { hastaUnidades: 10, precioCentavosPorUnidad: centavosDesdeDecimal("28.00") },
      { hastaUnidades: 30, precioCentavosPorUnidad: centavosDesdeDecimal("22.00") },
      { hastaUnidades: null, precioCentavosPorUnidad: centavosDesdeDecimal("18.00") },
    ],
    addOnsDisponibles: [
      {
        codigo: "ia_conversacional_500",
        nombre: "IA conversacional — 500 mensajes/mes",
        precioCentavosMes: centavosDesdeDecimal("15.00"),
        mensajesIncluidos: 500,
      },
      {
        codigo: "ia_conversacional_2000",
        nombre: "IA conversacional — 2,000 mensajes/mes",
        precioCentavosMes: centavosDesdeDecimal("45.00"),
        mensajesIncluidos: 2000,
      },
    ],
    limites: { unidadesActivasMax: 75, mensajesIaMesMax: null, cuentasCanalMax: 10 },
    diasPrueba: 14,
    moneda: "USD",
    etiquetaPrecio: "borrador_comercial",
    activo: true,
  },
  {
    codigo: "portafolio",
    nombre: "Portafolio",
    descripcion: "Para operadores establecidos con portafolios grandes — precio a la baja por volumen.",
    escalones: [
      { hastaUnidades: 30, precioCentavosPorUnidad: centavosDesdeDecimal("20.00") },
      { hastaUnidades: 100, precioCentavosPorUnidad: centavosDesdeDecimal("15.00") },
      { hastaUnidades: null, precioCentavosPorUnidad: centavosDesdeDecimal("10.00") },
    ],
    addOnsDisponibles: [
      {
        codigo: "ia_conversacional_2000",
        nombre: "IA conversacional — 2,000 mensajes/mes",
        precioCentavosMes: centavosDesdeDecimal("45.00"),
        mensajesIncluidos: 2000,
      },
      {
        codigo: "ia_conversacional_ilimitada",
        nombre: "IA conversacional — ilimitada",
        precioCentavosMes: centavosDesdeDecimal("120.00"),
        mensajesIncluidos: null,
      },
    ],
    limites: { unidadesActivasMax: null, mensajesIaMesMax: null, cuentasCanalMax: null },
    diasPrueba: 14,
    moneda: "USD",
    etiquetaPrecio: "borrador_comercial",
    activo: true,
  },
];

export function buscarPlanPorDefecto(codigo: string): PlanFacturacion | undefined {
  return planesPorDefecto.find((p) => p.codigo === codigo);
}

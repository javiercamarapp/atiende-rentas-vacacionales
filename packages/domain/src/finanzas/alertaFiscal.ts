/**
 * H-067 (RV12 §5, B-005, D-023): captura de RFC por unidad + alerta de
 * retención agravada — SIN calcular ningún monto de impuesto. La vigencia
 * de las tasas de retención ISR (4%/20%, LISR art. 113-A/113-C) e IVA
 * (50%/100%, LIVA art. 18-J) para plataformas digitales en México no pudo
 * confirmarse con fuente primaria (`docs/BLOQUEOS.md` B-005) — este módulo
 * NUNCA calcula esas cifras, solo señala honestamente que, sin RFC
 * registrado, el propietario puede estar sujeto a la tasa de retención más
 * alta ("agravada") según la normativa vigente, y remite a revisión
 * legal/fiscal antes de tratar cualquier cifra como definitiva.
 */

export interface AlertaRetencionFiscal {
  rfcRegistrado: boolean;
  /** Siempre `true`: ninguna cifra de este módulo es definitiva sin
   * revisión legal/fiscal (§Legal-1, B-005). */
  requiereRevisionFiscal: true;
  mensaje: string;
}

export function evaluarAlertaRetencionFiscal(rfc: string | null | undefined): AlertaRetencionFiscal {
  const rfcRegistrado = typeof rfc === "string" && rfc.trim().length > 0;
  const mensaje = rfcRegistrado
    ? "RFC registrado. La tasa de retención aplicable (ISR/IVA) no está calculada por Atiende — vigencia post-reforma sin confirmar con fuente oficial del SAT (B-005). Revisión legal/fiscal requerida antes de presentar cualquier cifra como definitiva."
    : "Sin RFC registrado para esta unidad/propietario: la normativa mexicana puede aplicar la tasa de retención agravada a plataformas digitales sobre pagos a propietarios sin RFC. Atiende NO calcula el monto — captura el RFC y consulta a un contador/fiscalista antes de asumir cualquier cifra (B-005, revisión legal/fiscal).";
  return { rfcRegistrado, requiereRevisionFiscal: true, mensaje };
}

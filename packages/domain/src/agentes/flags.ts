import { CategoriaRiesgoFlag, type FlagDefinicion } from "../flags/index.js";

/**
 * Feature flags de automatización agéntica (Lote 9, H-079/BLUEPRINT §10).
 * Reutiliza el `RegistroFlags` tipado de Lote 10 (`packages/domain/src/
 * flags/`, no se modifica ese archivo — solo se consume su tipo público),
 * mismo patrón aditivo que cualquier otro catálogo de flags del proyecto.
 *
 * `agentes.habilitado`: apaga TODA la superficie de agentes/tools por
 * completo (ni siquiera construye la lista de tools para el modelo) —
 * default-off explícito exigido por el encargo del lote, aunque ninguna
 * tool de este catálogo module dinero/cancelación/contacto directamente
 * (todas son lectura o propuesta con aprobación humana, D-006/D-007): se
 * clasifica como `OPERATIVO` porque el riesgo que apaga es "una
 * funcionalidad nueva sin evals/trazabilidad aún verificados en este
 * tenant", no el riesgo de dinero/cancelación/contacto en sí.
 *
 * `agentes.proveedor_real_habilitado`: además de lo anterior, controla
 * específicamente si el `ProveedorLLM` real (adaptador de Claude,
 * `apps/api/src/agentes/proveedorClaude.ts`) puede usarse en vez del
 * simulado — default-off independiente, para poder probar el catálogo con
 * el proveedor simulado en un tenant con `agentes.habilitado=true` sin
 * arriesgar una llamada real por error de configuración.
 */
export const FLAG_AGENTES_HABILITADO = "agentes.habilitado";
export const FLAG_AGENTES_PROVEEDOR_REAL_HABILITADO = "agentes.proveedor_real_habilitado";

export const CATALOGO_FLAGS_AGENTES: FlagDefinicion[] = [
  {
    id: FLAG_AGENTES_HABILITADO,
    descripcion:
      "Habilita la superficie de automatización agéntica (catálogo de tools, ejecutor, cuota, trazas) " +
      "para un tenant. Apagado, el servidor ni siquiera construye la lista de tools para el modelo " +
      "(H-077 a H-085, BACKLOG E14).",
    categoriaRiesgo: CategoriaRiesgoFlag.OPERATIVO,
    defaultValor: false,
  },
  {
    id: FLAG_AGENTES_PROVEEDOR_REAL_HABILITADO,
    descripcion:
      "Permite que el ejecutor use el adaptador real de Claude en vez del proveedor simulado. Apagado " +
      "por defecto — sin esto, cualquier tenant con `agentes.habilitado=true` sigue corriendo contra " +
      "`ProveedorLLMSimulado` (dev/pruebas, sin llamadas de red).",
    categoriaRiesgo: CategoriaRiesgoFlag.OPERATIVO,
    defaultValor: false,
  },
];

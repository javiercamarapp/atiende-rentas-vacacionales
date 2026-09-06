// Portado tal cual de atiende-restaurantes (src/lib/utils.ts, D-015) — sin
// lógica de negocio, solo el helper de composición de clases de Tailwind.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import dictionary from "./codes.full.json";

const codes = dictionary as Record<string, string>;

/**
 * Translate an emergency code to human-readable text.
 * Uses hierarchical fallback: 10-3-8 → 10-3 → 10
 */
export function translateCode(clave: string): string | null {
  if (codes[clave]) return codes[clave];

  // Fallback: try parent codes
  const parts = clave.split("-");
  while (parts.length > 1) {
    parts.pop();
    const parent = parts.join("-");
    if (codes[parent]) return codes[parent];
  }

  return null;
}

/**
 * Get a short label for the top-level code category.
 */
const TOP_LABELS: Record<string, string> = {
  "10-0": "Incendio estructural",
  "10-1": "Incendio en vehículo",
  "10-2": "Incendio forestal",
  "10-3": "Rescate",
  "10-4": "Materiales peligrosos",
  "10-5": "Apoyo médico",
  "10-6": "Apoyo a comunidad",
  "10-7": "Emergencia eléctrica",
  "10-8": "Emergencia de gas",
  "10-9": "Inundación",
  "10-10": "Derrumbe",
};

export function getTopLabel(clave: string): string | null {
  const parts = clave.split("-");
  if (parts.length >= 2) {
    const top = `${parts[0]}-${parts[1]}`;
    return TOP_LABELS[top] ?? null;
  }
  return null;
}

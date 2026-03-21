const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface IncidentProperties {
  id: number;
  fecha: string;
  clave: string;
  comuna: string;
  ubicacion: string;
  carros: string;
  cuerpo: string;
}

export interface Feature {
  type: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: IncidentProperties;
}

export interface FeatureCollection {
  type: string;
  features: Feature[];
  metadata: {
    count: number;
    from: string;
    to: string;
    truncated: boolean;
  };
}

export interface Filters {
  comunas: string[];
  claves: string[];
}

export async function fetchIncidents(
  from: string,
  to: string,
  comuna?: string,
  clave?: string
): Promise<FeatureCollection> {
  const params = new URLSearchParams({ from, to });
  if (comuna) params.set("comuna", comuna);
  if (clave) params.set("clave", clave);

  const resp = await fetch(`${API_BASE}/api/incidents?${params}`);
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}

export async function fetchFilters(): Promise<Filters> {
  const resp = await fetch(`${API_BASE}/api/filters`);
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}

/**
 * Central132 Incident Collector
 * Lambda function that polls the central132.cl API and stores incidents in Supabase.
 * Triggered by EventBridge every 15 minutes.
 */

import type { ScheduledHandler } from "aws-lambda";
import { Client } from "pg";

const API_URL = "https://central132.cl/llamados/ultimos";

interface Geometry {
  type: string;
  coordinates: [number, number];
}

interface IncidentProperties {
  id: number;
  fecha: string;
  clave: string;
  comuna: string;
  ubicacion: string;
  carros: string;
  cuerpo: string;
}

interface Feature {
  type: string;
  geometry: Geometry;
  properties: IncidentProperties;
}

interface FeatureCollection {
  type: string;
  features: Feature[];
}

interface IncidentRecord {
  id: number;
  fecha: string;
  clave: string;
  comuna: string;
  ubicacion: string;
  lng: number;
  lat: number;
  cuerpo: string;
  carros: string;
  raw_feature: string;
}

const LOOKUP_SQL = "SELECT carros FROM incidents WHERE id = $1";

const UPSERT_SQL = `
INSERT INTO incidents (id, fecha, clave, comuna, ubicacion, location, cuerpo, carros, raw_feature)
VALUES ($1, $2, $3, $4, $5,
        ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
        $8, $9, $10)
ON CONFLICT (id) DO UPDATE SET
    carros       = EXCLUDED.carros,
    raw_feature  = EXCLUDED.raw_feature,
    last_seen_at = NOW()
`;

const CHANGE_SQL = `
INSERT INTO incident_changes (incident_id, field, old_value, new_value)
VALUES ($1, 'carros', $2, $3)
`;

function getClient(): Client {
  return new Client({
    host: process.env.SUPABASE_HOST,
    port: parseInt(process.env.SUPABASE_PORT || "6543"),
    database: process.env.SUPABASE_DB || "postgres",
    user: process.env.SUPABASE_USER || "postgres",
    password: process.env.SUPABASE_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

async function fetchIncidents(): Promise<Feature[]> {
  const resp = await fetch(API_URL);
  if (!resp.ok) throw new Error(`API responded ${resp.status}`);
  const data: FeatureCollection = await resp.json();
  return data.features ?? [];
}

function parseFeature(feature: Feature): IncidentRecord {
  const { properties: p, geometry: g } = feature;
  return {
    id: p.id,
    fecha: p.fecha,
    clave: p.clave ?? "",
    comuna: p.comuna ?? "",
    ubicacion: p.ubicacion ?? "",
    lng: g.coordinates[0],
    lat: g.coordinates[1],
    cuerpo: p.cuerpo ?? "",
    carros: p.carros ?? "",
    raw_feature: JSON.stringify(feature),
  };
}

export const handler: ScheduledHandler = async () => {
  const features = await fetchIncidents();
  if (features.length === 0) {
    console.log("No features returned from API");
    return;
  }

  const stats = { new: 0, updated: 0, unchanged: 0, changes_logged: 0 };
  const client = getClient();

  try {
    await client.connect();

    for (const feature of features) {
      const r = parseFeature(feature);

      // Check if incident already exists
      const { rows } = await client.query(LOOKUP_SQL, [r.id]);
      const existing = rows[0];

      if (!existing) {
        stats.new++;
      } else {
        const oldCarros: string = existing.carros;
        if (oldCarros === r.carros) {
          stats.unchanged++;
        } else {
          stats.updated++;
          await client.query(CHANGE_SQL, [r.id, oldCarros, r.carros]);
          stats.changes_logged++;
        }
      }

      // Upsert always (updates last_seen_at even if unchanged)
      await client.query(UPSERT_SQL, [
        r.id, r.fecha, r.clave, r.comuna, r.ubicacion,
        r.lng, r.lat, r.cuerpo, r.carros, r.raw_feature,
      ]);
    }
  } finally {
    await client.end();
  }

  console.log(
    `Poll complete: ${stats.new} new, ${stats.updated} updated, ${stats.unchanged} unchanged, ${stats.changes_logged} changes logged`
  );
};

// Allow running locally: npx tsx src/handler.ts
if (process.argv[1]?.endsWith("handler.ts")) {
  handler({} as any, {} as any, () => {});
}

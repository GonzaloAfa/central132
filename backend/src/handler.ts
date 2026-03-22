/**
 * Central132 Incident Collector
 * Lambda function that polls the central132.cl API and stores incidents in MongoDB.
 * Triggered by EventBridge every 15 minutes.
 */

import type { ScheduledHandler } from "aws-lambda";
import { MongoClient } from "mongodb";

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

let cachedClient: MongoClient | null = null;

async function getClient(): Promise<MongoClient> {
  if (cachedClient) return cachedClient;
  cachedClient = new MongoClient(process.env.MONGODB_URI!);
  await cachedClient.connect();
  return cachedClient;
}

async function fetchIncidents(): Promise<Feature[]> {
  const resp = await fetch(API_URL);
  if (!resp.ok) throw new Error(`API responded ${resp.status}`);
  const data: FeatureCollection = await resp.json();
  return data.features ?? [];
}

export const handler: ScheduledHandler = async () => {
  const features = await fetchIncidents();
  if (features.length === 0) {
    console.log("No features returned from API");
    return;
  }

  const stats = { new: 0, updated: 0, unchanged: 0, changes_logged: 0 };
  const client = await getClient();
  const db = client.db("central132");
  const incidents = db.collection("incidents");
  const changes = db.collection("incident_changes");

  // Ensure geospatial index exists (idempotent)
  await incidents.createIndex({ "location": "2dsphere" });
  await incidents.createIndex({ "properties.id": 1 }, { unique: true });
  await incidents.createIndex({ "properties.fecha": 1 });
  await incidents.createIndex({ "properties.clave": 1 });
  await incidents.createIndex({ "properties.comuna": 1 });
  await incidents.createIndex({ "properties.carros": 1 });

  for (const feature of features) {
    const incidentId = feature.properties.id;

    // Parse fecha string "2026-03-21 18:07:50" to Date
    const fechaDate = new Date(feature.properties.fecha.replace(" ", "T") + "-03:00");

    // Build document with GeoJSON location and proper Date types
    const doc = {
      ...feature,
      properties: { ...feature.properties, fecha: fechaDate },
      location: feature.geometry,
      first_seen_at: new Date(),
      last_seen_at: new Date(),
    };

    const existing = await incidents.findOne({ "properties.id": incidentId });

    if (!existing) {
      await incidents.insertOne(doc);
      stats.new++;
    } else {
      const oldCarros = existing.properties.carros;
      const newCarros = feature.properties.carros;

      if (oldCarros !== newCarros) {
        // Log the change before updating
        await changes.insertOne({
          incident_id: incidentId,
          field: "carros",
          old_value: oldCarros,
          new_value: newCarros,
          changed_at: new Date(),
        });
        stats.changes_logged++;
        stats.updated++;
      } else {
        stats.unchanged++;
      }

      // Always update last_seen_at and raw data
      await incidents.updateOne(
        { "properties.id": incidentId },
        {
          $set: {
            properties: { ...feature.properties, fecha: fechaDate },
            geometry: feature.geometry,
            location: feature.geometry,
            raw_feature: feature,
            last_seen_at: new Date(),
          },
          $setOnInsert: { first_seen_at: new Date() },
        }
      );
    }
  }

  console.log(
    `Poll complete: ${stats.new} new, ${stats.updated} updated, ${stats.unchanged} unchanged, ${stats.changes_logged} changes logged`
  );
};

// Allow running locally: npx tsx src/handler.ts
if (process.argv[1]?.endsWith("handler.ts")) {
  handler({} as any, {} as any, () => {});
}

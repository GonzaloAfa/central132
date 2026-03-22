/**
 * Central132 API
 * Lambda Function URL that serves incidents from MongoDB for the map frontend.
 */

import { MongoClient, type Filter, type Document } from "mongodb";

const MAX_RESULTS = 20_000;
const MAX_RANGE_DAYS = 180;

let cachedClient: MongoClient | null = null;

async function getClient(): Promise<MongoClient> {
  if (cachedClient) return cachedClient;
  cachedClient = new MongoClient(process.env.MONGODB_URI!, {
    readPreference: "secondaryPreferred",
  });
  await cachedClient.connect();
  return cachedClient;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
  };
}

function respond(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

export async function handler(event: {
  requestContext?: { http?: { method: string; path: string } };
  queryStringParameters?: Record<string, string>;
  rawPath?: string;
}) {
  const method = event.requestContext?.http?.method ?? "GET";
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  const path = event.rawPath ?? "/";
  const params = event.queryStringParameters ?? {};

  if (path === "/api/incidents" || path === "/incidents" || path === "/") {
    return handleIncidents(params);
  }

  if (path === "/api/filters" || path === "/filters") {
    return handleFilters();
  }

  return respond(404, { error: "Not found" });
}

async function handleIncidents(params: Record<string, string>) {
  const from = params.from;
  const to = params.to;

  if (!from || !to) {
    return respond(400, { error: "Missing 'from' and 'to' query parameters" });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return respond(400, { error: "Invalid date format. Use ISO 8601." });
  }

  const rangeDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  if (rangeDays > MAX_RANGE_DAYS) {
    return respond(400, { error: `Date range exceeds ${MAX_RANGE_DAYS} days.` });
  }

  const filter: Filter<Document> = {
    "properties.fecha": { $gte: fromDate, $lte: toDate },
  };

  if (params.comuna) {
    filter["properties.comuna"] = params.comuna;
  }
  if (params.clave) {
    filter["properties.clave"] = { $regex: `^${params.clave}` };
  }

  const client = await getClient();
  const db = client.db("central132");
  const collection = db.collection("incidents");

  const features = await collection
    .find(filter, {
      projection: {
        _id: 0,
        type: 1,
        geometry: 1,
        properties: 1,
      },
      maxTimeMS: 10_000,
    })
    .limit(MAX_RESULTS)
    .toArray();

  return respond(200, {
    type: "FeatureCollection",
    features,
    metadata: {
      count: features.length,
      from,
      to,
      truncated: features.length >= MAX_RESULTS,
    },
  });
}

async function handleFilters() {
  const client = await getClient();
  const db = client.db("central132");
  const collection = db.collection("incidents");

  const [comunas, claves] = await Promise.all([
    collection.distinct("properties.comuna"),
    collection.distinct("properties.clave"),
  ]);

  return respond(200, {
    comunas: comunas.sort(),
    claves: claves.sort(),
  });
}

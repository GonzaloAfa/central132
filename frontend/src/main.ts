import maplibregl from "maplibre-gl";
import { fetchIncidents, fetchFilters, type FeatureCollection } from "./api";
import { translateCode, getTopLabel } from "./codes";

// Santiago center
const INITIAL_CENTER: [number, number] = [-70.65, -33.45];
const INITIAL_ZOOM = 11;

// DOM elements
const fromInput = document.getElementById("from") as HTMLInputElement;
const toInput = document.getElementById("to") as HTMLInputElement;
const comunaSelect = document.getElementById("comuna") as HTMLSelectElement;
const claveSelect = document.getElementById("clave") as HTMLSelectElement;
const searchBtn = document.getElementById("search") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

// Set default dates: last 7 days
const today = new Date();
const weekAgo = new Date(today);
weekAgo.setDate(weekAgo.getDate() - 7);
fromInput.value = weekAgo.toISOString().split("T")[0];
toInput.value = today.toISOString().split("T")[0];

// Initialize map
const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

// Load filters
fetchFilters()
  .then((filters) => {
    filters.comunas.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      comunaSelect.appendChild(opt);
    });

    // Group claves by top-level
    const topLevels = new Set<string>();
    filters.claves.forEach((c) => {
      const parts = c.split("-");
      if (parts.length >= 2) topLevels.add(`${parts[0]}-${parts[1]}`);
    });
    Array.from(topLevels)
      .sort()
      .forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c;
        const label = getTopLabel(c);
        opt.textContent = label ? `${c} - ${label}` : c;
        claveSelect.appendChild(opt);
      });
  })
  .catch(() => {
    statusEl.textContent = "Error cargando filtros";
  });

// Map source setup on load
map.on("load", () => {
  map.addSource("incidents", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
  });

  // Cluster circles
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "incidents",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#e94560",
        10,
        "#d63447",
        50,
        "#b52b3a",
        200,
        "#8a1f2c",
      ],
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 32, 200, 40],
      "circle-opacity": 0.85,
    },
  });

  // Cluster count labels
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "incidents",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["Open Sans Bold"],
      "text-size": 13,
    },
    paint: { "text-color": "#ffffff" },
  });

  // Individual incident points
  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "incidents",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#e94560",
      "circle-radius": 7,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });

  // Click on cluster: zoom in
  map.on("click", "clusters", async (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    const clusterId = features[0]?.properties?.cluster_id;
    if (clusterId == null) return;
    const source = map.getSource("incidents") as maplibregl.GeoJSONSource;
    const zoom = await source.getClusterExpansionZoom(clusterId);
    map.easeTo({ center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number], zoom });
  });

  // Click on point: show popup
  map.on("click", "unclustered-point", (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const props = feature.properties as Record<string, string>;
    const coords = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];

    const clave = props.clave ?? "";
    const translation = translateCode(clave);
    const topLabel = getTopLabel(clave);

    let html = `<div class="popup-title">Clave ${clave}</div>`;
    if (translation || topLabel) {
      html += `<div class="popup-translation">${topLabel ? `<strong>${topLabel}</strong><br>` : ""}${translation ?? ""}</div>`;
    }
    html += `
      <div class="popup-detail"><span class="popup-label">Fecha:</span> ${props.fecha ?? ""}</div>
      <div class="popup-detail"><span class="popup-label">Comuna:</span> ${props.comuna ?? ""}</div>
      <div class="popup-detail"><span class="popup-label">Ubicación:</span> ${props.ubicacion ?? ""}</div>
      <div class="popup-detail"><span class="popup-label">Carros:</span> ${props.carros ?? ""}</div>
      <div class="popup-detail"><span class="popup-label">Cuerpo:</span> ${props.cuerpo ?? ""}</div>
    `;

    new maplibregl.Popup({ maxWidth: "320px" }).setLngLat(coords).setHTML(html).addTo(map);
  });

  // Cursor styles
  map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
  map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));

  // Auto-load data
  loadData();
});

// Search handler
searchBtn.addEventListener("click", loadData);

async function loadData() {
  const from = fromInput.value;
  const to = toInput.value;
  if (!from || !to) {
    statusEl.textContent = "Selecciona un rango de fechas";
    return;
  }

  searchBtn.disabled = true;
  statusEl.textContent = "Cargando...";

  try {
    const fromISO = `${from}T00:00:00`;
    const toISO = `${to}T23:59:59`;
    const comuna = comunaSelect.value || undefined;
    const clave = claveSelect.value || undefined;

    const data: FeatureCollection = await fetchIncidents(fromISO, toISO, comuna, clave);

    const source = map.getSource("incidents") as maplibregl.GeoJSONSource;
    source.setData(data as any);

    let msg = `${data.metadata.count} incidentes`;
    if (data.metadata.truncated) msg += " (resultados limitados, reduce el rango)";
    statusEl.textContent = msg;
  } catch (err) {
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : "desconocido"}`;
  } finally {
    searchBtn.disabled = false;
  }
}

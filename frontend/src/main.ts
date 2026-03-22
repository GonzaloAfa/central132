import maplibregl from "maplibre-gl";
import { fetchIncidents, fetchFilters, type FeatureCollection } from "./api";
import { translateCode, getTopLabel } from "./codes";

// Santiago center
const INITIAL_CENTER: [number, number] = [-70.65, -33.45];
const INITIAL_ZOOM = 11;

// DOM elements
const rangeSelect = document.getElementById("range") as HTMLSelectElement;
const customDates = document.getElementById("custom-dates") as HTMLDivElement;
const fromInput = document.getElementById("from") as HTMLInputElement;
const toInput = document.getElementById("to") as HTMLInputElement;
const comunaSelect = document.getElementById("comuna") as HTMLSelectElement;
const claveSelect = document.getElementById("clave") as HTMLSelectElement;
const searchBtn = document.getElementById("search") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

// Range presets
function getDateRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const value = rangeSelect.value;

  if (value === "custom") {
    return {
      from: `${fromInput.value}T00:00:00`,
      to: `${toInput.value}T23:59:59`,
    };
  }

  const ms: Record<string, number> = {
    "4h": 4 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };

  const from = new Date(now.getTime() - (ms[value] ?? ms["4h"]));
  return { from: from.toISOString(), to };
}

// Show/hide custom date inputs
rangeSelect.addEventListener("change", () => {
  customDates.style.display = rangeSelect.value === "custom" ? "flex" : "none";
  loadData();
});

// Set default custom date values
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
        10, "#d63447",
        50, "#b52b3a",
        200, "#8a1f2c",
      ],
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 32, 200, 40],
      "circle-opacity": 0.85,
    },
  });

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

  map.on("click", "clusters", async (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    const clusterId = features[0]?.properties?.cluster_id;
    if (clusterId == null) return;
    const source = map.getSource("incidents") as maplibregl.GeoJSONSource;
    const zoom = await source.getClusterExpansionZoom(clusterId);
    map.easeTo({ center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number], zoom });
  });

  map.on("click", "unclustered-point", (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const props = feature.properties as Record<string, string>;
    const coords = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];

    const clave = props.clave ?? "";
    const translation = translateCode(clave);
    const topLabel = getTopLabel(clave);

    // Format fecha for display
    const fechaRaw = props.fecha ?? "";
    const fechaDisplay = fechaRaw.includes("T")
      ? new Date(fechaRaw).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })
      : fechaRaw;

    let html = `<div class="popup-title">Clave ${clave}</div>`;
    if (translation || topLabel) {
      html += `<div class="popup-translation">${topLabel ? `<strong>${topLabel}</strong><br>` : ""}${translation ?? ""}</div>`;
    }
    html += `
      <div class="popup-detail"><span class="popup-label">Fecha:</span> ${fechaDisplay}</div>
      <div class="popup-detail"><span class="popup-label">Comuna:</span> ${props.comuna ?? ""}</div>
      <div class="popup-detail"><span class="popup-label">Ubicacion:</span> ${props.ubicacion ?? ""}</div>
      <div class="popup-detail"><span class="popup-label">Carros:</span> ${props.carros ?? ""}</div>
      <div class="popup-detail"><span class="popup-label">Cuerpo:</span> ${props.cuerpo ?? ""}</div>
    `;

    new maplibregl.Popup({ maxWidth: "320px" }).setLngLat(coords).setHTML(html).addTo(map);
  });

  map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
  map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));

  loadData();
});

searchBtn.addEventListener("click", loadData);

async function loadData() {
  const range = getDateRange();
  if (!range.from || !range.to) {
    statusEl.textContent = "Selecciona un rango de fechas";
    return;
  }

  searchBtn.disabled = true;
  statusEl.textContent = "Cargando...";

  try {
    const comuna = comunaSelect.value || undefined;
    const clave = claveSelect.value || undefined;

    const data: FeatureCollection = await fetchIncidents(range.from, range.to, comuna, clave);

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

const DICTIONARY_PATH = "src/data/codes.full.json";
const COMPANIES_PATH = "src/data/companies.json";
const UNIT_TYPES_PATH = "src/data/unit-types.json";
const TRANSLATION_CLASS = "c132-code-translation";
const UNITS_CLASS = "c132-units-info";
const SUMMARY_CLASS = "c132-popover-summary";
const UNIT_PATTERN = /\b([A-Z]{1,3})(?:\s*-\s*)?(\d{1,3})\b/gi;
const TOP_LEVEL_LABELS = {
  "10-0": "Incendio estructural",
  "10-1": "Incendio en vehículo o transporte",
  "10-2": "Incendio en área abierta",
  "10-3": "Rescate de personas",
  "10-4": "Rescate vehicular",
  "10-5": "Materiales peligrosos",
  "10-6": "Emergencia por gas",
  "10-7": "Emergencia eléctrica",
  "10-8": "Otros servicios de emergencia",
  "10-9": "Inspección y revisión",
  "10-10": "Rebrote de fuego",
  "10-11": "Apoyo a otros cuerpos",
  "4-0": "Ubicación geográfica",
  "4-1": "Ubicación geográfica",
  "4-2": "Ubicación geográfica",
  "4-3": "Ubicación geográfica",
  "4-4": "Ubicación geográfica"
};
const HUMAN_DETAIL_OVERRIDES = {
  "10-0": "Incendio en una estructura (casa, edificio o similar).",
  "10-0-1": "Incendio en etapa inicial en una estructura.",
  "10-0-2": "Incendio en edificio en altura.",
  "10-1": "Incendio en vehículo o medio de transporte.",
  "10-1-1": "Incendio de auto, camioneta o motocicleta.",
  "10-2": "Incendio en área abierta (pastizal, basura u otro espacio no confinado).",
  "10-2-1": "Incendio de pastizal en zona urbana.",
  "10-3": "Rescate de personas en situación de atrapamiento o riesgo.",
  "10-3-1": "Persona atrapada en ascensor o escalera mecánica.",
  "10-3-7": "Rescate de persona en agua en movimiento (río, canal o estero).",
  "10-3-8": "Rescate de persona en agua quieta (laguna, piscina o similar).",
  "10-4": "Rescate de personas involucradas en accidente vehicular.",
  "10-4-1": "Choque de auto con posible persona atrapada.",
  "10-4-12": "Colisión entre autos con posible rescate.",
  "10-5": "Emergencia con materiales peligrosos.",
  "10-6": "Fuga o emanación de gas.",
  "10-6-1": "Fuga de gas licuado desde cilindro portátil.",
  "10-6-10": "Presencia de monóxido de carbono en domicilio.",
  "10-7": "Emergencia eléctrica en vía pública o instalación.",
  "10-7-1": "Riesgo en tendido eléctrico aéreo de alta tensión.",
  "10-8": "Servicio especial de apoyo de Bomberos.",
  "10-8-21": "Caída de árbol.",
  "10-8-23": "Extracción de agua por inundación.",
  "10-8-24": "Rescate de animal.",
  "10-9": "Inspección o revisión de seguridad realizada por Bomberos.",
  "10-10": "Rebrote de fuego después de una emergencia previa.",
  "10-11": "Apoyo operativo a otro Cuerpo de Bomberos.",
  "4-0": "Solicitud de ubicación geográfica.",
  "7-8": "Orden de evacuar la estructura de inmediato.",
  "7-9": "Orden de evacuar a los residentes del inmueble.",
  "7-10": "Bomberos no puede trabajar en el lugar.",
  "10-17": "Emergencia en estación de Metro de Santiago.",
  "12-9": "Citación a la Compañía que se indica.",
  "12-10": "Se solicita conductor para una unidad."
};

let dictionaryPromise = loadJsonData(DICTIONARY_PATH, "dictionary");
let companiesPromise = loadJsonData(COMPANIES_PATH, "companies");
let unitTypesPromise = loadJsonData(UNIT_TYPES_PATH, "unit types");

async function loadJsonData(relativePath, label) {
  try {
    const response = await fetch(chrome.runtime.getURL(relativePath));
    if (!response.ok) {
      throw new Error(`Failed to load ${label}: ${response.status}`);
    }

    const data = await response.json();
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    console.error(`[Central132] Could not load ${label}`, error);
    return {};
  }
}

function extractCodeFromTitle(title) {
  if (typeof title !== "string") {
    return null;
  }

  const match = title.trim().match(/^(\d+(?:-\d+)+)\b/);
  return match ? match[1] : null;
}

function buildFallbackChain(code) {
  const parts = code.split("-");
  const chain = [];

  while (parts.length > 0) {
    chain.push(parts.join("-"));
    parts.pop();
  }

  return chain;
}

function resolveHumanDetail(originalCode, matchedCode, dict) {
  for (const candidate of buildFallbackChain(originalCode)) {
    const override = HUMAN_DETAIL_OVERRIDES[candidate];
    if (override) {
      return {
        text: override,
        sourceCode: candidate
      };
    }
  }

  const matchedOverride = HUMAN_DETAIL_OVERRIDES[matchedCode];
  if (matchedOverride) {
    return {
      text: matchedOverride,
      sourceCode: matchedCode
    };
  }

  const dictionaryText = dict[matchedCode];
  if (dictionaryText) {
    return {
      text: dictionaryText,
      sourceCode: matchedCode
    };
  }

  return null;
}

function resolveText(code, dict) {
  for (const candidate of buildFallbackChain(code)) {
    const text = dict[candidate];
    if (typeof text === "string" && text.trim()) {
      return {
        matchedCode: candidate,
        text: text.trim()
      };
    }
  }

  return null;
}

function capitalizeFirst(value) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toLocaleUpperCase("es-CL") + value.slice(1);
}

function toCleanPhrase(value) {
  let output = (value || "").trim().replace(/\.$/, "");
  output = output.replace(/^Desde\s+/i, "");
  output = output.replace(/^Desde el\s+/i, "");
  output = output.replace(/^De(l)?\s+/i, "");
  output = output.replace(/^En\s+/i, "");
  output = output.replace(/^Por\s+/i, "");
  output = output.replace(/\s*,\s*/g, ", ");

  const parts = output.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2 && !output.includes("(")) {
    output = `${parts[0]} y ${parts[1]}`;
  }

  return capitalizeFirst(output);
}

function getTopLevelCode(code) {
  const parts = code.split("-");
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return code;
}

function buildQuickSummary(originalCode, result, dict) {
  if (!result) {
    return {
      title: "Código no catalogado",
      detail: null,
      meta: null
    };
  }

  const topCode = getTopLevelCode(originalCode);
  const topLabel = TOP_LEVEL_LABELS[topCode] || dict[topCode] || result.text;
  const title = toCleanPhrase(topLabel);
  let detail = null;

  const humanDetail = resolveHumanDetail(originalCode, result.matchedCode, dict);
  const detailCandidate = toCleanPhrase(humanDetail ? humanDetail.text : result.text);
  if (
    detailCandidate &&
    detailCandidate.toLocaleLowerCase("es-CL") !== title.toLocaleLowerCase("es-CL")
  ) {
    detail = detailCandidate;
  }

  if (detail && detail.length > 92) {
    detail = `${detail.slice(0, 89).trimEnd()}...`;
  }

  let meta = null;
  if (result.matchedCode !== originalCode) {
    meta = `Basado en ${result.matchedCode}`;
  } else if (humanDetail && humanDetail.sourceCode !== originalCode) {
    meta = `Interpretación basada en ${humanDetail.sourceCode}`;
  }

  return { title, detail, meta };
}

function injectTranslation(popoverEl, summary) {
  const contentEl = popoverEl.querySelector(".popover-content");
  if (!contentEl) {
    return;
  }

  const existing = contentEl.querySelector(`.${TRANSLATION_CLASS}`);
  if (existing) {
    existing.remove();
  }

  const block = document.createElement("div");
  block.className = TRANSLATION_CLASS;

  const kicker = document.createElement("div");
  kicker.className = `${TRANSLATION_CLASS}-kicker`;
  kicker.textContent = "En palabras simples";

  const title = document.createElement("div");
  title.className = `${TRANSLATION_CLASS}-title`;
  title.textContent = summary.title;

  block.appendChild(kicker);
  block.appendChild(title);

  if (summary.detail) {
    const detail = document.createElement("div");
    detail.className = `${TRANSLATION_CLASS}-detail`;
    detail.textContent = summary.detail;
    block.appendChild(detail);
  }

  if (summary.meta) {
    const meta = document.createElement("div");
    meta.className = `${TRANSLATION_CLASS}-meta`;
    meta.textContent = summary.meta;
    block.appendChild(meta);
  }

  contentEl.appendChild(block);
  popoverEl.dataset.codeTranslated = "1";
}

function normalizeUnitPrefix(prefix, unitTypes) {
  const normalized = (prefix || "").toUpperCase();
  if (!normalized) {
    return null;
  }

  if (unitTypes[normalized]) {
    return normalized;
  }

  const fallback = Object.keys(unitTypes)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => normalized.startsWith(candidate));

  return fallback || null;
}

function extractUnits(text, unitTypes) {
  if (typeof text !== "string") {
    return [];
  }

  const seen = new Set();
  const units = [];

  for (const match of text.matchAll(UNIT_PATTERN)) {
    const rawPrefix = (match[1] || "").toUpperCase();
    const number = match[2];
    const prefix = normalizeUnitPrefix(rawPrefix, unitTypes);
    if (!prefix) {
      continue;
    }

    const raw = match[0].toUpperCase().replace(/\s+/g, "");
    const key = `${prefix}-${number}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    units.push({ prefix, number, raw });
  }

  return units;
}

function resolveUnits(units, companies, unitTypes) {
  return units.map((unit) => {
    const typeName = unitTypes[unit.prefix] || unit.prefix;
    const matches = [];

    for (const [cuerpoId, cuerpo] of Object.entries(companies)) {
      const company = cuerpo.companies && cuerpo.companies[unit.number];
      if (company) {
        matches.push({
          cuerpo: cuerpoId,
          cuerpoName: cuerpo.name,
          company
        });
      }
    }

    return { ...unit, typeName, matches };
  });
}

function formatOrdinal(number) {
  return `${number}ª Cía.`;
}

function buildUnitSummaryText(unit) {
  let text = unit.typeName;
  if (unit.matches.length === 1) {
    const m = unit.matches[0];
    text += ` · ${formatOrdinal(unit.number)} "${m.company.name}" (${m.cuerpo})`;
    if (m.company.communes && m.company.communes.length > 0) {
      text += ` · ${m.company.communes.join(", ")}`;
    }
    if (m.company.specialty) {
      text += ` · ${m.company.specialty}`;
    }
  }
  return text;
}

function extractBaseContentLines(contentEl) {
  if (!(contentEl instanceof HTMLElement)) {
    return [];
  }

  const lines = [];
  let currentLine = "";

  for (const node of contentEl.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      currentLine += node.textContent || "";
      continue;
    }

    if (!(node instanceof HTMLElement)) {
      continue;
    }

    if (node.tagName === "BR") {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = "";
      continue;
    }

    if (
      node.classList.contains(SUMMARY_CLASS) ||
      node.classList.contains(TRANSLATION_CLASS) ||
      node.classList.contains(UNITS_CLASS)
    ) {
      continue;
    }

    currentLine += node.textContent || "";
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines;
}

function getBaseContentLines(contentEl) {
  if (!(contentEl instanceof HTMLElement)) {
    return [];
  }

  const cached = contentEl.dataset.c132BaseLines;
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn("[Central132] Could not parse cached popup lines", error);
    }
  }

  const lines = extractBaseContentLines(contentEl);
  contentEl.dataset.c132BaseLines = JSON.stringify(lines);
  return lines;
}

function getSummaryIcon(kind) {
  if (kind === "time") {
    return [
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path d="M8 3h8v2h-1v3.3l-1.7 1.7L15 11.7V19h1v2H8v-2h1v-7.3l1.7-1.7L9 8.3V5H8V3Zm3 2v4.1l-2 2V19h6v-7.9l-2-2V5h-2Z" fill="currentColor"/>',
      "</svg>"
    ].join("");
  }

  return [
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
    '<path d="M12 2a7 7 0 0 1 7 7c0 4.9-5.1 10.8-6.1 11.9a1.2 1.2 0 0 1-1.8 0C10.1 19.8 5 13.9 5 9a7 7 0 0 1 7-7Zm0 9.5A2.5 2.5 0 1 0 12 6a2.5 2.5 0 0 0 0 5.5Z" fill="currentColor"/>',
    "</svg>"
  ].join("");
}

function buildSummaryRow(kind, text) {
  if (!text) {
    return null;
  }

  const row = document.createElement("div");
  row.className = `${SUMMARY_CLASS}-row ${SUMMARY_CLASS}-row--${kind}`;

  const icon = document.createElement("span");
  icon.className = `${SUMMARY_CLASS}-icon ${SUMMARY_CLASS}-icon--${kind}`;
  icon.innerHTML = getSummaryIcon(kind);

  const copy = document.createElement("div");
  copy.className = `${SUMMARY_CLASS}-text`;
  copy.textContent = text;

  row.appendChild(icon);
  row.appendChild(copy);

  return row;
}

function buildSummaryBlock(lines, unitsLine) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return null;
  }

  const timeLine = lines[0] || "";
  const locationLine = lines.slice(1).filter((line) => line !== unitsLine).join(" · ");

  const block = document.createElement("div");
  block.className = SUMMARY_CLASS;
  guardPopoverInteractions(block);

  const timeRow = buildSummaryRow("time", timeLine);
  if (timeRow) {
    block.appendChild(timeRow);
  }

  const locationRow = buildSummaryRow("location", locationLine);
  if (locationRow) {
    block.appendChild(locationRow);
  }

  return block.childNodes.length > 0 ? block : null;
}

function decorateBaseContent(contentEl, lines, unitsLine) {
  if (!(contentEl instanceof HTMLElement)) {
    return;
  }

  for (const node of Array.from(contentEl.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.remove();
      continue;
    }

    if (!(node instanceof HTMLElement)) {
      continue;
    }

    if (
      node.classList.contains(TRANSLATION_CLASS) ||
      node.classList.contains(UNITS_CLASS)
    ) {
      continue;
    }

    node.remove();
  }

  const summary = buildSummaryBlock(lines, unitsLine);
  if (summary) {
    contentEl.prepend(summary);
  }
}

function findUnitsLine(lines, unitTypes) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (extractUnits(lines[index], unitTypes).length > 0) {
      return lines[index];
    }
  }

  return "";
}

function guardPopoverInteractions(element) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  const stop = (event) => {
    event.stopPropagation();
  };

  [
    "click",
    "dblclick",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend"
  ].forEach((eventName) => {
    element.addEventListener(eventName, stop);
  });
}

function bindSafeToggle(toggle, details) {
  if (!(toggle instanceof HTMLElement) || !(details instanceof HTMLElement)) {
    return;
  }

  const consume = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  };

  [
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend"
  ].forEach((eventName) => {
    toggle.addEventListener(eventName, consume, true);
  });

  toggle.addEventListener("click", (event) => {
    consume(event);
    const expanded = details.classList.toggle(`${UNITS_CLASS}-details--open`);
    toggle.textContent = expanded ? "Ocultar ▾" : "Ver detalle ▸";
  }, true);
}

function buildUnitsBlock(popoverEl, resolved) {
  const contentEl = popoverEl.querySelector(".popover-content");
  if (!contentEl) {
    return;
  }

  const existing = contentEl.querySelector(`.${UNITS_CLASS}`);
  if (existing) {
    existing.remove();
  }

  const block = document.createElement("div");
  block.className = UNITS_CLASS;
  guardPopoverInteractions(block);

  const header = document.createElement("div");
  header.className = `${UNITS_CLASS}-header`;

  const codes = resolved.map((u) => u.raw).join(", ");
  const label = document.createElement("span");
  label.className = `${UNITS_CLASS}-label`;
  label.textContent = `Unidades: ${codes}`;

  const toggle = document.createElement("button");
  toggle.className = `${UNITS_CLASS}-toggle`;
  toggle.textContent = "Ver detalle ▸";
  toggle.type = "button";

  header.appendChild(label);
  header.appendChild(toggle);
  block.appendChild(header);

  const details = document.createElement("div");
  details.className = `${UNITS_CLASS}-details`;

  for (const unit of resolved) {
    const item = document.createElement("div");
    item.className = `${UNITS_CLASS}-item`;

    const unitLabel = document.createElement("strong");
    unitLabel.textContent = unit.raw;
    item.appendChild(unitLabel);
    item.appendChild(document.createTextNode(` — ${buildUnitSummaryText(unit)}`));
    details.appendChild(item);
  }

  block.appendChild(details);
  bindSafeToggle(toggle, details);

  contentEl.appendChild(block);
}

async function decoratePopover(popoverEl) {
  const titleEl = popoverEl.querySelector(".popover-title");
  if (!titleEl) {
    return;
  }

  const titleText = titleEl.textContent || "";
  const code = extractCodeFromTitle(titleText);
  const contentEl = popoverEl.querySelector(".popover-content");
  const contentLines = getBaseContentLines(contentEl);
  let unitsLine = "";

  if (code) {
    const dict = await dictionaryPromise;
    const result = resolveText(code, dict);
    const summary = buildQuickSummary(code, result, dict);
    injectTranslation(popoverEl, summary);
  }

  if (contentLines.length > 0) {
    const unitTypes = await unitTypesPromise;
    unitsLine = findUnitsLine(contentLines, unitTypes);
    decorateBaseContent(contentEl, contentLines, unitsLine);
  }

  if (contentLines.length > 0) {
    const [companies, unitTypes] = await Promise.all([
      companiesPromise,
      unitTypesPromise
    ]);
    const units = extractUnits(unitsLine, unitTypes);

    if (units.length > 0) {
      const resolved = resolveUnits(units, companies, unitTypes);
      buildUnitsBlock(popoverEl, resolved);
    }
  }
}

const queued = new WeakSet();

function queueDecoration(popoverEl) {
  if (!(popoverEl instanceof HTMLElement) || queued.has(popoverEl)) {
    return;
  }

  queued.add(popoverEl);
  requestAnimationFrame(() => {
    decoratePopover(popoverEl).finally(() => queued.delete(popoverEl));
  });
}

function inspectNode(node) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  if (node.classList.contains("popover")) {
    queueDecoration(node);
  }

  node.querySelectorAll(".popover").forEach(queueDecoration);
}

function startObserver() {
  document.querySelectorAll(".popover").forEach(queueDecoration);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        inspectNode(node);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

if (document.body) {
  startObserver();
} else {
  window.addEventListener("DOMContentLoaded", startObserver, { once: true });
}

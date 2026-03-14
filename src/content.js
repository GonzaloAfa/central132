const DICTIONARY_PATH = "src/data/codes.full.json";
const TRANSLATION_CLASS = "c132-code-translation";
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

let dictionaryPromise = loadDictionary();

async function loadDictionary() {
  try {
    const response = await fetch(chrome.runtime.getURL(DICTIONARY_PATH));
    if (!response.ok) {
      throw new Error(`Failed to load dictionary: ${response.status}`);
    }

    const data = await response.json();
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    console.error("[Central132] Could not load dictionary", error);
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
      meta: `Código ${originalCode}`
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

  let meta = `Código ${originalCode}`;
  if (result.matchedCode !== originalCode) {
    meta = `${meta} · basado en ${result.matchedCode}`;
  } else if (humanDetail && humanDetail.sourceCode !== originalCode) {
    meta = `${meta} · interpretación basada en ${humanDetail.sourceCode}`;
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

  const meta = document.createElement("div");
  meta.className = `${TRANSLATION_CLASS}-meta`;
  meta.textContent = summary.meta;
  block.appendChild(meta);

  contentEl.appendChild(block);
  popoverEl.dataset.codeTranslated = "1";
}

async function decoratePopover(popoverEl) {
  const titleEl = popoverEl.querySelector(".popover-title");
  if (!titleEl) {
    return;
  }

  const code = extractCodeFromTitle(titleEl.textContent || "");
  if (!code) {
    return;
  }

  const dict = await dictionaryPromise;
  const result = resolveText(code, dict);
  const summary = buildQuickSummary(code, result, dict);
  injectTranslation(popoverEl, summary);
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

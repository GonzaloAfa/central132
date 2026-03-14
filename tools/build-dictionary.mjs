#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://noticias.masternet.cl/claves-radiales-articulo-noticias-1440702877.html";
const OUTPUT_RELATIVE_PATH = "src/data/codes.full.json";

const ENTITY_MAP = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  deg: "°",
  ordm: "º",
  ordf: "ª",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  Uuml: "Ü",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"'
};

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(ENTITY_MAP, name)
        ? ENTITY_MAP[name]
        : match
    );
}

function normalizeWhitespace(value) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r ]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function toSentenceCase(value) {
  if (!value) {
    return value;
  }

  const lowered = value.toLocaleLowerCase("es-CL");
  return lowered.charAt(0).toLocaleUpperCase("es-CL") + lowered.slice(1);
}

function restoreAcronyms(value) {
  return value
    .replace(/\bglp\b/gi, "GLP")
    .replace(/\bff\.?\s*aa\.?\b/gi, "FF.AA.")
    .replace(/\bong\b/gi, "ONG")
    .replace(/\bconaf\b/gi, "CONAF")
    .replace(/\bhazmat\b/gi, "HAZMAT")
    .replace(/\bbleve\b/gi, "BLEVE")
    .replace(/\bapi\b/gi, "API")
    .replace(/\bkm\b/gi, "km")
    .replace(/\bmts\.?\b/gi, "mts.");
}

function applyOrthographyFixes(value) {
  return value
    .replace(/\bdirijase\b/gi, "Diríjase")
    .replace(/\bdomicliaria\b/gi, "domiciliaria")
    .replace(/\bcuidad\b/gi, "ciudad")
    .replace(/\breacreación\b/gi, "recreación")
    .replace(/\bpreventive\b/gi, "preventiva")
    .replace(/\binspección y revisión a diversas instalaciones echas por bomberos\b/gi, "inspección y revisión a diversas instalaciones hechas por Bomberos")
    .replace(/\breborte\b/gi, "rebrote")
    .replace(/\bcolision\b/gi, "colisión")
    .replace(/\bvehiculo\b/gi, "vehículo")
    .replace(/\bportatiles\b/gi, "portátiles")
    .replace(/\bpárques\b/gi, "parques")
    .replace(/\boperativa a atentados\b/gi, "operativa ante atentados")
    .replace(/\bescalas mecánicas\b/gi, "escaleras mecánicas")
    .replace(/\bsilencio:\s*"/gi, 'silencio: "');
}

function formatDescription(value) {
  const letters = (value.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
  const upperLetters = (value.match(/[A-ZÁÉÍÓÚÜÑ]/g) || []).length;
  const mostlyUpper = letters > 0 && upperLetters / letters > 0.72;

  let output = mostlyUpper ? toSentenceCase(value) : value;
  output = applyOrthographyFixes(output);
  output = restoreAcronyms(output);
  output = normalizeWhitespace(output);

  if (/^[a-záéíóúüñ]/.test(output)) {
    output = output.charAt(0).toLocaleUpperCase("es-CL") + output.slice(1);
  }

  return output;
}

function cleanText(value) {
  const withoutTags = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return normalizeWhitespace(decodeHtmlEntities(withoutTags));
}

function normalizeDescription(value) {
  return formatDescription(
    cleanText(value)
    .replace(/\s*\.{3,}\s*$/g, "")
    .replace(/"\s+/g, '"')
    .replace(/\s+"/g, '"')
    .replace(/^[-:;,\s]+|[-:;,\s]+$/g, "")
  );
}

function addEntry(map, code, description) {
  if (!/^\d+(?:-\d+)+$/.test(code)) {
    return;
  }

  const normalizedCode = code.trim();
  const normalizedDescription = normalizeDescription(description);
  if (!normalizedDescription) {
    return;
  }

  const existing = map.get(normalizedCode);
  if (existing && existing.length >= normalizedDescription.length) {
    return;
  }

  map.set(normalizedCode, normalizedDescription);
}

function extractRelevantSegment(html) {
  const start = html.indexOf("CLAVES RADIALES");
  if (start === -1) {
    return html;
  }

  const endToken = '<div class="ct_descargas"';
  const end = html.indexOf(endToken, start);
  if (end === -1) {
    return html.slice(start);
  }

  return html.slice(start, end);
}

function parseInlineCodes(segment, map) {
  const tableStart = segment.indexOf('<table border="1"');
  const inlineSegment =
    tableStart === -1 ? segment : segment.slice(0, tableStart);

  const text = decodeHtmlEntities(inlineSegment)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const lines = text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  for (const line of lines) {
    const expanded = line.replace(/\.\s+(\d+(?:-\d+)+\s+)/g, ".\n$1");
    const candidates = expanded.split("\n").map((part) => part.trim());

    for (const candidate of candidates) {
      const match = candidate.match(/^(\d+(?:-\d+)+)\s+(.+)$/);
      if (match) {
        addEntry(map, match[1], match[2]);
      }
    }
  }
}

function parseTableCodes(segment, map) {
  const rowPattern =
    /<tr[^>]*>\s*<td[^>]*>[\s\S]*?<strong>\s*(\d+(?:-\d+)+)(?:\s|&nbsp;|&#160;)*(?:<br\s*\/?>\s*)*<\/strong>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;

  let rowMatch;
  while ((rowMatch = rowPattern.exec(segment)) !== null) {
    addEntry(map, rowMatch[1], rowMatch[2]);
  }
}

function compareCodes(a, b) {
  const aParts = a.split("-").map(Number);
  const bParts = b.split("-").map(Number);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLength; i += 1) {
    const aValue = Number.isFinite(aParts[i]) ? aParts[i] : -1;
    const bValue = Number.isFinite(bParts[i]) ? bParts[i] : -1;
    if (aValue !== bValue) {
      return aValue - bValue;
    }
  }

  return 0;
}

async function loadJsonFile(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function buildDictionary() {
  const dictionary = new Map();

  let html = "";
  try {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    html = await response.text();
  } catch (err) {
    console.warn(
      `Warning: could not fetch source (${err.message}). Using local data only.`
    );
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");

  if (html) {
    const segment = extractRelevantSegment(html);

    const inlineDictionary = new Map();
    const tableDictionary = new Map();

    parseInlineCodes(segment, inlineDictionary);
    parseTableCodes(segment, tableDictionary);

    for (const [code, description] of inlineDictionary) {
      dictionary.set(code, description);
    }
    for (const [code, description] of tableDictionary) {
      dictionary.set(code, description);
    }
  } else {
    const existing = await loadJsonFile(
      path.resolve(rootDir, OUTPUT_RELATIVE_PATH)
    );
    for (const [code, description] of Object.entries(existing)) {
      dictionary.set(code, description);
    }
  }

  const supplement = await loadJsonFile(
    path.resolve(rootDir, "src/data/codes.supplement.json")
  );
  for (const [code, description] of Object.entries(supplement)) {
    if (!dictionary.has(code)) {
      dictionary.set(code, description);
    }
  }

  const overrides = await loadJsonFile(
    path.resolve(rootDir, "src/data/codes.overrides.json")
  );
  for (const [code, description] of Object.entries(overrides)) {
    dictionary.set(code, description);
  }

  const sortedEntries = [...dictionary.entries()].sort((a, b) =>
    compareCodes(a[0], b[0])
  );

  const outputObject = Object.fromEntries(sortedEntries);
  const outputPath = path.resolve(rootDir, OUTPUT_RELATIVE_PATH);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(outputObject, null, 2)}\n`, "utf8");

  console.log(`Dictionary created with ${sortedEntries.length} entries.`);
  console.log(`Output: ${outputPath}`);
}

buildDictionary().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

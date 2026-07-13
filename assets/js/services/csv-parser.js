/**
 * Parser CSV pequeno e sem dependências externas.
 * Suporta vírgula, ponto e vírgula ou tabulação e respeita campos entre aspas.
 */
export function parseCsv(text) {
  const cleaned = String(text ?? "").replace(/^\uFEFF/, "").trimEnd();
  if (!cleaned.trim()) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(cleaned.split(/\r?\n/, 1)[0]);
  const matrix = parseMatrix(cleaned, delimiter);
  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = matrix[0].map(normalizeHeader);
  const rows = matrix
    .slice(1)
    .filter(row => row.some(value => String(value).trim() !== ""))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, normalizeValue(row[index] ?? "")])));

  return { headers, rows };
}

export function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function detectDelimiter(headerLine) {
  const candidates = [",", ";", "\t"];
  return candidates
    .map(delimiter => ({ delimiter, count: countOutsideQuotes(headerLine, delimiter) }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function countOutsideQuotes(text, delimiter) {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '"') quoted = !quoted;
    else if (!quoted && text[i] === delimiter) count += 1;
  }
  return count;
}

function parseMatrix(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  return rows;
}

function normalizeValue(value) {
  const trimmed = String(value).trim();
  const lowered = trimmed.toLowerCase();
  if (["true", "sim", "yes"].includes(lowered)) return true;
  if (["false", "nao", "não", "no"].includes(lowered)) return false;
  return trimmed;
}

import { loadState, replaceState } from "../core/storage.js";

/** Exporta um backup técnico completo para migração entre navegadores. */
export function exportTechnicalBackup() {
  const state = loadState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  downloadBlob(blob, `climb-map-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

/** Importação substitutiva: o arquivo importado substitui todos os dados locais. */
export async function importTechnicalBackup(file) {
  const parsed = JSON.parse(await file.text());
  replaceState(parsed);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

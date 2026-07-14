/**
 * Camada única de acesso ao localStorage.
 * Nenhum módulo deve acessar localStorage diretamente; isso facilita trocar o armazenamento no futuro.
 */
const STORAGE_KEY = "climbMapStateV1";

const emptyState = {
  version: 1,
  currentUserId: null,
  users: [],
  userData: {},
  preferences: { theme: "light" }
};

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...structuredClone(emptyState), ...JSON.parse(raw) } : structuredClone(emptyState);
  } catch (error) {
    console.error("Falha ao ler os dados locais.", error);
    return structuredClone(emptyState);
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function replaceState(newState) {
  if (!newState || newState.version !== 1) throw new Error("Arquivo incompatível com esta versão.");
  saveState(newState);
}

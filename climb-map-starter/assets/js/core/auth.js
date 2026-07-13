import { loadState, saveState } from "./storage.js";

/** Cria ou autentica um perfil local usando nome único e PIN. */
export function enterProfile(name, pin) {
  const state = loadState();
  const normalizedName = name.trim();
  const existing = state.users.find(user => user.name.toLowerCase() === normalizedName.toLowerCase());

  if (existing && existing.pin !== pin) throw new Error("O nome já existe e o PIN informado está incorreto.");

  const user = existing ?? {
    id: `USR${String(state.users.length + 1).padStart(3, "0")}`,
    name: normalizedName,
    pin,
    role: state.users.length === 0 ? "ADMIN" : "USER",
    createdAt: new Date().toISOString()
  };

  if (!existing) {
    state.users.push(user);
    state.userData[user.id] = createEmptyUserData();
  }

  state.currentUserId = user.id;
  saveState(state);
  return user;
}

export function logout() {
  const state = loadState();
  state.currentUserId = null;
  saveState(state);
}

export function currentUser() {
  const state = loadState();
  return state.users.find(user => user.id === state.currentUserId) ?? null;
}

function createEmptyUserData() {
  return {
    competencyProgress: [],
    resourceProgress: [],
    plans: [],
    planItems: [],
    favorites: []
  };
}

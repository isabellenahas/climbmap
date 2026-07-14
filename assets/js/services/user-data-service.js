import { currentUser } from "../core/auth.js";
import { loadState, saveState } from "../core/storage.js";

/**
 * Centraliza toda leitura e escrita dos dados individuais do usuário.
 * As telas nunca devem manipular localStorage diretamente.
 */
class UserDataService {
  getCurrentUserData() {
    const user = currentUser();
    if (!user) return createEmptyUserData();

    const state = loadState();
    const existing = state.userData[user.id] ?? createEmptyUserData();
    state.userData[user.id] = normalizeUserData(existing);
    saveState(state);
    return structuredClone(state.userData[user.id]);
  }

  getCompetencyProgress(competencyId) {
    return this.getCurrentUserData().competencyProgress
      .find(item => item.competencyId === competencyId) ?? null;
  }

  setCompetencyAssessment(competencyId, assessmentId) {
    return this.updateUserData(data => {
      const item = upsert(data.competencyProgress, "competencyId", competencyId, {
        competencyId,
        assessmentId: "",
        notes: "",
        updatedAt: null
      });
      item.assessmentId = assessmentId;
      item.updatedAt = new Date().toISOString();
    });
  }

  toggleFavorite(competencyId) {
    return this.updateUserData(data => {
      const index = data.favorites.indexOf(competencyId);
      if (index >= 0) data.favorites.splice(index, 1);
      else data.favorites.push(competencyId);
    });
  }

  isFavorite(competencyId) {
    return this.getCurrentUserData().favorites.includes(competencyId);
  }

  setPlanningStatus(competencyId, status) {
    return this.updateUserData(data => {
      const item = upsert(data.planItems, "competencyId", competencyId, {
        competencyId,
        status: "interesse",
        priority: 0,
        targetDate: "",
        notes: "",
        updatedAt: null
      });
      item.status = status;
      item.updatedAt = new Date().toISOString();
    });
  }

  removeFromPlanning(competencyId) {
    return this.updateUserData(data => {
      data.planItems = data.planItems.filter(item => item.competencyId !== competencyId);
    });
  }

  getPlanningItems() {
    return this.getCurrentUserData().planItems;
  }

  setResourceStatus(resourceId, status) {
    return this.updateUserData(data => {
      const item = upsert(data.resourceProgress, "resourceId", resourceId, {
        resourceId,
        status: "",
        startedAt: "",
        completedAt: "",
        expiresAt: "",
        evidenceUrl: "",
        notes: "",
        updatedAt: null
      });
      item.status = status;
      if (status === "estudando" && !item.startedAt) item.startedAt = new Date().toISOString();
      if (status === "concluido") item.completedAt = new Date().toISOString();
      item.updatedAt = new Date().toISOString();
    });
  }

  getResourceProgress(resourceId) {
    return this.getCurrentUserData().resourceProgress
      .find(item => item.resourceId === resourceId) ?? null;
  }

  updateUserData(mutator) {
    const user = currentUser();
    if (!user) throw new Error("Nenhum usuário autenticado.");

    const state = loadState();
    state.userData[user.id] = normalizeUserData(state.userData[user.id] ?? createEmptyUserData());
    mutator(state.userData[user.id]);
    saveState(state);
    return structuredClone(state.userData[user.id]);
  }
}

function upsert(collection, key, value, initialValue) {
  let item = collection.find(entry => entry[key] === value);
  if (!item) {
    item = structuredClone(initialValue);
    collection.push(item);
  }
  return item;
}

function normalizeUserData(data) {
  return {
    competencyProgress: Array.isArray(data.competencyProgress) ? data.competencyProgress : [],
    resourceProgress: Array.isArray(data.resourceProgress) ? data.resourceProgress : [],
    plans: Array.isArray(data.plans) ? data.plans : [],
    planItems: Array.isArray(data.planItems) ? data.planItems : [],
    favorites: Array.isArray(data.favorites) ? data.favorites : []
  };
}

function createEmptyUserData() {
  return normalizeUserData({});
}

export const userDataService = new UserDataService();

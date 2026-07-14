import { currentUser } from "../core/auth.js";
import { loadState, saveState } from "../core/storage.js";

/**
 * Dados pessoais do usuário. A unidade de planejamento e avaliação é o NÍVEL.
 * Dados administrativos continuam vindo dos CSVs; dados pessoais ficam no navegador.
 */
class UserDataService {
  getCurrentUserData() {
    const user = currentUser();
    if (!user) return createEmptyUserData();
    const state = loadState();
    state.userData[user.id] = normalizeUserData(state.userData[user.id] ?? createEmptyUserData());
    saveState(state);
    return structuredClone(state.userData[user.id]);
  }

  /** Migra testes antigos feitos por competência para o primeiro nível da competência. */
  migrateLegacyData(levels = []) {
    const user = currentUser();
    if (!user) return;
    const state = loadState();
    const data = normalizeUserData(state.userData[user.id] ?? createEmptyUserData());
    if (data.levelModelMigrated) return;

    const firstLevelByCompetency = new Map();
    [...levels].sort(byOrder).forEach(level => {
      if (!firstLevelByCompetency.has(level.competencia_id)) {
        firstLevelByCompetency.set(level.competencia_id, level.nivel_id);
      }
    });

    data.competencyProgress.forEach(old => {
      const levelId = firstLevelByCompetency.get(old.competencyId);
      if (!levelId || !old.assessmentId) return;
      const target = upsert(data.levelProgress, "levelId", levelId, emptyLevelProgress(levelId));
      if (!target.assessmentId) target.assessmentId = old.assessmentId;
    });

    data.planItems.forEach(old => {
      const levelId = firstLevelByCompetency.get(old.competencyId);
      if (!levelId) return;
      const target = upsert(data.levelProgress, "levelId", levelId, emptyLevelProgress(levelId));
      if (!target.status) target.status = old.status || "interesse";
      target.priority = old.priority ?? target.priority;
      target.targetDate = old.targetDate || target.targetDate;
      target.notes = old.notes || target.notes;
    });

    data.levelModelMigrated = true;
    data.levelModelMigratedAt = new Date().toISOString();
    state.userData[user.id] = data;
    saveState(state);
  }

  getLevelProgress(levelId) {
    return this.getCurrentUserData().levelProgress.find(item => item.levelId === levelId) ?? null;
  }

  setLevelAssessment(levelId, assessmentId) {
    return this.updateUserData(data => {
      const item = upsert(data.levelProgress, "levelId", levelId, emptyLevelProgress(levelId));
      item.assessmentId = assessmentId;
      item.updatedAt = new Date().toISOString();
    });
  }

  setLevelPlanningStatus(levelId, status) {
    return this.updateUserData(data => {
      const item = upsert(data.levelProgress, "levelId", levelId, emptyLevelProgress(levelId));
      item.status = status;
      item.updatedAt = new Date().toISOString();
    });
  }

  removeLevelFromPlanning(levelId) {
    return this.updateUserData(data => {
      const item = data.levelProgress.find(entry => entry.levelId === levelId);
      if (item) {
        item.status = "";
        item.priority = 0;
        item.targetDate = "";
        item.updatedAt = new Date().toISOString();
      }
    });
  }

  getPlanningItems() {
    return this.getCurrentUserData().levelProgress.filter(item => item.status);
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

  setSelectedTrail(trailId) {
    return this.updateUserData(data => {
      data.selectedTrailId = trailId || "";
      data.selectedTrailUpdatedAt = new Date().toISOString();
    });
  }

  getSelectedTrailId() {
    return this.getCurrentUserData().selectedTrailId;
  }

  setResourceStatus(resourceId, status) {
    return this.updateUserData(data => {
      const item = upsert(data.resourceProgress, "resourceId", resourceId, {
        resourceId, status: "", startedAt: "", completedAt: "", expiresAt: "",
        evidenceUrl: "", notes: "", updatedAt: null
      });
      item.status = status;
      if (status === "estudando" && !item.startedAt) item.startedAt = new Date().toISOString();
      item.completedAt = status === "concluido" ? new Date().toISOString() : "";
      item.updatedAt = new Date().toISOString();
    });
  }

  getResourceProgress(resourceId) {
    return this.getCurrentUserData().resourceProgress.find(item => item.resourceId === resourceId) ?? null;
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

function emptyLevelProgress(levelId) {
  return { levelId, assessmentId: "", status: "", priority: 0, targetDate: "", notes: "", updatedAt: null };
}

function upsert(collection, key, value, initialValue) {
  let item = collection.find(entry => entry[key] === value);
  if (!item) { item = structuredClone(initialValue); collection.push(item); }
  return item;
}

function normalizeUserData(data) {
  return {
    competencyProgress: Array.isArray(data.competencyProgress) ? data.competencyProgress : [],
    resourceProgress: Array.isArray(data.resourceProgress) ? data.resourceProgress : [],
    plans: Array.isArray(data.plans) ? data.plans : [],
    planItems: Array.isArray(data.planItems) ? data.planItems : [],
    levelProgress: Array.isArray(data.levelProgress) ? data.levelProgress : [],
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    selectedTrailId: typeof data.selectedTrailId === "string" ? data.selectedTrailId : "",
    selectedTrailUpdatedAt: data.selectedTrailUpdatedAt ?? null,
    levelModelMigrated: Boolean(data.levelModelMigrated),
    levelModelMigratedAt: data.levelModelMigratedAt ?? null
  };
}

function createEmptyUserData() { return normalizeUserData({}); }
function byOrder(a, b) { return Number(a.ordem || 0) - Number(b.ordem || 0); }
export const userDataService = new UserDataService();

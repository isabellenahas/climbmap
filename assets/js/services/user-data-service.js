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
      const previous = item.assessmentId || "";
      if (previous === assessmentId) return;
      item.assessmentId = assessmentId;
      item.updatedAt = new Date().toISOString();
      appendHistory(data, { type: "autoavaliacao_alterada", entityType: "nivel", entityId: levelId, previousValue: previous, newValue: assessmentId });
    });
  }

  setLevelPlanningStatus(levelId, status) {
    return this.updateUserData(data => {
      const item = upsert(data.levelProgress, "levelId", levelId, emptyLevelProgress(levelId));
      const now = new Date().toISOString();
      const previous = item.status || "";
      if (previous === status) return;
      item.status = status;
      if (status === "estudando" && !item.startedAt) item.startedAt = now;
      item.completedAt = status === "concluido" ? now : "";
      item.updatedAt = now;
      const type = status === "concluido" ? "nivel_concluido" : status === "estudando" ? "nivel_iniciado" : "nivel_planejado";
      appendHistory(data, { type, entityType: "nivel", entityId: levelId, previousValue: previous, newValue: status });
    });
  }

  /** Atualiza metadados do planejamento sem alterar a nota do nível. */
  setLevelPlanningDetails(levelId, details = {}) {
    return this.updateUserData(data => {
      const item = upsert(data.levelProgress, "levelId", levelId, emptyLevelProgress(levelId));
      if (Object.hasOwn(details, "priority")) item.priority = Number(details.priority) || 0;
      if (Object.hasOwn(details, "targetDate")) item.targetDate = String(details.targetDate || "");
      if (Object.hasOwn(details, "notes")) item.notes = String(details.notes || "").trim();
      const previousEvidence = item.evidenceUrl || "";
      item.updatedAt = new Date().toISOString();
      if (!previousEvidence && item.evidenceUrl) appendHistory(data, { type: "evidencia_adicionada", entityType: "recurso", entityId: resourceId, newValue: item.evidenceUrl });
    });
  }

  removeLevelFromPlanning(levelId) {
    return this.updateUserData(data => {
      const item = data.levelProgress.find(entry => entry.levelId === levelId);
      if (item) {
        item.status = "";
        item.priority = 0;
        item.targetDate = "";
        item.notes = "";
        item.startedAt = "";
        item.completedAt = "";
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
      const item = upsert(data.resourceProgress, "resourceId", resourceId, emptyResourceProgress(resourceId));
      const now = new Date().toISOString();
      const previous = item.status || "";
      if (previous === status) return;
      item.status = status;
      if (status === "estudando" && !item.startedAt) item.startedAt = now;
      item.completedAt = status === "concluido" ? now : "";
      item.updatedAt = now;
      const type = status === "concluido" ? "recurso_concluido" : status === "estudando" ? "recurso_iniciado" : "recurso_planejado";
      appendHistory(data, { type, entityType: "recurso", entityId: resourceId, previousValue: previous, newValue: status });
    });
  }

  /** Registra evidência, validade e observações pessoais do recurso. */
  setResourceDetails(resourceId, details = {}) {
    return this.updateUserData(data => {
      const item = upsert(data.resourceProgress, "resourceId", resourceId, emptyResourceProgress(resourceId));
      const previousEvidence = item.evidenceUrl || "";
      if (Object.hasOwn(details, "expiresAt")) item.expiresAt = String(details.expiresAt || "");
      if (Object.hasOwn(details, "evidenceUrl")) item.evidenceUrl = String(details.evidenceUrl || "").trim();
      if (Object.hasOwn(details, "notes")) item.notes = String(details.notes || "").trim();
      item.updatedAt = new Date().toISOString();
      if (!previousEvidence && item.evidenceUrl) appendHistory(data, { type: "evidencia_adicionada", entityType: "recurso", entityId: resourceId, newValue: item.evidenceUrl });
    });
  }

  getResourceProgress(resourceId) {
    return this.getCurrentUserData().resourceProgress.find(item => item.resourceId === resourceId) ?? null;
  }

  getHistory() {
    return this.getCurrentUserData().history
      .slice()
      .sort((a, b) => String(b.occurredAt || "").localeCompare(String(a.occurredAt || "")));
  }

  addHistoryEvent(event = {}) {
    return this.updateUserData(data => {
      appendHistory(data, event);
    });
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
  return {
    levelId,
    assessmentId: "",
    status: "",
    priority: 0,
    targetDate: "",
    notes: "",
    startedAt: "",
    completedAt: "",
    updatedAt: null
  };
}

function emptyResourceProgress(resourceId) {
  return {
    resourceId,
    status: "",
    startedAt: "",
    completedAt: "",
    expiresAt: "",
    evidenceUrl: "",
    notes: "",
    updatedAt: null
  };
}

function upsert(collection, key, value, initialValue) {
  let item = collection.find(entry => entry[key] === value);
  if (!item) { item = structuredClone(initialValue); collection.push(item); }
  return item;
}

function normalizeUserData(data) {
  return {
    competencyProgress: Array.isArray(data.competencyProgress) ? data.competencyProgress : [],
    resourceProgress: Array.isArray(data.resourceProgress)
      ? data.resourceProgress.map(item => ({ ...emptyResourceProgress(item.resourceId), ...item }))
      : [],
    plans: Array.isArray(data.plans) ? data.plans : [],
    planItems: Array.isArray(data.planItems) ? data.planItems : [],
    levelProgress: Array.isArray(data.levelProgress)
      ? data.levelProgress.map(item => ({ ...emptyLevelProgress(item.levelId), ...item }))
      : [],
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    selectedTrailId: typeof data.selectedTrailId === "string" ? data.selectedTrailId : "",
    selectedTrailUpdatedAt: data.selectedTrailUpdatedAt ?? null,
    history: Array.isArray(data.history) ? data.history : [],
    levelModelMigrated: Boolean(data.levelModelMigrated),
    levelModelMigratedAt: data.levelModelMigratedAt ?? null
  };
}

function appendHistory(data, event) {
  data.history = Array.isArray(data.history) ? data.history : [];
  data.history.push({
    eventId: `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    type: String(event.type || "alteracao"),
    entityType: String(event.entityType || ""),
    entityId: String(event.entityId || ""),
    previousValue: event.previousValue ?? "",
    newValue: event.newValue ?? "",
    description: String(event.description || "")
  });
}

function createEmptyUserData() { return normalizeUserData({}); }
function byOrder(a, b) { return Number(a.ordem || 0) - Number(b.ordem || 0); }
export const userDataService = new UserDataService();

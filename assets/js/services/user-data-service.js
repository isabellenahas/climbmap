import { currentUser } from "../core/auth.js";
import { loadState, saveState } from "../core/storage.js";

/**
 * Dados individuais do Climb Map.
 * - Autoavaliação e planejamento pertencem à COMPETÊNCIA.
 * - Recursos possuem acompanhamento independente.
 * - Toda alteração relevante gera histórico para a página Evolução.
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

  /** Converte automaticamente registros antigos por nível para registros por competência. */
  migrateToCompetencyModel(levels = []) {
    const user = currentUser();
    if (!user) return;
    const state = loadState();
    const data = normalizeUserData(state.userData[user.id] ?? createEmptyUserData());
    if (data.competencyModelMigrated) return;

    const competencyByLevel = new Map(levels.map(level => [level.nivel_id, level.competencia_id]));
    for (const old of data.levelProgress) {
      const competencyId = competencyByLevel.get(old.levelId);
      if (!competencyId) continue;
      const target = upsert(data.competencyProgress, "competencyId", competencyId, emptyCompetencyProgress(competencyId));
      if (!target.assessmentId && old.assessmentId) target.assessmentId = old.assessmentId;
      const mappedStatus = mapLegacyStatus(old.status);
      if (!target.status && mappedStatus) target.status = mappedStatus;
      target.priority = Math.max(Number(target.priority || 0), Number(old.priority || 0));
      target.targetDate = target.targetDate || old.targetDate || "";
      target.notes = target.notes || old.notes || "";
      target.startedAt = target.startedAt || old.startedAt || "";
      target.completedAt = target.completedAt || old.completedAt || "";
    }

    data.competencyModelMigrated = true;
    data.competencyModelMigratedAt = new Date().toISOString();
    state.userData[user.id] = data;
    saveState(state);
  }

  getCompetencyProgress(competencyId) {
    return this.getCurrentUserData().competencyProgress.find(item => item.competencyId === competencyId) ?? null;
  }

  setCompetencyAssessment(competencyId, assessmentId) {
    return this.updateUserData(data => {
      const item = upsert(data.competencyProgress, "competencyId", competencyId, emptyCompetencyProgress(competencyId));
      const previous = item.assessmentId;
      item.assessmentId = assessmentId;
      item.updatedAt = nowIso();
      if (previous !== assessmentId) addHistory(data, "autoavaliacao_alterada", "competencia", competencyId, previous, assessmentId);
    });
  }

  setCompetencyStatus(competencyId, status, options = {}) {
    return this.updateUserData(data => {
      const item = upsert(data.competencyProgress, "competencyId", competencyId, emptyCompetencyProgress(competencyId));
      const previous = item.status;
      const now = nowIso();
      item.status = status;
      if (status === "em_andamento" && !item.startedAt) item.startedAt = now;
      if (status === "concluido") item.completedAt = options.completedAt || item.completedAt || today();
      if (status !== "concluido" && previous === "concluido") item.completedAt = "";
      if (status === "cancelado") item.cancelledAt = now;
      item.updatedAt = now;
      if (previous !== status) addHistory(data, status === "concluido" ? "competencia_concluida" : "competencia_status_alterado", "competencia", competencyId, previous, status, item.completedAt || "");
    });
  }

  setCompetencyPlanningDetails(competencyId, details = {}) {
    return this.updateUserData(data => {
      const item = upsert(data.competencyProgress, "competencyId", competencyId, emptyCompetencyProgress(competencyId));
      if (Object.hasOwn(details, "priority")) item.priority = Number(details.priority) || 0;
      if (Object.hasOwn(details, "targetDate")) item.targetDate = String(details.targetDate || "");
      if (Object.hasOwn(details, "notes")) item.notes = String(details.notes || "").trim();
      item.updatedAt = nowIso();
      if (item.targetDate) addHistory(data, "competencia_planejada", "competencia", competencyId, "", item.targetDate, item.targetDate);
    });
  }

  getPlanningItems() {
    return this.getCurrentUserData().competencyProgress.filter(item => item.status && item.status !== "cancelado");
  }

  toggleFavorite(competencyId) {
    return this.updateUserData(data => {
      const index = data.favorites.indexOf(competencyId);
      if (index >= 0) data.favorites.splice(index, 1);
      else data.favorites.push(competencyId);
    });
  }

  isFavorite(competencyId) { return this.getCurrentUserData().favorites.includes(competencyId); }
  setSelectedTrail(trailId) { return this.updateUserData(data => { data.selectedTrailId = trailId || ""; data.selectedTrailUpdatedAt = nowIso(); }); }
  getSelectedTrailId() { return this.getCurrentUserData().selectedTrailId; }

  getResourceProgress(resourceId) {
    return this.getCurrentUserData().resourceProgress.find(item => item.resourceId === resourceId) ?? null;
  }

  /**
   * Atualiza o recurso e sincroniza a competência associada.
   * O sistema pode avançar o status da competência, mas nunca retrocede automaticamente.
   */
  setResourceStatus(resourceId, status, competencyId = "") {
    return this.updateUserData(data => {
      const item = upsert(data.resourceProgress, "resourceId", resourceId, emptyResourceProgress(resourceId));
      const previous = item.status;
      const now = nowIso();
      item.status = status;
      item.competencyId = competencyId || item.competencyId;
      if (status === "em_andamento" && !item.startedAt) item.startedAt = today();
      if (status === "concluido") item.completedAt = item.completedAt || today();
      if (status !== "concluido" && previous === "concluido") item.completedAt = "";
      if (status === "cancelado") item.cancelledAt = now;
      item.updatedAt = now;
      if (previous !== status) addHistory(data, status === "concluido" ? "recurso_concluido" : "recurso_status_alterado", "recurso", resourceId, previous, status, item.completedAt || item.targetDate || "");
      if (item.competencyId) syncCompetencyFromResources(data, item.competencyId);
    });
  }

  setResourceDetails(resourceId, details = {}, competencyId = "") {
    return this.updateUserData(data => {
      const item = upsert(data.resourceProgress, "resourceId", resourceId, emptyResourceProgress(resourceId));
      item.competencyId = competencyId || item.competencyId;
      if (Object.hasOwn(details, "startedAt")) item.startedAt = String(details.startedAt || "");
      if (Object.hasOwn(details, "targetDate")) item.targetDate = String(details.targetDate || "");
      if (Object.hasOwn(details, "completedAt")) item.completedAt = String(details.completedAt || "");
      if (Object.hasOwn(details, "expiresAt")) item.expiresAt = String(details.expiresAt || "");
      if (Object.hasOwn(details, "evidenceUrl")) item.evidenceUrl = String(details.evidenceUrl || "").trim();
      if (Object.hasOwn(details, "notes")) item.notes = String(details.notes || "").trim();
      item.updatedAt = nowIso();
      if (item.targetDate) addHistory(data, "recurso_planejado", "recurso", resourceId, "", item.targetDate, item.targetDate);
      if (item.competencyId) syncCompetencyFromResources(data, item.competencyId);
    });
  }

  getHistory(year = null) {
    const events = this.getCurrentUserData().history;
    return year ? events.filter(item => new Date(item.date).getFullYear() === Number(year)) : events;
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

function syncCompetencyFromResources(data, competencyId) {
  const resources = data.resourceProgress.filter(item => item.competencyId === competencyId && item.status && item.status !== "cancelado");
  if (!resources.length) return;
  const competency = upsert(data.competencyProgress, "competencyId", competencyId, emptyCompetencyProgress(competencyId));
  const rank = { stand_by: 0, em_aberto: 1, em_andamento: 2, concluido: 3 };
  const previous = competency.status;
  let proposed = "";
  if (resources.some(item => item.status === "em_andamento")) proposed = "em_andamento";
  else if (resources.some(item => item.status === "em_aberto")) proposed = "em_aberto";
  else if (resources.every(item => item.status === "concluido")) proposed = "concluido";
  if (!proposed) return;
  if (proposed === "concluido" || !previous || previous === "cancelado" || (rank[proposed] ?? 0) > (rank[previous] ?? 0)) {
    competency.status = proposed;
    if (proposed === "em_andamento" && !competency.startedAt) competency.startedAt = today();
    if (proposed === "concluido") competency.completedAt = competency.completedAt || today();
    competency.updatedAt = nowIso();
    if (previous !== proposed) addHistory(data, proposed === "concluido" ? "competencia_concluida" : "competencia_status_alterado", "competencia", competencyId, previous, proposed, competency.completedAt || "");
  }
}

function emptyCompetencyProgress(competencyId) {
  return { competencyId, assessmentId: "", status: "", priority: 0, targetDate: "", notes: "", addedAt: nowIso(), startedAt: "", completedAt: "", cancelledAt: "", updatedAt: null };
}
function emptyResourceProgress(resourceId) {
  return { resourceId, competencyId: "", status: "", startedAt: "", targetDate: "", completedAt: "", expiresAt: "", evidenceUrl: "", notes: "", cancelledAt: "", updatedAt: null };
}
function addHistory(data, type, entityType, entityId, previousValue = "", newValue = "", effectiveDate = "") {
  data.history.push({ id: `EVT-${Date.now()}-${Math.random().toString(16).slice(2)}`, date: effectiveDate || nowIso(), type, entityType, entityId, previousValue, newValue, createdAt: nowIso() });
}
function upsert(collection, key, value, initialValue) { let item = collection.find(entry => entry[key] === value); if (!item) { item = structuredClone(initialValue); collection.push(item); } return item; }
function normalizeUserData(data) {
  return {
    competencyProgress: Array.isArray(data.competencyProgress) ? data.competencyProgress.map(item => ({ ...emptyCompetencyProgress(item.competencyId), ...item, status: mapLegacyStatus(item.status) })) : [],
    resourceProgress: Array.isArray(data.resourceProgress) ? data.resourceProgress.map(item => ({ ...emptyResourceProgress(item.resourceId), ...item, status: mapLegacyStatus(item.status) })) : [],
    levelProgress: Array.isArray(data.levelProgress) ? data.levelProgress : [],
    plans: Array.isArray(data.plans) ? data.plans : [],
    planItems: Array.isArray(data.planItems) ? data.planItems : [],
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    history: Array.isArray(data.history) ? data.history : [],
    selectedTrailId: typeof data.selectedTrailId === "string" ? data.selectedTrailId : "",
    selectedTrailUpdatedAt: data.selectedTrailUpdatedAt ?? null,
    competencyModelMigrated: Boolean(data.competencyModelMigrated),
    competencyModelMigratedAt: data.competencyModelMigratedAt ?? null
  };
}
function mapLegacyStatus(status) { return ({ interesse: "em_aberto", vou_estudar: "em_aberto", estudando: "em_andamento", concluido: "concluido", pausado: "stand_by", stand_by: "stand_by", em_aberto: "em_aberto", em_andamento: "em_andamento", cancelado: "cancelado" })[status] || status || ""; }
function createEmptyUserData() { return normalizeUserData({}); }
function nowIso() { return new Date().toISOString(); }
function today() { return new Date().toISOString().slice(0, 10); }
export const userDataService = new UserDataService();

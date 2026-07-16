import { dataService } from "../services/data-service.js";
import { configService } from "../services/config-service.js";
import { userDataService } from "../services/user-data-service.js";

/** Regras consolidadas do Climb Map. */
class BusinessEngine {
  prepareUserData() {
    userDataService.migrateToCompetencyModel(dataService.getAll("niveis", { activeOnly: true }));
  }

  getAssessmentScale() {
    return configService.getAutoAssessments().filter(item => item.ativo !== false).sort(byOrder);
  }

  getCompetencyScore(competencyId) {
    this.prepareUserData();
    const scale = this.getAssessmentScale();
    const progress = userDataService.getCompetencyProgress(competencyId);
    const selected = scale.find(item => item.autoavaliacao_id === progress?.assessmentId);
    const maximum = Math.max(...scale.map(item => Number(item.valor) || 0), 0);
    const earned = Number(selected?.valor) || 0;
    return {
      competencyId,
      assessmentId: progress?.assessmentId || "",
      assessmentLabel: selected?.nome || "Sem nota",
      earned,
      possible: maximum,
      percentage: maximum > 0 ? clamp(Math.round((earned / maximum) * 100)) : 0,
      planningStatus: progress?.status || ""
    };
  }

  getDomainScore(domainId) {
    const competencies = dataService.getAll("competencias", { activeOnly: true }).filter(item => item.dominio_id === domainId);
    return aggregate(competencies.map(item => this.getCompetencyScore(item.competencia_id)));
  }

  getCategoryScore(categoryId) {
    const domains = dataService.getAll("dominios", { activeOnly: true }).filter(item => item.categoria_id === categoryId);
    return aggregate(domains.map(item => this.getDomainScore(item.dominio_id)));
  }

  getGeneralScore() {
    const categories = dataService.getAll("categorias", { activeOnly: true });
    return aggregate(categories.map(item => this.getCategoryScore(item.categoria_id)));
  }

  getTrailAnalysis(trailId) {
    const links = dataService.getAll("trilhaCompetencias").filter(item => item.trilha_id === trailId);
    const items = links.map(link => {
      const competency = dataService.getById("competencias", link.competencia_id);
      const score = this.getCompetencyScore(link.competencia_id);
      return { ...link, competency, score, met: score.percentage >= 100 };
    }).filter(item => item.competency);
    return { total: items.length, completed: items.filter(item => item.met).length, score: aggregate(items.map(item => item.score)), items };
  }

  getDashboard() {
    this.prepareUserData();
    const userData = userDataService.getCurrentUserData();
    const categories = dataService.getAll("categorias", { activeOnly: true }).map(category => ({ ...category, score: this.getCategoryScore(category.categoria_id) }));
    const competencies = dataService.getAll("competencias", { activeOnly: true });
    const resources = dataService.getAll("recursos", { activeOnly: true });
    const types = new Map(configService.getResourceTypes().map(item => [item.tipo_recurso_id, item.nome]));
    const planning = userData.competencyProgress.filter(item => item.status && item.status !== "cancelado");
    const resourceActive = userData.resourceProgress.filter(item => ["em_aberto", "em_andamento"].includes(item.status));
    const inProgressCourses = resourceActive.map(progress => {
      const resource = resources.find(item => item.recurso_id === progress.resourceId);
      if (!resource) return null;
      const level = dataService.getById("niveis", resource.nivel_id);
      const competency = level ? dataService.getById("competencias", level.competencia_id) : null;
      return { ...resource, status: progress.status, progress, competencyId: competency?.competencia_id || progress.competencyId, competencyName: competency?.nome || "", levelName: level?.nome || "", typeName: types.get(resource.tipo_recurso_id) || "Recurso", url: resource.url_principal || "" };
    }).filter(Boolean);
    const completedResources = userData.resourceProgress.filter(item => item.status === "concluido").length;
    const completedCertifications = userData.resourceProgress.filter(item => item.status === "concluido").filter(progress => {
      const resource = resources.find(item => item.recurso_id === progress.resourceId);
      return /certifica/i.test(types.get(resource?.tipo_recurso_id) || "");
    }).length;
    const highestCategory = [...categories].sort((a,b) => b.score.percentage - a.score.percentage)[0] || null;
    const selectedTrailId = userData.selectedTrailId;
    const selectedTrail = selectedTrailId ? dataService.getById("trilhas", selectedTrailId) : null;
    const trailAnalysis = selectedTrail ? this.getTrailAnalysis(selectedTrailId) : null;
    return {
      general: this.getGeneralScore(),
      categories,
      highestCategory,
      assessedCompetencies: userData.competencyProgress.filter(item => item.assessmentId).length,
      totalCompetencies: competencies.length,
      planningItems: planning.length,
      studyingNow: planning.filter(item => item.status === "em_andamento").length + resourceActive.filter(item => item.status === "em_andamento").length,
      completedResources,
      completedCertifications,
      favorites: userData.favorites.length,
      inProgressCourses,
      selectedTrail: selectedTrail && trailAnalysis ? { trail: selectedTrail, ...trailAnalysis } : null
    };
  }

  getEvolutionTimeline(year = new Date().getFullYear()) {
    this.prepareUserData();
    const data = userDataService.getCurrentUserData();
    const competencies = dataService.getAll("competencias", { activeOnly: true });
    const resources = dataService.getAll("recursos", { activeOnly: true });
    const completed = [];
    const planned = [];
    for (const item of data.competencyProgress) {
      const competency = competencies.find(row => row.competencia_id === item.competencyId);
      if (!competency) continue;
      if (item.status === "concluido" && item.completedAt && yearOf(item.completedAt) === Number(year)) completed.push({ date: item.completedAt, kind: "competencia", title: competency.nome, competencyId: competency.competencia_id, resources: relatedResources(item.competencyId, data, resources) });
      if (item.targetDate && yearOf(item.targetDate) === Number(year) && item.status !== "concluido") planned.push({ date: item.targetDate, kind: "competencia", title: competency.nome, competencyId: competency.competencia_id, resources: relatedResources(item.competencyId, data, resources) });
    }
    for (const item of data.resourceProgress) {
      const resource = resources.find(row => row.recurso_id === item.resourceId);
      if (!resource) continue;
      if (item.status === "concluido" && item.completedAt && yearOf(item.completedAt) === Number(year)) completed.push({ date: item.completedAt, kind: "recurso", title: resource.nome, competencyId: item.competencyId, resources: [] });
      if (item.targetDate && yearOf(item.targetDate) === Number(year) && item.status !== "concluido") planned.push({ date: item.targetDate, kind: "recurso", title: resource.nome, competencyId: item.competencyId, resources: [] });
    }
    return { year: Number(year), completed: completed.sort(byDate), planned: planned.sort(byDate) };
  }
}

function relatedResources(competencyId, userData, resources) {
  return userData.resourceProgress.filter(item => item.competencyId === competencyId && item.status).map(item => ({ ...item, resource: resources.find(row => row.recurso_id === item.resourceId) })).filter(item => item.resource);
}
function aggregate(scores) { const valid = scores.filter(Boolean); if (!valid.length) return { earned:0, possible:0, percentage:0 }; const earned = valid.reduce((sum,item)=>sum+Number(item.earned||0),0); const possible = valid.reduce((sum,item)=>sum+Number(item.possible||0),0); return { earned, possible, percentage: possible > 0 ? clamp(Math.round((earned/possible)*100)) : 0 }; }
function clamp(value){ return Math.max(0, Math.min(100, Number(value)||0)); }
function byOrder(a,b){ return Number(a.ordem||0)-Number(b.ordem||0); }
function byDate(a,b){ return String(a.date).localeCompare(String(b.date)); }
function yearOf(value){ return new Date(`${String(value).slice(0,10)}T12:00:00`).getFullYear(); }
export const businessEngine = new BusinessEngine();

import { dataService } from "../services/data-service.js";
import { configService } from "../services/config-service.js";
import { userDataService } from "../services/user-data-service.js";

/** Regras de notas e consolidação. As telas apenas exibem os resultados. */
class BusinessEngine {
  prepareUserData() {
    userDataService.migrateLegacyData(dataService.getAll("niveis", { activeOnly: true }));
  }

  getAssessmentScale() {
    return configService.getAutoAssessments().filter(item => item.ativo !== false).sort(byOrder);
  }

  getLevelScore(levelId) {
    this.prepareUserData();
    const scale = this.getAssessmentScale();
    const progress = userDataService.getLevelProgress(levelId);
    const selected = scale.find(item => item.autoavaliacao_id === progress?.assessmentId);
    const assessmentMaximum = Math.max(...scale.map(item => Number(item.valor) || 0), 0);
    const assessmentValue = Number(selected?.valor) || 0;
    const resources = dataService.getAll("recursos", { activeOnly: true }).filter(item => item.nivel_id === levelId);
    const resourcePointsMaximum = resources.reduce((sum, item) => sum + (Number(item.pontos) || 0), 0);
    const resourcePointsEarned = resources.reduce((sum, item) => {
      return sum + (userDataService.getResourceProgress(item.recurso_id)?.status === "concluido" ? (Number(item.pontos) || 0) : 0);
    }, 0);
    const earned = assessmentValue + resourcePointsEarned;
    const possible = assessmentMaximum + resourcePointsMaximum;
    return {
      levelId,
      assessmentId: progress?.assessmentId ?? "",
      assessmentLabel: selected?.nome ?? "Sem nota",
      planningStatus: progress?.status ?? "",
      earned, possible,
      percentage: possible > 0 ? clamp(Math.round((earned / possible) * 100)) : 0
    };
  }

  getCompetencyScore(competencyId) {
    const levels = this.getCompetencyLevels(competencyId);
    return { competencyId, ...aggregateScores(levels.map(level => this.getLevelScore(level.nivel_id))) };
  }

  getDomainScore(domainId) {
    const competencies = dataService.getAll("competencias", { activeOnly: true }).filter(item => item.dominio_id === domainId);
    return aggregateScores(competencies.map(item => this.getCompetencyScore(item.competencia_id)));
  }

  getCategoryScore(categoryId) {
    const domains = dataService.getAll("dominios", { activeOnly: true }).filter(item => item.categoria_id === categoryId);
    return aggregateScores(domains.map(item => this.getDomainScore(item.dominio_id)));
  }

  getGeneralScore() {
    const categories = dataService.getAll("categorias", { activeOnly: true });
    return aggregateScores(categories.map(item => this.getCategoryScore(item.categoria_id)));
  }

  getCompetencyLevels(competencyId) {
    return dataService.getAll("niveis", { activeOnly: true }).filter(item => item.competencia_id === competencyId).sort(byOrder);
  }

  getTrailAnalysis(trailId) {
    const trail = dataService.getById("trilhas", trailId);
    if (!trail) return null;
    const links = dataService.getAll("trilhaCompetencias").filter(item => item.trilha_id === trailId).sort(byOrder);
    const requirements = links.map(link => {
      const competency = dataService.getById("competencias", link.competencia_id);
      const minimumLevel = dataService.getById("niveis", link.nivel_minimo_id);
      if (!competency || !minimumLevel) return null;
      const requiredLevels = this.getCompetencyLevels(competency.competencia_id)
        .filter(level => Number(level.ordem || 0) <= Number(minimumLevel.ordem || 0));
      const score = aggregateScores(requiredLevels.map(level => this.getLevelScore(level.nivel_id)));
      return { ...link, competency, minimumLevel, requiredLevels, score };
    }).filter(Boolean);
    return {
      trail,
      requirements,
      score: aggregateScores(requirements.map(item => item.score)),
      completed: requirements.filter(item => item.score.percentage >= 100).length,
      total: requirements.length
    };
  }

  getSelectedTrailAnalysis() {
    const id = userDataService.getSelectedTrailId();
    return id ? this.getTrailAnalysis(id) : null;
  }

  getDashboard() {
    this.prepareUserData();
    const userData = userDataService.getCurrentUserData();
    const categories = dataService.getAll("categorias", { activeOnly: true }).sort(byOrder)
      .map(category => ({ ...category, score: this.getCategoryScore(category.categoria_id) }));
    const highestCategory = [...categories].sort((a, b) => b.score.percentage - a.score.percentage)[0] ?? null;
    const planningItems = userData.levelProgress.filter(item => item.status);
    const resourceTypes = new Map(configService.getResourceTypes().map(item => [item.tipo_recurso_id, String(item.nome || "").toLocaleLowerCase("pt-BR")]));
    const completedResourceIds = new Set(userData.resourceProgress.filter(item => item.status === "concluido").map(item => item.resourceId));
    const completedCertifications = dataService.getAll("recursos", { activeOnly: true })
      .filter(item => completedResourceIds.has(item.recurso_id) && (resourceTypes.get(item.tipo_recurso_id) || "").includes("certifica")).length;
    return {
      general: this.getGeneralScore(), categories, highestCategory,
      selectedTrail: this.getSelectedTrailAnalysis(),
      assessedLevels: userData.levelProgress.filter(item => item.assessmentId).length,
      planningItems: planningItems.length,
      studyingLevels: planningItems.filter(item => item.status === "estudando").length,
      completedResources: completedResourceIds.size,
      completedCertifications,
      favorites: userData.favorites.length,
      totalLevels: dataService.getAll("niveis", { activeOnly: true }).length
    };
  }
}

function aggregateScores(scores) {
  const earned = scores.reduce((sum, item) => sum + (Number(item.earned) || 0), 0);
  const possible = scores.reduce((sum, item) => sum + (Number(item.possible) || 0), 0);
  return { earned, possible, percentage: possible > 0 ? clamp(Math.round((earned / possible) * 100)) : 0, items: scores.length };
}
function clamp(value) { return Math.max(0, Math.min(100, Number(value) || 0)); }
function byOrder(a, b) { return Number(a.ordem || 0) - Number(b.ordem || 0); }
export const businessEngine = new BusinessEngine();

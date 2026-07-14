import { dataService } from "../services/data-service.js";
import { configService } from "../services/config-service.js";
import { userDataService } from "../services/user-data-service.js";

/**
 * Cérebro de regras do Climb Map.
 * Converte dados administrativos e progresso pessoal em indicadores para as telas.
 */
class BusinessEngine {
  getAssessmentScale() {
    return configService.getAutoAssessments()
      .filter(item => item.ativo !== false)
      .sort(byOrder);
  }

  getCompetencyScore(competencyId) {
    const scale = this.getAssessmentScale();
    const progress = userDataService.getCompetencyProgress(competencyId);
    const selected = scale.find(item => item.autoavaliacao_id === progress?.assessmentId);
    const maximum = Math.max(...scale.map(item => Number(item.valor) || 0), 0);
    const assessmentValue = Number(selected?.valor) || 0;

    const levels = dataService.getAll("niveis", { activeOnly: true })
      .filter(level => level.competencia_id === competencyId);
    const resources = dataService.getAll("recursos", { activeOnly: true })
      .filter(resource => levels.some(level => level.nivel_id === resource.nivel_id));
    const resourcePointsMaximum = resources.reduce((sum, resource) => sum + (Number(resource.pontos) || 0), 0);
    const resourcePointsEarned = resources.reduce((sum, resource) => {
      const resourceProgress = userDataService.getResourceProgress(resource.recurso_id);
      return sum + (resourceProgress?.status === "concluido" ? (Number(resource.pontos) || 0) : 0);
    }, 0);

    const earned = assessmentValue + resourcePointsEarned;
    const possible = maximum + resourcePointsMaximum;
    const percentage = possible > 0 ? Math.round((earned / possible) * 100) : 0;

    return {
      competencyId,
      assessmentId: progress?.assessmentId ?? "",
      assessmentLabel: selected?.nome ?? "Sem nota",
      assessmentValue,
      resourcePointsEarned,
      resourcePointsMaximum,
      earned,
      possible,
      percentage: clamp(percentage)
    };
  }

  getCategoryScore(categoryId) {
    const domainIds = new Set(dataService.getAll("dominios", { activeOnly: true })
      .filter(domain => domain.categoria_id === categoryId)
      .map(domain => domain.dominio_id));
    const competencies = dataService.getAll("competencias", { activeOnly: true })
      .filter(competency => domainIds.has(competency.dominio_id));
    return aggregateScores(competencies.map(item => this.getCompetencyScore(item.competencia_id)));
  }

  getGeneralScore() {
    const competencies = dataService.getAll("competencias", { activeOnly: true });
    return aggregateScores(competencies.map(item => this.getCompetencyScore(item.competencia_id)));
  }

  getTrailScore(trailId) {
    return this.getTrailAnalysis(trailId)?.score ?? aggregateScores([]);
  }

  /**
   * Entrega o retrato completo de uma trilha: progresso, competências e lacunas.
   * Nesta versão, lacuna significa uma competência da trilha que ainda não chegou a 100%.
   * A regra final de aderência ao nível mínimo será refinada quando a fórmula oficial for fechada.
   */
  getTrailAnalysis(trailId) {
    const trail = dataService.getById("trilhas", trailId);
    if (!trail) return null;

    const links = dataService.getAll("trilhaCompetencias")
      .filter(link => link.trilha_id === trailId)
      .sort(byOrder);

    const competencies = links.map(link => {
      const competency = dataService.getById("competencias", link.competencia_id);
      const minimumLevel = dataService.getById("niveis", link.nivel_minimo_id);
      const score = this.getCompetencyScore(link.competencia_id);
      return {
        ...link,
        competency,
        minimumLevel,
        score,
        gap: Math.max(0, 100 - score.percentage)
      };
    }).filter(item => item.competency);

    const score = aggregateScores(competencies.map(item => item.score));
    const gaps = [...competencies]
      .filter(item => item.score.percentage < 100)
      .sort((a, b) => {
        const requiredDifference = Number(b.obrigatorio !== false) - Number(a.obrigatorio !== false);
        return requiredDifference || b.gap - a.gap || byOrder(a, b);
      });

    return {
      trail,
      score,
      competencies,
      gaps,
      completed: competencies.filter(item => item.score.percentage >= 100).length,
      total: competencies.length
    };
  }

  getSelectedTrailAnalysis() {
    const selectedTrailId = userDataService.getSelectedTrailId();
    return selectedTrailId ? this.getTrailAnalysis(selectedTrailId) : null;
  }

  getDashboard() {
    const userData = userDataService.getCurrentUserData();
    const categories = dataService.getAll("categorias", { activeOnly: true }).sort(byOrder);
    const competencies = dataService.getAll("competencias", { activeOnly: true });
    const resources = dataService.getAll("recursos", { activeOnly: true });

    return {
      general: this.getGeneralScore(),
      categories: categories.map(category => ({ ...category, score: this.getCategoryScore(category.categoria_id) })),
      selectedTrail: this.getSelectedTrailAnalysis(),
      assessedCompetencies: userData.competencyProgress.filter(item => item.assessmentId).length,
      completedResources: userData.resourceProgress.filter(item => item.status === "concluido").length,
      favorites: userData.favorites.length,
      planningItems: userData.planItems.length,
      totalCompetencies: competencies.length,
      totalResources: resources.length
    };
  }
}

function aggregateScores(scores) {
  const earned = scores.reduce((sum, score) => sum + score.earned, 0);
  const possible = scores.reduce((sum, score) => sum + score.possible, 0);
  return {
    earned,
    possible,
    percentage: possible > 0 ? clamp(Math.round((earned / possible) * 100)) : 0,
    items: scores.length
  };
}

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function byOrder(a, b) {
  return Number(a.ordem || 0) - Number(b.ordem || 0);
}

export const businessEngine = new BusinessEngine();

import { dataService } from "./data-service.js";

/**
 * Interface única para configurações administrativas publicadas nos CSVs.
 * Evita que as telas precisem conhecer nomes de datasets ou formatos internos.
 */
class ConfigService {
  initialize() {
    this.autoAssessments = dataService.getAll("autoavaliacao", { activeOnly: true });
    this.resourceTypes = dataService.getAll("tiposRecursos", { activeOnly: true });
    this.statuses = dataService.getAll("status", { activeOnly: true });
    this.complexities = dataService.getAll("complexidades", { activeOnly: true });
    this.weights = dataService.getAll("pesos", { activeOnly: true });
  }

  getAutoAssessments() {
    return [...this.autoAssessments].sort(byOrder);
  }

  getResourceTypes() {
    return [...this.resourceTypes].sort(byOrder);
  }

  getStatuses(context = null) {
    const statuses = context
      ? this.statuses.filter(status => !status.contexto || status.contexto === context || status.contexto === "geral")
      : this.statuses;
    return [...statuses].sort(byOrder);
  }

  getComplexities() {
    return [...this.complexities].sort(byOrder);
  }

  getWeight(key, fallback = 0) {
    const record = this.weights.find(weight => weight.chave === key);
    return record ? Number(record.valor) : fallback;
  }
}

function byOrder(a, b) {
  return Number(a.ordem || 0) - Number(b.ordem || 0);
}

export const configService = new ConfigService();

import { parseCsv, normalizeHeader } from "./csv-parser.js";

/**
 * Camada central de leitura dos dados administrativos.
 * As telas nunca devem usar fetch diretamente; devem consultar este serviço.
 */
class DataService {
  constructor() {
    this.manifest = null;
    this.datasets = new Map();
    this.status = new Map();
    this.initialized = false;
  }

  async initialize() {
    this.reset();
    try {
      this.manifest = await fetchJson("data/manifest.json");
      const entries = Object.entries(this.manifest.datasets ?? {});
      await Promise.all(entries.map(([name, config]) => this.loadDataset(name, config)));
      this.validateUniqueIds();
      this.validateRelationships();
      this.initialized = true;
    } catch (error) {
      console.error("Falha ao inicializar a camada de dados.", error);
      this.status.set("manifest", { state: "error", count: 0, errors: [error.message], warnings: [] });
    }
    return this.getHealthReport();
  }

  reset() {
    this.manifest = null;
    this.datasets.clear();
    this.status.clear();
    this.initialized = false;
  }

  async loadDataset(name, config) {
    const report = { state: "loading", count: 0, errors: [], warnings: [], path: config.path };
    this.status.set(name, report);

    try {
      const response = await fetch(config.path, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status} ao carregar ${config.path}`);
      const { headers, rows } = parseCsv(await response.text());

      const required = (config.requiredColumns ?? []).map(normalizeHeader);
      const missing = required.filter(column => !headers.includes(column));
      if (missing.length) report.errors.push(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`);

      this.datasets.set(name, rows);
      report.count = rows.length;
      report.state = report.errors.length ? "error" : "ready";
    } catch (error) {
      this.datasets.set(name, []);
      report.state = "error";
      report.errors.push(error.message);
    }
  }

  getAll(name, { activeOnly = false } = {}) {
    const rows = structuredClone(this.datasets.get(name) ?? []);
    return activeOnly ? rows.filter(row => row.ativo !== false) : rows;
  }

  getById(name, id) {
    const config = this.manifest?.datasets?.[name];
    if (!config?.idColumn) return null;
    return this.getAll(name).find(row => String(row[config.idColumn]) === String(id)) ?? null;
  }

  getHierarchy() {
    const categorias = sortByOrder(this.getAll("categorias", { activeOnly: true }));
    const dominios = sortByOrder(this.getAll("dominios", { activeOnly: true }));
    const competencias = sortByOrder(this.getAll("competencias", { activeOnly: true }));
    const niveis = sortByOrder(this.getAll("niveis", { activeOnly: true }));
    const recursos = sortByOrder(this.getAll("recursos", { activeOnly: true }));

    return categorias.map(categoria => ({
      ...categoria,
      dominios: dominios
        .filter(dominio => dominio.categoria_id === categoria.categoria_id)
        .map(dominio => ({
          ...dominio,
          competencias: competencias
            .filter(competencia => competencia.dominio_id === dominio.dominio_id)
            .map(competencia => ({
              ...competencia,
              niveis: niveis
                .filter(nivel => nivel.competencia_id === competencia.competencia_id)
                .map(nivel => ({
                  ...nivel,
                  recursos: recursos.filter(recurso => recurso.nivel_id === nivel.nivel_id)
                }))
            }))
        }))
    }));
  }

  getHealthReport() {
    return {
      initialized: this.initialized,
      schemaVersion: this.manifest?.schemaVersion ?? null,
      dataVersion: this.manifest?.dataVersion ?? null,
      datasets: Object.fromEntries(this.status)
    };
  }

  validateUniqueIds() {
    for (const [name, config] of Object.entries(this.manifest?.datasets ?? {})) {
      if (!config.idColumn) continue;
      const values = this.getAll(name).map(row => row[config.idColumn]).filter(Boolean);
      const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
      if (duplicates.length) {
        const report = this.status.get(name);
        report.errors.push(`IDs duplicados: ${[...new Set(duplicates)].join(", ")}.`);
        report.state = "error";
      }
    }
  }

  validateRelationships() {
    const rules = [
      ["dominios", "categoria_id", "categorias", "categoria_id"],
      ["competencias", "dominio_id", "dominios", "dominio_id"],
      ["niveis", "competencia_id", "competencias", "competencia_id"],
      ["recursos", "nivel_id", "niveis", "nivel_id"],
      ["trilhaCompetencias", "trilha_id", "trilhas", "trilha_id"],
      ["trilhaCompetencias", "competencia_id", "competencias", "competencia_id"]
    ];

    for (const [childName, childColumn, parentName, parentColumn] of rules) {
      const validParents = new Set(this.getAll(parentName).map(row => row[parentColumn]));
      const invalidValues = this.getAll(childName)
        .map(row => row[childColumn])
        .filter(value => value && !validParents.has(value));
      if (invalidValues.length) {
        const report = this.status.get(childName);
        report.warnings.push(`Referências inexistentes em ${childColumn}: ${[...new Set(invalidValues)].join(", ")}.`);
      }
    }
  }
}

function sortByOrder(rows) {
  return [...rows].sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0) || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Não foi possível carregar ${path} (HTTP ${response.status}).`);
  return response.json();
}

export const dataService = new DataService();

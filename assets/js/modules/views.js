import { currentUser } from "../core/auth.js";
import { eventBus } from "../core/event-bus.js";
import { stateManager } from "../core/state-manager.js";
import { ui, escapeHtml, escapeAttribute } from "../components/ui.js";
import { exportTechnicalBackup, importTechnicalBackup } from "../services/backup-service.js";
import { configService } from "../services/config-service.js";
import { dataService } from "../services/data-service.js";
import { userDataService } from "../services/user-data-service.js";
import { businessEngine } from "../business/business-engine.js";

export function renderRoute(route, container) {
  const renderers = {
    mapa: renderMap,
    catalogo: renderCatalog,
    trilhas: renderTrails,
    planejamento: renderPlanning,
    evolucao: renderEvolution,
    perfil: renderProfile,
    administracao: renderAdministration
  };

  container.innerHTML = renderers[route]?.() ?? ui.empty("Tela não encontrada.");
  bindRouteActions(route, container);
}

function bindRouteActions(route, container) {
  if (route === "perfil") bindProfileActions(container);
  if (route === "catalogo") bindCatalogActions(container);
  if (route === "trilhas") bindTrailActions(container);
  if (route === "planejamento") bindPlanningActions(container);
}

function renderMap() {
  const dashboard = businessEngine.getDashboard();

  return `
    <div class="metric-grid">
      ${ui.metric("Nível geral", `${dashboard.general.percentage}%`, `${dashboard.assessedCompetencies} de ${dashboard.totalCompetencies} competências avaliadas`)}
      ${ui.metric("Recursos concluídos", String(dashboard.completedResources), `${dashboard.totalResources} recursos publicados`)}
      ${ui.metric("No planejamento", String(dashboard.planningItems), "Competências selecionadas")}
      ${ui.metric("Favoritos", String(dashboard.favorites), "Competências salvas")}
    </div>
    <div class="section-grid">
      ${ui.card(`
        <div class="section-heading"><div><p class="eyebrow">VISÃO GERAL</p><h3>Mapa macro</h3></div></div>
        ${dashboard.categories.length ? dashboard.categories.map(category => categoryBar(category, category.score.percentage)).join("") : '<div class="empty-state">Nenhuma categoria publicada.</div>'}
      `)}
      ${ui.card(`
        <div class="section-heading"><div><p class="eyebrow">COMECE POR AQUI</p><h3>Primeiros passos</h3></div></div>
        <p class="muted">Abra uma competência no Catálogo, informe sua autoavaliação e adicione o que deseja estudar ao Planejamento.</p>
        <div class="quick-actions">
          <a class="button button-primary" href="#/catalogo">Avaliar competências</a>
          <a class="button button-secondary" href="#/planejamento">Abrir planejamento</a>
        </div>
      `)}
    </div>`;
}
function renderCatalog() {
  const filters = stateManager.get("catalogFilters");
  const categories = dataService.getAll("categorias", { activeOnly: true });
  const domains = dataService.getAll("dominios", { activeOnly: true });
  const complexities = configService.getComplexities();
  const hierarchy = filterHierarchy(dataService.getHierarchy(), filters);

  return `
    ${ui.card(`
      <div class="catalog-toolbar">
        <label class="search-field">
          <span>Buscar no catálogo</span>
          <input id="catalog-search" type="search" value="${escapeAttribute(filters.search)}" placeholder="Competência, domínio ou recurso" />
        </label>
        ${selectField("Categoria", "catalog-category-filter", categories, "categoria_id", filters.categoryId)}
        ${selectField("Domínio", "catalog-domain-filter", domains, "dominio_id", filters.domainId)}
        ${selectField("Complexidade", "catalog-complexity-filter", complexities, "complexidade_id", filters.complexityId)}
        <button id="clear-catalog-filters" class="button button-secondary" type="button">Limpar</button>
      </div>
    `, "catalog-filter-card")}

    <div id="catalog-results" class="stack catalog-results">
      ${renderCatalogResults(hierarchy)}
    </div>`;
}

function renderCatalogResults(hierarchy) {
  if (!hierarchy.length) return ui.empty("Nenhum resultado encontrado com os filtros atuais.");

  return hierarchy.map(category => `
    <article class="card stack">
      <div class="section-heading">
        <div><p class="eyebrow">CATEGORIA</p><h3>${escapeHtml(category.nome)}</h3><p class="muted">${escapeHtml(category.descricao || "")}</p></div>
        ${ui.badge(`${category.dominios.length} domínio(s)`, "neutral")}
      </div>
      ${category.dominios.map(domain => `
        <details class="domain-details" open>
          <summary><span><strong>${escapeHtml(domain.nome)}</strong><small>${escapeHtml(domain.descricao || "")}</small></span><span>${domain.competencias.length} competências</span></summary>
          <div class="stack catalog-indent">
            ${domain.competencias.map(competency => `
              <div class="catalog-row">
                <div>
                  <strong>${escapeHtml(competency.nome)}</strong>
                  <p class="muted">${competency.niveis.length} níveis · ${countResources(competency)} recursos</p>
                </div>
                <button class="button button-secondary competency-details-button" type="button" data-competency-id="${escapeAttribute(competency.competencia_id)}">Detalhes</button>
              </div>`).join("") || '<p class="muted">Nenhuma competência publicada.</p>'}
          </div>
        </details>`).join("") || '<p class="muted">Nenhum domínio publicado.</p>'}
    </article>`).join("");
}

function bindCatalogActions(container) {
  container.querySelectorAll(".competency-details-button").forEach(button => {
    button.addEventListener("click", () => {
      stateManager.set("selectedCompetencyId", button.dataset.competencyId);
      eventBus.emit("competency:selected", { competencyId: button.dataset.competencyId });
      openCompetencyDetails(button.dataset.competencyId);
    });
  });

  const applyFilters = () => {
    stateManager.patch("catalogFilters", {
      search: container.querySelector("#catalog-search")?.value ?? "",
      categoryId: container.querySelector("#catalog-category-filter")?.value ?? "",
      domainId: container.querySelector("#catalog-domain-filter")?.value ?? "",
      complexityId: container.querySelector("#catalog-complexity-filter")?.value ?? ""
    });
    const results = container.querySelector("#catalog-results");
    results.innerHTML = renderCatalogResults(filterHierarchy(dataService.getHierarchy(), stateManager.get("catalogFilters")));
    results.querySelectorAll(".competency-details-button").forEach(button => {
      button.addEventListener("click", () => openCompetencyDetails(button.dataset.competencyId));
    });
  };

  container.querySelector("#catalog-search")?.addEventListener("input", applyFilters);
  ["catalog-category-filter", "catalog-domain-filter", "catalog-complexity-filter"].forEach(id => {
    container.querySelector(`#${id}`)?.addEventListener("change", applyFilters);
  });
  container.querySelector("#clear-catalog-filters")?.addEventListener("click", () => {
    stateManager.set("catalogFilters", { search: "", categoryId: "", domainId: "", complexityId: "" });
    renderRoute("catalogo", container);
  });
}

function openCompetencyDetails(competencyId) {
  const competency = dataService.getById("competencias", competencyId);
  if (!competency) return;

  const domain = dataService.getById("dominios", competency.dominio_id);
  const category = domain ? dataService.getById("categorias", domain.categoria_id) : null;
  const complexity = dataService.getById("complexidades", competency.complexidade_id);
  const levels = dataService.getAll("niveis", { activeOnly: true })
    .filter(level => level.competencia_id === competencyId)
    .sort(byOrder);
  const resources = dataService.getAll("recursos", { activeOnly: true });
  const resourceTypes = new Map(configService.getResourceTypes().map(item => [item.tipo_recurso_id, item.nome]));
  const assessments = businessEngine.getAssessmentScale();
  const score = businessEngine.getCompetencyScore(competencyId);
  const favorite = userDataService.isFavorite(competencyId);
  const plannedItem = userDataService.getPlanningItems().find(item => item.competencyId === competencyId);

  document.querySelector("#competency-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "competency-dialog";
  dialog.className = "competency-dialog";
  dialog.innerHTML = `
    <article class="competency-dialog-card stack">
      <header class="competency-dialog-header">
        <div>
          <p class="eyebrow">${escapeHtml([category?.nome, domain?.nome].filter(Boolean).join(" · "))}</p>
          <h2>${escapeHtml(competency.nome)}</h2>
          <p class="muted">${escapeHtml(competency.descricao || "")}</p>
          <div class="inline-badges">
            ${complexity ? ui.badge(complexity.nome, "neutral") : ""}
            ${competency.tempo_estimado_horas ? ui.badge(`${competency.tempo_estimado_horas}h estimadas`, "neutral") : ""}
          </div>
        </div>
        <button class="icon-button" type="button" data-close-dialog aria-label="Fechar detalhes">×</button>
      </header>

      <section class="competency-actions-panel">
        <div>
          <span class="muted">Progresso atual</span>
          <strong class="metric-value compact-value">${score.percentage}%</strong>
          ${ui.progress(score.percentage, `${competency.nome}: ${score.percentage}%`)}
        </div>
        <label class="assessment-field">
          <span>Minha autoavaliação</span>
          <select id="competency-assessment">
            ${assessments.map(item => `<option value="${escapeAttribute(item.autoavaliacao_id)}" ${item.autoavaliacao_id === score.assessmentId ? "selected" : ""}>${escapeHtml(item.nome)}</option>`).join("")}
          </select>
        </label>
        <button id="favorite-competency" class="button button-secondary" type="button">${favorite ? "★ Remover favorito" : "☆ Favoritar"}</button>
        <label class="assessment-field">
          <span>Planejamento</span>
          <select id="competency-planning-status">
            <option value="">Não adicionar</option>
            ${planningOptions(plannedItem?.status ?? "")}
          </select>
        </label>
      </section>

      <section class="stack">
        <div><h3>Níveis da competência</h3><p class="muted">Concluir recursos soma evidências à nota, sem alterar sua autoavaliação.</p></div>
        ${levels.length ? levels.map(level => {
          const levelResources = resources.filter(resource => resource.nivel_id === level.nivel_id).sort(byOrder);
          return `
            <details class="level-details" open>
              <summary><span><strong>${escapeHtml(level.nome)}</strong><small>${escapeHtml(level.descricao || "")}</small></span>${ui.badge(`${levelResources.length} recurso(s)`, "ready")}</summary>
              <div class="resource-list">
                ${levelResources.length ? levelResources.map(resource => {
                  const resourceProgress = userDataService.getResourceProgress(resource.recurso_id);
                  return `
                  <article class="resource-card">
                    <div>
                      <span class="resource-type">${escapeHtml(resourceTypes.get(resource.tipo_recurso_id) || "Recurso")}</span>
                      <h4>${escapeHtml(resource.nome)}</h4>
                      <p class="muted">${escapeHtml(resource.descricao || "")}</p>
                    </div>
                    <div class="resource-actions">
                      <select class="resource-status-select" data-resource-id="${escapeAttribute(resource.recurso_id)}" aria-label="Status de ${escapeAttribute(resource.nome)}">
                        <option value="" ${!resourceProgress?.status ? "selected" : ""}>Sem status</option>
                        <option value="interesse" ${resourceProgress?.status === "interesse" ? "selected" : ""}>Tenho interesse</option>
                        <option value="estudando" ${resourceProgress?.status === "estudando" ? "selected" : ""}>Estou estudando</option>
                        <option value="concluido" ${resourceProgress?.status === "concluido" ? "selected" : ""}>Concluído</option>
                      </select>
                      ${resource.url_principal ? `<a class="button button-secondary" href="${escapeAttribute(resource.url_principal)}" target="_blank" rel="noopener noreferrer">Abrir recurso</a>` : ""}
                    </div>
                  </article>`;
                }).join("") : '<div class="empty-state compact">Nenhum recurso publicado para este nível.</div>'}
              </div>
            </details>`;
        }).join("") : '<div class="empty-state">Nenhum nível publicado.</div>'}
      </section>
      <p id="competency-save-message" class="form-message" role="status"></p>
    </article>`;

  document.body.appendChild(dialog);
  const message = dialog.querySelector("#competency-save-message");
  const refreshScore = () => {
    const updated = businessEngine.getCompetencyScore(competencyId);
    message.textContent = `Salvo. Progresso atualizado para ${updated.percentage}%.`;
  };

  dialog.querySelector("#competency-assessment")?.addEventListener("change", event => {
    userDataService.setCompetencyAssessment(competencyId, event.target.value);
    refreshScore();
  });
  dialog.querySelector("#favorite-competency")?.addEventListener("click", event => {
    userDataService.toggleFavorite(competencyId);
    event.currentTarget.textContent = userDataService.isFavorite(competencyId) ? "★ Remover favorito" : "☆ Favoritar";
    message.textContent = "Favoritos atualizados.";
  });
  dialog.querySelector("#competency-planning-status")?.addEventListener("change", event => {
    if (event.target.value) userDataService.setPlanningStatus(competencyId, event.target.value);
    else userDataService.removeFromPlanning(competencyId);
    message.textContent = "Planejamento atualizado.";
  });
  dialog.querySelectorAll(".resource-status-select").forEach(select => {
    select.addEventListener("change", event => {
      userDataService.setResourceStatus(event.currentTarget.dataset.resourceId, event.currentTarget.value);
      refreshScore();
    });
  });
  dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}
function renderTrails() {
  const trails = dataService.getAll("trilhas", { activeOnly: true }).sort(byOrder);
  const links = dataService.getAll("trilhaCompetencias");
  if (!trails.length) return ui.empty("Nenhuma trilha oficial publicada.");

  return `<div class="trail-grid">${trails.map(trail => {
    const linkedCompetencies = links.filter(link => link.trilha_id === trail.trilha_id);
    return ui.card(`
      <p class="eyebrow">TRILHA OFICIAL</p>
      <h3>${escapeHtml(trail.nome)}</h3>
      <p class="muted">${escapeHtml(trail.descricao || "")}</p>
      <div class="trail-card-footer"><span>${linkedCompetencies.length} competências</span><button class="button button-secondary trail-details-button" data-trail-id="${escapeAttribute(trail.trilha_id)}">Ver trilha</button></div>
    `, "trail-card");
  }).join("")}</div>`;
}

function bindTrailActions(container) {
  container.querySelectorAll(".trail-details-button").forEach(button => {
    button.addEventListener("click", () => openTrailDetails(button.dataset.trailId));
  });
}

function openTrailDetails(trailId) {
  const trail = dataService.getById("trilhas", trailId);
  const links = dataService.getAll("trilhaCompetencias").filter(link => link.trilha_id === trailId).sort(byOrder);
  if (!trail) return;

  document.querySelector("#trail-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "trail-dialog";
  dialog.className = "competency-dialog";
  dialog.innerHTML = `
    <article class="competency-dialog-card stack">
      <header class="competency-dialog-header">
        <div><p class="eyebrow">TRILHA OFICIAL</p><h2>${escapeHtml(trail.nome)}</h2><p class="muted">${escapeHtml(trail.descricao || "")}</p></div>
        <button class="icon-button" type="button" data-close-dialog aria-label="Fechar trilha">×</button>
      </header>
      <section class="stack">
        ${links.map(link => {
          const competency = dataService.getById("competencias", link.competencia_id);
          const minimumLevel = dataService.getById("niveis", link.nivel_minimo_id);
          return `<div class="catalog-row"><div><strong>${escapeHtml(competency?.nome || link.competencia_id)}</strong><p class="muted">Nível mínimo: ${escapeHtml(minimumLevel?.nome || "Não informado")}</p></div>${ui.badge(link.obrigatorio === false ? "Opcional" : "Obrigatória", link.obrigatorio === false ? "neutral" : "ready")}</div>`;
        }).join("") || '<div class="empty-state">Nenhuma competência vinculada.</div>'}
      </section>
    </article>`;
  document.body.appendChild(dialog);
  dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function renderPlanning() {
  const columns = [
    ["interesse", "Tenho interesse"],
    ["vou_estudar", "Vou estudar"],
    ["estudando", "Estudando"],
    ["concluido", "Concluído"]
  ];
  const items = userDataService.getPlanningItems();

  return `
    <div class="section-heading">
      <div><p class="eyebrow">PLANEJAMENTO INDIVIDUAL</p><h3>Meu plano de desenvolvimento</h3><p class="muted">Altere o status pelo seletor de cada card.</p></div>
    </div>
    <div class="planning-board">
      ${columns.map(([status, label]) => {
        const columnItems = items.filter(item => item.status === status);
        return `<section class="planning-column">
          <header><strong>${label}</strong>${ui.badge(String(columnItems.length), "neutral")}</header>
          <div class="planning-column-content">
            ${columnItems.map(item => planningCard(item, status)).join("") || '<div class="empty-state compact">Nenhum item.</div>'}
          </div>
        </section>`;
      }).join("")}
    </div>`;
}

function planningCard(item) {
  const competency = dataService.getById("competencias", item.competencyId);
  if (!competency) return "";
  const score = businessEngine.getCompetencyScore(item.competencyId);
  return `<article class="planning-card" data-competency-id="${escapeAttribute(item.competencyId)}">
    <div><strong>${escapeHtml(competency.nome)}</strong><p class="muted">${score.percentage}% de progresso</p></div>
    ${ui.progress(score.percentage, `${competency.nome}: ${score.percentage}%`)}
    <select class="planning-status-select" data-competency-id="${escapeAttribute(item.competencyId)}">
      ${planningOptions(item.status)}
      <option value="remover">Remover do planejamento</option>
    </select>
    <button class="button button-secondary planning-open-details" data-competency-id="${escapeAttribute(item.competencyId)}">Abrir detalhes</button>
  </article>`;
}

function bindPlanningActions(container) {
  container.querySelectorAll(".planning-status-select").forEach(select => {
    select.addEventListener("change", event => {
      const competencyId = event.currentTarget.dataset.competencyId;
      if (event.currentTarget.value === "remover") userDataService.removeFromPlanning(competencyId);
      else userDataService.setPlanningStatus(competencyId, event.currentTarget.value);
      renderRoute("planejamento", container);
    });
  });
  container.querySelectorAll(".planning-open-details").forEach(button => {
    button.addEventListener("click", () => openCompetencyDetails(button.dataset.competencyId));
  });
}
function renderEvolution() {
  const dashboard = businessEngine.getDashboard();
  const evaluated = dashboard.assessedCompetencies;
  return `<div class="metric-grid">
    ${ui.metric("Competências avaliadas", String(evaluated), `${dashboard.totalCompetencies} disponíveis`)}
    ${ui.metric("Recursos concluídos", String(dashboard.completedResources))}
    ${ui.metric("Favoritos", String(dashboard.favorites))}
    ${ui.metric("Planos ativos", String(dashboard.planningItems))}
  </div>${ui.card(`<h3>Retrato atual</h3><p class="muted">Nesta versão, a tela mostra o estado atual. O histórico temporal será incluído quando decidirmos quais eventos devem ser preservados.</p>${ui.progress(dashboard.general.percentage, `Nível geral: ${dashboard.general.percentage}%`)}`, "evolution-card")}`;
}
function renderAdministration() {
  const report = dataService.getHealthReport();
  const datasets = Object.entries(report.datasets ?? {});
  const errors = datasets.reduce((sum, [, item]) => sum + item.errors.length, 0);
  const warnings = datasets.reduce((sum, [, item]) => sum + item.warnings.length, 0);

  return `
    <div class="metric-grid">${ui.metric("Versão do esquema", report.schemaVersion ?? "-")}${ui.metric("Versão dos dados", report.dataVersion ?? "-")}${ui.metric("Erros", String(errors))}${ui.metric("Avisos", String(warnings))}</div>
    ${ui.card(`
      <div><h3>Saúde da publicação de dados</h3><p class="muted">Cada linha representa um CSV declarado em data/manifest.json.</p></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Dataset</th><th>Estado</th><th>Registros</th><th>Arquivo</th><th>Mensagens</th></tr></thead><tbody>
        ${datasets.map(([name, item]) => `<tr><td><strong>${escapeHtml(name)}</strong></td><td>${ui.badge(item.state, item.state)}</td><td>${item.count}</td><td><code>${escapeHtml(item.path || "-")}</code></td><td>${[...item.errors, ...item.warnings].map(escapeHtml).join("<br>") || "OK"}</td></tr>`).join("")}
      </tbody></table></div>
    `, "stack")}`;
}

function renderProfile() {
  const user = currentUser();
  return ui.card(`
    <div><p class="eyebrow">PERFIL LOCAL</p><h3>${escapeHtml(user?.name ?? "Perfil")}</h3><p class="muted">Permissão: ${escapeHtml(user?.role ?? "USER")}</p></div>
    <div class="data-actions"><button id="export-backup" class="button button-primary">Exportar backup técnico</button><label class="button button-secondary" for="import-backup">Importar e substituir dados</label><input id="import-backup" class="hidden" type="file" accept="application/json,.json" /></div>
    <p class="muted">A importação é substitutiva: um backup completo por vez.</p><p id="backup-message" class="form-message"></p>
  `, "stack");
}

function bindProfileActions(container) {
  container.querySelector("#export-backup")?.addEventListener("click", exportTechnicalBackup);
  container.querySelector("#import-backup")?.addEventListener("change", async event => {
    const message = container.querySelector("#backup-message");
    try {
      const [file] = event.target.files;
      if (!file) return;
      await importTechnicalBackup(file);
      message.textContent = "Backup importado. A página será recarregada.";
      window.location.reload();
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

function filterHierarchy(hierarchy, filters) {
  const term = filters.search.trim().toLocaleLowerCase("pt-BR");
  return hierarchy.map(category => ({
    ...category,
    dominios: category.dominios.map(domain => ({
      ...domain,
      competencias: domain.competencias.filter(competency => {
        const resourcesText = competency.niveis.flatMap(level => level.recursos).map(resource => resource.nome).join(" ");
        const searchableText = `${category.nome} ${domain.nome} ${competency.nome} ${competency.descricao || ""} ${resourcesText}`.toLocaleLowerCase("pt-BR");
        return (!filters.categoryId || category.categoria_id === filters.categoryId)
          && (!filters.domainId || domain.dominio_id === filters.domainId)
          && (!filters.complexityId || competency.complexidade_id === filters.complexityId)
          && (!term || searchableText.includes(term));
      })
    })).filter(domain => domain.competencias.length)
  })).filter(category => category.dominios.length);
}

function selectField(label, id, options, valueColumn, selectedValue) {
  return `<label class="filter-field"><span>${escapeHtml(label)}</span><select id="${escapeAttribute(id)}"><option value="">Todos</option>${options.map(option => `<option value="${escapeAttribute(option[valueColumn])}" ${option[valueColumn] === selectedValue ? "selected" : ""}>${escapeHtml(option.nome)}</option>`).join("")}</select></label>`;
}

function countResources(competency) {
  return competency.niveis.reduce((sum, level) => sum + level.recursos.length, 0);
}

function categoryBar(category, percentage = 0) {
  return `<div class="category-progress"><div><strong>${escapeHtml(category.nome)}</strong><span>${percentage}%</span></div>${ui.progress(percentage, `${category.nome}: ${percentage}%`)}</div>`;
}

function planningOptions(selected = "") {
  const options = [["interesse", "Tenho interesse"], ["vou_estudar", "Vou estudar"], ["estudando", "Estudando"], ["concluido", "Concluído"]];
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function byOrder(a, b) {
  return Number(a.ordem || 0) - Number(b.ordem || 0);
}

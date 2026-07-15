import { currentUser } from "../core/auth.js";
import { eventBus } from "../core/event-bus.js";
import { stateManager } from "../core/state-manager.js";
import { ui, escapeHtml, escapeAttribute } from "../components/ui.js";
import { exportTechnicalBackup, importTechnicalBackup } from "../services/backup-service.js";
import { configService } from "../services/config-service.js";
import { dataService } from "../services/data-service.js";
import { userDataService } from "../services/user-data-service.js?v=2.6.0";
import { businessEngine } from "../business/business-engine.js?v=2.6.0";

export function renderRoute(route, container) {
  const renderers = { mapa: renderMap, catalogo: renderCatalog, trilhas: renderTrails, planejamento: renderPlanning, evolucao: renderEvolution, perfil: renderProfile, administracao: renderAdministration };
  container.innerHTML = renderers[route]?.() ?? ui.empty("Tela não encontrada.");
  bindRouteActions(route, container);
}

function bindRouteActions(route, container) {
  if (route === "mapa") bindMapActions(container);
  if (route === "catalogo") bindCatalogActions(container);
  if (route === "trilhas") bindTrailActions(container);
  if (route === "planejamento") bindPlanningActions(container);
  if (route === "perfil") bindProfileActions(container);
}

function renderMap() {
  const dashboard = businessEngine.getDashboard() ?? {};
  const operational = businessEngine.getOperationalMap() ?? {};
  const categories = Array.isArray(dashboard.categories) ? dashboard.categories : [];
  const developingLevels = Array.isArray(operational.developingLevels) ? operational.developingLevels : [];
  const activeResources = Array.isArray(operational.activeResources) ? operational.activeResources : [];

  return `
    <section class="map-summary-strip" aria-label="Resumo do momento">
      ${mapSummaryMetric("Competências em desenvolvimento", developingLevels.length, "Níveis em estudo ou prontos para iniciar", "blue")}
      ${mapSummaryMetric("Cursos e recursos em andamento", activeResources.length, "Materiais escolhidos para estudo", "green")}
      ${mapSummaryMetric("Recursos concluídos", safeNumber(dashboard.completedResources), "Cursos, certificados e outros materiais", "purple")}
      ${mapSummaryMetric("Progresso do plano", `${safeNumber(operational.planProgress)}%`, `${safeNumber(operational.planCompleted)} de ${safeNumber(operational.planTotal)} níveis concluídos`, "orange")}
    </section>

    ${ui.card(`
      <div class="section-heading map-section-heading">
        <div><p class="eyebrow">FOCO ATUAL</p><h3>Competências em desenvolvimento</h3><p class="muted">Use esta área para decidir o que estudar agora.</p></div>
        <a class="text-link" href="#/planejamento">Abrir planejamento</a>
      </div>
      <div class="development-grid">
        ${developingLevels.map(item => developmentCard(item)).join("") || '<div class="empty-state compact">Nenhum nível em desenvolvimento. Adicione um nível ao planejamento pelo Catálogo ou por uma Trilha.</div>'}
      </div>`, "map-section map-development-section")}

    ${ui.card(`
      <div class="section-heading map-section-heading">
        <div><p class="eyebrow">ESTUDOS ATIVOS</p><h3>Cursos e recursos em andamento</h3><p class="muted">Materiais que você decidiu usar no desenvolvimento das competências.</p></div>
      </div>
      <div class="active-resource-list">
        ${activeResources.map(activeResourceCard).join("") || '<div class="empty-state compact">Nenhum curso ou recurso em andamento.</div>'}
      </div>`, "map-section map-resources-section")}

    ${ui.card(`
      <div class="section-heading map-section-heading">
        <div><p class="eyebrow">HEATMAP OPERACIONAL</p><h3>Conhecimento por categoria</h3><p class="muted">Cinza indica ausência de avaliação. Tons mais intensos representam maior domínio consolidado.</p></div>
      </div>
      <div class="category-heatmap operational-heatmap">
        ${categories.map(categoryHeatmapTile).join("") || '<div class="empty-state compact">Nenhuma categoria publicada.</div>'}
      </div>`, "map-section heatmap-section")}

    ${ui.card(`
      <div class="section-heading map-section-heading"><div><p class="eyebrow">PRÓXIMOS PASSOS</p><h3>Ações objetivas</h3></div></div>
      <div class="next-action-list">
        ${buildNextActions(developingLevels, activeResources).join("") || '<div class="empty-state compact">Nenhuma ação pendente identificada.</div>'}
      </div>`, "map-section next-steps-section")}`;
}

function bindMapActions(container) {
  container.querySelectorAll(".competency-details-button").forEach(button => {
    if (!button.dataset.competencyId) return;
    button.addEventListener("click", () => openCompetencyDetails(button.dataset.competencyId));
  });
}

function renderCatalog() {
  const filters = stateManager.get("catalogFilters");
  const categories = dataService.getAll("categorias", { activeOnly: true });
  const domains = dataService.getAll("dominios", { activeOnly: true });
  const complexities = configService.getComplexities();
  const hierarchy = filterHierarchy(dataService.getHierarchy(), filters);
  return `${ui.card(`<div class="catalog-toolbar"><label class="search-field"><span>Buscar no catálogo</span><input id="catalog-search" type="search" value="${escapeAttribute(filters.search)}" placeholder="Competência, domínio ou recurso" /></label>${selectField("Categoria", "catalog-category-filter", categories, "categoria_id", filters.categoryId)}${selectField("Domínio", "catalog-domain-filter", domains, "dominio_id", filters.domainId)}${selectField("Complexidade", "catalog-complexity-filter", complexities, "complexidade_id", filters.complexityId)}<button id="clear-catalog-filters" class="button button-secondary" type="button">Limpar</button></div>`, "catalog-filter-card")}<div id="catalog-results" class="stack catalog-results">${renderCatalogResults(hierarchy)}</div>`;
}

function renderCatalogResults(hierarchy) {
  if (!hierarchy.length) return ui.empty("Nenhum resultado encontrado com os filtros atuais.");

  return hierarchy.map(category => `
    <article class="card catalog-category-card">
      <header class="section-heading catalog-category-header">
        <div>
          <p class="eyebrow">CATEGORIA</p>
          <h3>${escapeHtml(category.nome)}</h3>
          <p class="muted">${escapeHtml(category.descricao || "")}</p>
        </div>
        ${ui.badge(`${category.dominios.length} domínio(s)`, "neutral")}
      </header>

      <div class="catalog-domain-list">
        ${category.dominios.map(domain => `
          <details class="domain-details">
            <summary>
              <span class="domain-summary-copy">
                <strong>${escapeHtml(domain.nome)}</strong>
                <small>${escapeHtml(domain.descricao || "")}</small>
              </span>
              <span class="domain-summary-meta">
                <span>${domain.competencias.length} competência(s)</span>
                <span class="disclosure-icon" aria-hidden="true">⌄</span>
              </span>
            </summary>

            <div class="catalog-competency-list">
              ${domain.competencias.map(comp => `
                <article class="catalog-competency catalog-competency-clean">
                  <div class="catalog-competency-main">
                    <div class="catalog-competency-copy">
                      <button class="catalog-competency-title competency-details-button" type="button" data-competency-id="${escapeAttribute(comp.competencia_id)}">${escapeHtml(comp.nome)}</button>
                      <p class="muted">${escapeHtml(comp.descricao || "")}</p>
                      <div class="catalog-level-chips" aria-label="Níveis da competência">
                        ${comp.niveis.map(level => `<span>${escapeHtml(level.nome)}</span>`).join("") || '<span>Nenhum nível publicado</span>'}
                      </div>
                    </div>
                    <button class="button button-secondary competency-details-button" type="button" data-competency-id="${escapeAttribute(comp.competencia_id)}">Detalhes</button>
                  </div>
                </article>`).join("") || '<p class="muted">Nenhuma competência publicada.</p>'}
            </div>
          </details>`).join("")}
      </div>
    </article>`).join("");
}

function bindCatalogActions(container) {
  const bindDetails = root => root.querySelectorAll(".competency-details-button").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    stateManager.set("selectedCompetencyId", button.dataset.competencyId);
    eventBus.emit("competency:selected", { competencyId: button.dataset.competencyId });
    openCompetencyDetails(button.dataset.competencyId);
  }));
  bindDetails(container);

  const applyFilters = () => {
    stateManager.patch("catalogFilters", {
      search: container.querySelector("#catalog-search")?.value ?? "",
      categoryId: container.querySelector("#catalog-category-filter")?.value ?? "",
      domainId: container.querySelector("#catalog-domain-filter")?.value ?? "",
      complexityId: container.querySelector("#catalog-complexity-filter")?.value ?? ""
    });
    const results = container.querySelector("#catalog-results");
    results.innerHTML = renderCatalogResults(filterHierarchy(dataService.getHierarchy(), stateManager.get("catalogFilters")));
    bindDetails(results);
  };

  container.querySelector("#catalog-search")?.addEventListener("input", applyFilters);
  ["catalog-category-filter", "catalog-domain-filter", "catalog-complexity-filter"].forEach(id => container.querySelector(`#${id}`)?.addEventListener("change", applyFilters));
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
  const levels = businessEngine.getCompetencyLevels(competencyId);
  const resources = dataService.getAll("recursos", { activeOnly: true });
  const resourceTypes = new Map(configService.getResourceTypes().map(item => [item.tipo_recurso_id, item.nome]));
  const assessments = businessEngine.getAssessmentScale();
  const score = businessEngine.getCompetencyScore(competencyId);
  const favorite = userDataService.isFavorite(competencyId);

  document.querySelector("#competency-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "competency-dialog";
  dialog.className = "competency-dialog";
  dialog.innerHTML = `
    <article class="competency-dialog-card competency-dialog-clean">
      <header class="competency-dialog-header">
        <div>
          <p class="eyebrow">${escapeHtml([category?.nome, domain?.nome].filter(Boolean).join(" · "))}</p>
          <h2>${escapeHtml(competency.nome)}</h2>
          <p class="muted competency-description">${escapeHtml(competency.descricao || "")}</p>
          <div class="inline-badges">${complexity ? ui.badge(complexity.nome, "neutral") : ""}${competency.tempo_estimado_horas ? ui.badge(`${competency.tempo_estimado_horas}h estimadas`, "neutral") : ""}</div>
        </div>
        <button class="icon-button" type="button" data-close-dialog aria-label="Fechar">×</button>
      </header>

      <section class="competency-overview-grid">
        <div class="competency-score-block">
          <span class="muted">Nota consolidada</span>
          <strong class="metric-value compact-value" id="competency-score-value">${score.percentage}%</strong>
          ${ui.progress(score.percentage, `${competency.nome}: ${score.percentage}%`)}
        </div>
        <button id="favorite-competency" class="button button-secondary favorite-button" type="button">${favorite ? "★ Remover favorito" : "☆ Favoritar"}</button>
      </section>

      <section class="competency-level-section">
        <div class="section-heading"><div><h3>Níveis da competência</h3><p class="muted">Avalie cada nível e acompanhe somente os recursos que escolher estudar.</p></div></div>
        <div class="competency-level-list">
          ${levels.map(level => renderLevelDetails(level, resources, resourceTypes, assessments)).join("") || '<div class="empty-state">Nenhum nível publicado.</div>'}
        </div>
      </section>
      <p id="competency-save-message" class="form-message" role="status"></p>
    </article>`;

  document.body.appendChild(dialog);
  const message = dialog.querySelector("#competency-save-message");
  const refresh = text => {
    const updated = businessEngine.getCompetencyScore(competencyId);
    dialog.querySelector("#competency-score-value").textContent = `${updated.percentage}%`;
    message.textContent = text || `Salvo. Nota atual: ${updated.percentage}%.`;
  };

  dialog.querySelector("#favorite-competency")?.addEventListener("click", event => {
    userDataService.toggleFavorite(competencyId);
    event.currentTarget.textContent = userDataService.isFavorite(competencyId) ? "★ Remover favorito" : "☆ Favoritar";
    refresh("Favoritos atualizados.");
  });
  dialog.querySelectorAll(".level-assessment-select").forEach(select => select.addEventListener("change", event => {
    userDataService.setLevelAssessment(event.currentTarget.dataset.levelId, event.currentTarget.value);
    refresh();
  }));
  dialog.querySelectorAll(".level-planning-select").forEach(select => select.addEventListener("change", event => {
    const id = event.currentTarget.dataset.levelId;
    event.currentTarget.value ? userDataService.setLevelPlanningStatus(id, event.currentTarget.value) : userDataService.removeLevelFromPlanning(id);
    refresh("Planejamento do nível atualizado.");
  }));
  dialog.querySelectorAll(".resource-status-select").forEach(select => select.addEventListener("change", event => {
    userDataService.setResourceStatus(event.currentTarget.dataset.resourceId, event.currentTarget.value);
    refresh("Status do recurso atualizado.");
  }));
  dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function renderLevelDetails(level, resources, resourceTypes, assessments) {
  const progress = userDataService.getLevelProgress(level.nivel_id);
  const score = businessEngine.getLevelScore(level.nivel_id);
  const levelResources = resources.filter(resource => resource.nivel_id === level.nivel_id).sort(byOrder);

  return `
    <article class="level-card-clean">
      <header class="level-card-header">
        <div><h4>${escapeHtml(level.nome)}</h4><p class="muted">${escapeHtml(level.descricao || "")}</p></div>
        <strong class="level-score-pill">${score.percentage}%</strong>
      </header>
      <div class="level-controls-clean">
        <label class="assessment-field">
          <span>Minha autoavaliação</span>
          <select class="level-assessment-select" data-level-id="${escapeAttribute(level.nivel_id)}">
            ${assessments.map(item => `<option value="${escapeAttribute(item.autoavaliacao_id)}" ${item.autoavaliacao_id === progress?.assessmentId ? "selected" : ""}>${escapeHtml(item.nome)}</option>`).join("")}
          </select>
        </label>
        <label class="assessment-field">
          <span>Status no planejamento</span>
          <select class="level-planning-select" data-level-id="${escapeAttribute(level.nivel_id)}">
            <option value="">Fora do planejamento</option>
            ${planningOptions(progress?.status || "")}
          </select>
        </label>
      </div>
      <div class="resource-list resource-list-clean">
        ${levelResources.map(resource => renderResourceCard(resource, resourceTypes, competencyIdFromLevel(level))).join("") || '<div class="empty-state compact">Nenhum recurso publicado para este nível.</div>'}
      </div>
    </article>`;
}

function renderResourceCard(resource, resourceTypes, competencyId = "") {
  const progress = userDataService.getResourceProgress(resource.recurso_id);
  return `
    <article class="resource-card resource-card-clean">
      <div class="resource-main-copy">
        <span class="resource-type">${escapeHtml(resourceTypes.get(resource.tipo_recurso_id) || "Recurso")}</span>
        <h4>${escapeHtml(resource.nome)}</h4>
        <p class="muted">${escapeHtml(resource.descricao || "")}</p>
      </div>
      <div class="resource-actions">
        <label class="compact-field">
          <span>Status de acompanhamento</span>
          <select class="resource-status-select" data-resource-id="${escapeAttribute(resource.recurso_id)}">
            <option value="" ${!progress?.status ? "selected" : ""}>Sem status</option>
            <option value="interesse" ${progress?.status === "interesse" ? "selected" : ""}>Tenho interesse</option>
            <option value="vou_estudar" ${progress?.status === "vou_estudar" ? "selected" : ""}>Vou estudar</option>
            <option value="estudando" ${progress?.status === "estudando" ? "selected" : ""}>Estou estudando</option>
            <option value="concluido" ${progress?.status === "concluido" ? "selected" : ""}>Concluído</option>
          </select>
        </label>
        ${resource.url_principal ? `<a class="button button-secondary" href="${escapeAttribute(resource.url_principal)}" target="_blank" rel="noopener noreferrer">Abrir recurso</a>` : ""}
      </div>
    </article>`;
}

function renderTrails() {
  const trails = dataService.getAll("trilhas", { activeOnly: true }).sort(sortTrails);
  const selected = userDataService.getSelectedTrailId();
  const userName = String(currentUser()?.name || "").trim().toLocaleLowerCase("pt-BR");
  const personTrails = trails.filter(trail => {
    if (trailKind(trail) !== "pessoa") return false;
    const destination = String(trail.usuario_destino || "").trim().toLocaleLowerCase("pt-BR");
    return !destination || destination === userName;
  });
  const careerTrails = trails.filter(trail => trailKind(trail) === "carreira");

  return `
    <div class="section-heading trails-heading"><div><p class="eyebrow">TRILHAS</p><h3>Escolha uma referência</h3><p class="muted">Trilhas para pessoas aparecem primeiro; trilhas de carreira apresentam referências profissionais.</p></div></div>
    ${trailGroup("TRILHAS PARA PESSOAS", "Planos direcionados a uma pessoa ou contexto específico.", personTrails, selected, "person")}
    ${trailGroup("TRILHAS DE CARREIRA", "Referências de conhecimento para cargos e caminhos profissionais.", careerTrails, selected, "career")}`;
}

function bindTrailActions(container) { container.querySelectorAll(".trail-details-button").forEach(b => b.addEventListener("click", () => openTrailDetails(b.dataset.trailId))); container.querySelectorAll(".trail-select-button").forEach(b => b.addEventListener("click", () => { userDataService.setSelectedTrail(userDataService.getSelectedTrailId() === b.dataset.trailId ? "" : b.dataset.trailId); renderRoute("trilhas", container); })); }
function openTrailDetails(trailId) {
  const analysis = businessEngine.getTrailAnalysis(trailId);
  if (!analysis) return;
  const selected = userDataService.getSelectedTrailId() === trailId;
  const kind = trailKind(analysis.trail);
  document.querySelector("#trail-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "trail-dialog";
  dialog.className = "competency-dialog";
  dialog.innerHTML = `
    <article class="competency-dialog-card stack">
      <header class="competency-dialog-header"><div><p class="eyebrow">${kind === "pessoa" ? "TRILHA PARA PESSOA" : "TRILHA DE CARREIRA"}</p><h2>${escapeHtml(analysis.trail.nome)}</h2><p class="muted">${escapeHtml(analysis.trail.descricao || "")}</p></div><button class="icon-button" data-close-dialog>×</button></header>
      <section class="trail-dialog-summary"><div><span class="muted">Progresso nos requisitos</span><strong class="metric-value compact-value">${analysis.score.percentage}%</strong>${ui.progress(analysis.score.percentage, `${analysis.trail.nome}: ${analysis.score.percentage}%`)}</div><div class="trail-summary-numbers"><span><strong>${analysis.completed}</strong> atendidos</span><span><strong>${analysis.total}</strong> requisitos</span></div></section>
      <div class="quick-actions"><button id="trail-dialog-select" class="button ${selected ? "button-secondary" : "button-primary"}">${selected ? "Deixar de acompanhar" : "Acompanhar esta trilha"}</button></div>
      <p id="trail-dialog-message" class="form-message"></p>
      <section class="stack">
        ${analysis.requirements.map(item => {
          const target = item.nextRequiredLevel;
          const planning = target ? userDataService.getLevelProgress(target.nivel_id) : null;
          const buttonLabel = item.satisfied ? "Requisito atendido" : planning?.status ? `No planejamento: ${planningStatusLabel(planning.status)}` : `Planejar ${target?.nome || item.minimumLevel.nome}`;
          return `<article class="trail-competency-row"><div><strong>${escapeHtml(item.competency.nome)}</strong><p class="muted">Nível mínimo: ${escapeHtml(item.minimumLevel.nome)}</p></div><div>${item.score.percentage}%${ui.progress(item.score.percentage, item.competency.nome)}</div><div class="trail-card-actions"><button class="button button-secondary trail-open-competency" data-competency-id="${item.competency.competencia_id}">Detalhes</button><button class="button button-secondary trail-plan-level" data-level-id="${escapeAttribute(target?.nivel_id || "")}" ${item.satisfied || planning?.status ? "disabled" : ""}>${escapeHtml(buttonLabel)}</button></div></article>`;
        }).join("")}
      </section>
    </article>`;
  document.body.appendChild(dialog);
  const message = dialog.querySelector("#trail-dialog-message");
  dialog.querySelector("#trail-dialog-select")?.addEventListener("click", event => {
    const next = userDataService.getSelectedTrailId() === trailId ? "" : trailId;
    userDataService.setSelectedTrail(next);
    event.currentTarget.textContent = next ? "Deixar de acompanhar" : "Acompanhar esta trilha";
    message.textContent = next ? "Trilha acompanhada." : "Acompanhamento removido.";
  });
  dialog.querySelectorAll(".trail-plan-level:not([disabled])").forEach(button => button.addEventListener("click", () => {
    userDataService.setLevelPlanningStatus(button.dataset.levelId, "interesse");
    button.textContent = "Adicionado ao planejamento";
    button.disabled = true;
    message.textContent = "Próximo nível necessário adicionado ao planejamento.";
  }));
  dialog.querySelectorAll(".trail-open-competency").forEach(button => button.addEventListener("click", () => openCompetencyDetails(button.dataset.competencyId)));
  dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function renderPlanning() {
  const columns = [["interesse", "Tenho interesse"], ["vou_estudar", "Vou estudar"], ["estudando", "Estudando"], ["concluido", "Concluído"]];
  const items = getUnifiedPlanningItems().sort(sortUnifiedPlanningItems);
  const levelCount = items.filter(item => item.kind === "competency").length;
  const resourceCount = items.filter(item => item.kind === "resource").length;

  return `
    <div class="section-heading planning-heading">
      <div><p class="eyebrow">PLANEJAMENTO INDIVIDUAL</p><h3>Competências e recursos</h3><p class="muted">Acompanhe os níveis escolhidos e os recursos que decidiu estudar.</p></div>
      <div class="planning-summary">${ui.badge(`${levelCount} competência(s)`, "neutral")}${ui.badge(`${resourceCount} recurso(s)`, "neutral")}</div>
    </div>
    <div class="planning-legend"><span><i class="legend-dot competency-dot"></i> Competência</span><span><i class="legend-dot resource-dot"></i> Recurso</span></div>
    <div class="planning-board">
      ${columns.map(([status, label]) => {
        const list = items.filter(item => item.status === status);
        return `<section class="planning-column"><header><strong>${label}</strong>${ui.badge(String(list.length), "neutral")}</header><div class="planning-column-content">${list.map(unifiedPlanningCard).join("") || '<div class="empty-state compact">Nenhum item.</div>'}</div></section>`;
      }).join("")}
    </div>`;
}

function unifiedPlanningCard(item) {
  if (item.kind === "resource") {
    return `
      <article class="planning-card planning-card-resource">
        <span class="planning-kind-label">RECURSO</span>
        <div><strong>${escapeHtml(item.title)}</strong><p class="muted">${escapeHtml(item.subtitle)}</p></div>
        <select class="planning-status-select resource-planning-status" data-resource-id="${escapeAttribute(item.id)}">${planningOptions(item.status)}<option value="remover">Remover</option></select>
        <div class="planning-card-actions">${item.url ? `<a class="button button-secondary" href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">Abrir recurso</a>` : ""}<button class="button button-secondary planning-open-details" data-competency-id="${escapeAttribute(item.competencyId)}" type="button">Abrir competência</button></div>
      </article>`;
  }

  const priority = priorityLabel(item.priority);
  return `
    <article class="planning-card planning-card-competency">
      <span class="planning-kind-label">COMPETÊNCIA</span>
      <div><strong>${escapeHtml(item.title)}</strong><p class="muted">${escapeHtml(item.subtitle)} · ${item.score}%</p></div>
      ${ui.progress(item.score, item.title)}
      <div class="planning-card-meta">${priority ? ui.badge(priority, Number(item.priority) === 3 ? "warning" : "neutral") : ""}${item.targetDate ? `<span>Meta: ${escapeHtml(formatDate(item.targetDate))}</span>` : '<span class="muted">Sem data-meta</span>'}</div>
      ${item.notes ? `<p class="planning-notes">${escapeHtml(item.notes)}</p>` : ""}
      <select class="planning-status-select level-planning-status" data-level-id="${escapeAttribute(item.id)}">${planningOptions(item.status)}<option value="remover">Remover</option></select>
      <div class="planning-card-actions"><button class="button button-secondary planning-edit-details" data-level-id="${escapeAttribute(item.id)}" type="button">Editar plano</button><button class="button button-secondary planning-open-details" data-competency-id="${escapeAttribute(item.competencyId)}" type="button">Abrir competência</button></div>
    </article>`;
}

function bindPlanningActions(container) {
  container.querySelectorAll(".level-planning-status").forEach(select => select.addEventListener("change", event => {
    const id = event.currentTarget.dataset.levelId;
    event.currentTarget.value === "remover" ? userDataService.removeLevelFromPlanning(id) : userDataService.setLevelPlanningStatus(id, event.currentTarget.value);
    renderRoute("planejamento", container);
  }));
  container.querySelectorAll(".resource-planning-status").forEach(select => select.addEventListener("change", event => {
    const id = event.currentTarget.dataset.resourceId;
    userDataService.setResourceStatus(id, event.currentTarget.value === "remover" ? "" : event.currentTarget.value);
    renderRoute("planejamento", container);
  }));
  container.querySelectorAll(".planning-open-details").forEach(button => button.addEventListener("click", () => openCompetencyDetails(button.dataset.competencyId)));
  container.querySelectorAll(".planning-edit-details").forEach(button => button.addEventListener("click", () => openPlanningDetails(button.dataset.levelId, container)));
}

function openPlanningDetails(levelId, container) {
  const level = dataService.getById("niveis", levelId);
  const competency = level ? dataService.getById("competencias", level.competencia_id) : null;
  const progress = userDataService.getLevelProgress(levelId);
  if (!level || !competency || !progress) return;

  document.querySelector("#planning-details-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "planning-details-dialog";
  dialog.className = "competency-dialog planning-details-dialog";
  dialog.innerHTML = `
    <article class="competency-dialog-card stack">
      <header class="competency-dialog-header">
        <div><p class="eyebrow">PLANEJAMENTO</p><h2>${escapeHtml(competency.nome)}</h2><p class="muted">${escapeHtml(level.nome)}</p></div>
        <button class="icon-button" type="button" data-close-dialog>×</button>
      </header>
      <form id="planning-details-form" class="planning-details-form">
        <label><span>Prioridade</span><select name="priority"><option value="0" ${!progress.priority ? "selected" : ""}>Sem prioridade</option><option value="3" ${Number(progress.priority) === 3 ? "selected" : ""}>Alta</option><option value="2" ${Number(progress.priority) === 2 ? "selected" : ""}>Média</option><option value="1" ${Number(progress.priority) === 1 ? "selected" : ""}>Baixa</option></select></label>
        <label><span>Data-meta</span><input name="targetDate" type="date" value="${escapeAttribute(progress.targetDate || "")}" /></label>
        <label class="planning-notes-field"><span>Observações</span><textarea name="notes" rows="5" placeholder="Próximas ações, materiais ou lembretes">${escapeHtml(progress.notes || "")}</textarea></label>
        <div class="planning-dialog-actions"><button class="button button-primary" type="submit">Salvar planejamento</button><button class="button button-secondary" type="button" data-close-dialog>Cancelar</button></div>
      </form>
      <p id="planning-details-message" class="form-message" role="status"></p>
    </article>`;

  document.body.appendChild(dialog);
  dialog.querySelector("#planning-details-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    userDataService.setLevelPlanningDetails(levelId, {
      priority: formData.get("priority"),
      targetDate: formData.get("targetDate"),
      notes: formData.get("notes")
    });
    dialog.querySelector("#planning-details-message").textContent = "Planejamento salvo.";
    renderRoute("planejamento", container);
    window.setTimeout(() => dialog.close(), 300);
  });
  dialog.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function renderEvolution() {
  const data = businessEngine.getEvolutionData();
  const user = currentUser();
  const timeline = data.history.slice(0, 20);
  return `
    <section class="evolution-profile-header">
      <div><p class="eyebrow">EVOLUÇÃO PROFISSIONAL</p><h2>${escapeHtml(user?.name || "Profissional")}</h2><p class="muted">Esta página reúne evidências e marcos registrados no Climb Map.</p></div>
      <button class="button button-secondary" type="button" disabled title="Será habilitado em uma próxima entrega">Gerar visão compartilhável</button>
    </section>
    <section class="evolution-metric-grid">
      ${dashboardMetric("Níveis adquiridos", String(safeNumber(data.completedLevels)), "Níveis marcados como concluídos", "green", true)}
      ${dashboardMetric("Em desenvolvimento", String(safeNumber(data.developingLevels)), "Níveis em estudo", "blue", true)}
      ${dashboardMetric("Recursos concluídos", String(safeNumber(data.completedResources)), "Formações e materiais finalizados", "purple", true)}
      ${dashboardMetric("Evidências adicionadas", String(safeNumber(data.evidenceCount)), "Links de projetos ou certificados", "orange", true)}
      ${dashboardMetric("Nível geral", `${safeNumber(data.general?.percentage)}%`, "Conhecimento consolidado", "teal", true)}
      ${dashboardMetric("Aderência à trilha", data.selectedTrail ? `${safeNumber(data.selectedTrail.score?.percentage)}%` : "Sem trilha", data.selectedTrail?.trail?.nome || "Escolha uma trilha para acompanhar", "indigo", true)}
    </section>
    ${ui.card(`
      <div class="section-heading"><div><p class="eyebrow">MARCOS E EVIDÊNCIAS</p><h3>Linha do tempo</h3><p class="muted">O histórico começou a ser registrado a partir desta versão. Alterações anteriores não são reconstruídas artificialmente.</p></div></div>
      <div class="evolution-timeline">
        ${timeline.map(historyEventCard).join("") || '<div class="empty-state compact">Nenhum marco registrado ainda. Alterações de autoavaliação, início e conclusão passarão a aparecer aqui.</div>'}
      </div>`, "evolution-section")}
    ${ui.card(`<div class="section-heading"><div><p class="eyebrow">COMPETÊNCIAS DE DESTAQUE</p><h3>Forças atuais</h3></div></div><div class="category-heatmap">${(businessEngine.getDashboard().categories || []).sort((a,b)=>safeNumber(b.score?.percentage)-safeNumber(a.score?.percentage)).slice(0,6).map(categoryHeatmapTile).join("")}</div>`, "evolution-section")}`;
}

function renderAdministration() { const report = dataService.getHealthReport(); const datasets = Object.entries(report.datasets ?? {}); const errors = datasets.reduce((s,[,i]) => s+i.errors.length,0); const warnings = datasets.reduce((s,[,i]) => s+i.warnings.length,0); return `<div class="metric-grid">${ui.metric("Versão do esquema", report.schemaVersion ?? "-")}${ui.metric("Versão dos dados", report.dataVersion ?? "-")}${ui.metric("Erros", String(errors))}${ui.metric("Avisos", String(warnings))}</div><section class="admin-health-section">${ui.card(`<div><p class="eyebrow">PUBLICAÇÃO DE DADOS</p><h3>Saúde dos conjuntos de dados</h3><p class="muted">Confira disponibilidade, registros e validações de cada arquivo.</p></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Dataset</th><th>Estado</th><th>Registros</th><th>Arquivo</th><th>Mensagens</th></tr></thead><tbody>${datasets.map(([n,i]) => `<tr><td><strong>${escapeHtml(n)}</strong></td><td>${ui.badge(i.state,i.state)}</td><td>${i.count}</td><td><code>${escapeHtml(i.path || "-")}</code></td><td>${[...i.errors,...i.warnings].map(escapeHtml).join("<br>") || "OK"}</td></tr>`).join("")}</tbody></table></div>`, "stack")}</section>`; }
function renderProfile() { const user = currentUser(); return ui.card(`<div><p class="eyebrow">PERFIL LOCAL</p><h3>${escapeHtml(user?.name ?? "Perfil")}</h3><p class="muted">Permissão: ${escapeHtml(user?.role ?? "USER")}</p></div><div class="data-actions"><button id="export-backup" class="button button-primary">Exportar backup técnico</button><label class="button button-secondary" for="import-backup">Importar e substituir dados</label><input id="import-backup" class="hidden" type="file" accept="application/json,.json" /></div><p class="muted">A importação é substitutiva.</p><p id="backup-message" class="form-message"></p>`, "stack"); }
function bindProfileActions(container) { container.querySelector("#export-backup")?.addEventListener("click", exportTechnicalBackup); container.querySelector("#import-backup")?.addEventListener("change", async e => { const m=container.querySelector("#backup-message"); try { const [f]=e.target.files; if(!f)return; await importTechnicalBackup(f); m.textContent="Backup importado. A página será recarregada."; window.location.reload(); } catch(err){m.textContent=err.message;} }); }

function priorityLabel(value) { return ({ 3: "Alta", 2: "Média", 1: "Baixa" })[Number(value)] || ""; }
function sortPlanningItems(a, b) { return Number(b.priority || 0) - Number(a.priority || 0) || String(a.targetDate || "9999-12-31").localeCompare(String(b.targetDate || "9999-12-31")); }
function formatDate(value) { if (!value) return ""; const [year, month, day] = String(value).split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }

function filterHierarchy(hierarchy, filters) { const term=filters.search.trim().toLocaleLowerCase("pt-BR"); return hierarchy.map(c=>({...c,dominios:c.dominios.map(d=>({...d,competencias:d.competencias.filter(comp=>{const text=`${c.nome} ${d.nome} ${comp.nome} ${comp.descricao||""} ${comp.niveis.flatMap(l=>l.recursos).map(r=>r.nome).join(" ")}`.toLocaleLowerCase("pt-BR"); return(!filters.categoryId||c.categoria_id===filters.categoryId)&&(!filters.domainId||d.dominio_id===filters.domainId)&&(!filters.complexityId||comp.complexidade_id===filters.complexityId)&&(!term||text.includes(term));})})).filter(d=>d.competencias.length)})).filter(c=>c.dominios.length); }
function selectField(label,id,options,valueColumn,selected){return `<label class="filter-field"><span>${escapeHtml(label)}</span><select id="${id}"><option value="">Todos</option>${options.map(o=>`<option value="${escapeAttribute(o[valueColumn])}" ${o[valueColumn]===selected?"selected":""}>${escapeHtml(o.nome)}</option>`).join("")}</select></label>`;}

function mapSummaryMetric(label, value, helper, tone) {
  return `<article class="map-summary-card tone-${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(helper || "")}</small></article>`;
}
function developmentCard(item) {
  return `<article class="development-card">
    <div class="development-card-top"><span class="development-category">${escapeHtml(item.category?.nome || "Sem categoria")}</span><span>${planningStatusLabel(item.status)}</span></div>
    <h4>${escapeHtml(item.level.nome)}</h4>
    <p class="muted">${escapeHtml(item.competency.nome)}</p>
    <div class="development-meta"><span>Nota atual <strong>${safeNumber(item.score?.percentage)}%</strong></span>${item.targetDate ? `<span>Prazo <strong>${escapeHtml(formatDate(item.targetDate))}</strong></span>` : ""}</div>
    ${ui.progress(safeNumber(item.score?.percentage), `${item.level.nome}: ${safeNumber(item.score?.percentage)}%`)}
    <p class="development-next"><strong>Próximo passo:</strong> ${escapeHtml(item.nextAction)}</p>
    <button class="button button-secondary competency-details-button" data-competency-id="${escapeAttribute(item.competency.competencia_id)}">Abrir competência</button>
  </article>`;
}
function activeResourceCard(item) {
  return `<article class="active-resource-card">
    <div><span class="resource-type">${escapeHtml(item.resourceType)}</span><h4>${escapeHtml(item.resource.nome)}</h4><p class="muted">${escapeHtml(item.competency.nome)} · ${escapeHtml(item.level.nome)}</p></div>
    <div class="active-resource-meta"><span>${planningStatusLabel(item.status)}</span>${item.startedAt ? `<small>Iniciado em ${escapeHtml(formatDate(item.startedAt.slice(0,10)))}</small>` : ""}</div>
    ${item.resource.url_principal ? `<a class="button button-primary" href="${escapeAttribute(item.resource.url_principal)}" target="_blank" rel="noopener noreferrer">Continuar estudando</a>` : `<button class="button button-secondary competency-details-button" data-competency-id="${escapeAttribute(item.competency.competencia_id)}">Abrir detalhes</button>`}
  </article>`;
}
function buildNextActions(levels, resources) {
  const actions = [];
  levels.slice(0, 4).forEach(item => actions.push(`<button class="next-action-item competency-details-button" data-competency-id="${escapeAttribute(item.competency.competencia_id)}"><span>Continuar</span><strong>${escapeHtml(item.level.nome)}</strong><small>${escapeHtml(item.competency.nome)}</small></button>`));
  resources.filter(item => item.status === "vou_estudar").slice(0, 3).forEach(item => actions.push(`<button class="next-action-item competency-details-button" data-competency-id="${escapeAttribute(item.competency.competencia_id)}"><span>Iniciar recurso</span><strong>${escapeHtml(item.resource.nome)}</strong><small>${escapeHtml(item.competency.nome)}</small></button>`));
  return actions;
}
function historyEventCard(event) {
  const labels = { autoavaliacao_alterada: "Autoavaliação atualizada", nivel_planejado: "Nível planejado", nivel_iniciado: "Nível iniciado", nivel_concluido: "Nível concluído", recurso_planejado: "Recurso planejado", recurso_iniciado: "Recurso iniciado", recurso_concluido: "Recurso concluído", evidencia_adicionada: "Evidência adicionada" };
  const entity = event.entityType === "nivel" ? dataService.getById("niveis", event.entityId) : event.entityType === "recurso" ? dataService.getById("recursos", event.entityId) : null;
  return `<article class="timeline-event"><time>${escapeHtml(formatDateTime(event.occurredAt))}</time><div><strong>${escapeHtml(labels[event.type] || event.type || "Atualização")}</strong><p class="muted">${escapeHtml(entity?.nome || event.description || "Registro atualizado")}</p></div></article>`;
}
function formatDateTime(value) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"short" }); }

function dashboardMetric(label, value, helper = "", tone = "blue", compact = false) {
  return `<article class="dashboard-metric tone-${tone} ${compact ? "is-compact" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${helper ? `<small>${escapeHtml(helper)}</small>` : ""}</article>`;
}
function categoryHeatmapTile(category) {
  const percentage = safeNumber(category.score?.percentage);
  const intensity = percentage === 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(percentage / 20)));
  return `<article class="heatmap-tile heatmap-intensity-${intensity}" title="${escapeAttribute(category.nome)}: ${percentage}%"><span>${escapeHtml(category.nome)}</span><strong>${percentage}%</strong></article>`;
}
function competencyIdFromLevel(level) { return level?.competencia_id || ""; }
function trailKind(trail) {
  const value = String(trail?.tipo || "").trim().toLocaleLowerCase("pt-BR");
  return ["pessoa", "individual", "personalizada", "personalizado"].includes(value) ? "pessoa" : "carreira";
}
function sortTrails(a, b) { return (trailKind(a) === trailKind(b) ? byOrder(a, b) : trailKind(a) === "pessoa" ? -1 : 1); }
function trailGroup(title, description, trails, selected, tone) {
  if (!trails.length) return "";
  return `<section class="trail-group trail-group-${tone}"><div class="trail-group-heading"><p class="eyebrow">${escapeHtml(title)}</p><p class="muted">${escapeHtml(description)}</p></div><div class="trail-grid">${trails.map(trail => { const analysis = businessEngine.getTrailAnalysis(trail.trilha_id); const active = trail.trilha_id === selected; return ui.card(`<p class="eyebrow">${active ? "TRILHA ACOMPANHADA" : title}</p><h3>${escapeHtml(trail.nome)}</h3><p class="muted">${escapeHtml(trail.descricao || "")}</p>${ui.progress(analysis?.score.percentage || 0, `${trail.nome}: ${analysis?.score.percentage || 0}%`)}<div class="trail-card-footer"><span>${analysis?.total || 0} requisitos</span><div class="trail-card-actions"><button class="button button-secondary trail-details-button" data-trail-id="${trail.trilha_id}">Ver trilha</button><button class="button ${active ? "button-secondary" : "button-primary"} trail-select-button" data-trail-id="${trail.trilha_id}">${active ? "Deixar de acompanhar" : "Acompanhar"}</button></div></div>`, `trail-card trail-card-${tone} ${active ? "trail-card-selected" : ""}`); }).join("")}</div></section>`;
}
function planningStatusLabel(status) { return ({ interesse: "Tenho interesse", vou_estudar: "Vou estudar", estudando: "Estudando", concluido: "Concluído" })[status] || "Planejado"; }
function getUnifiedPlanningItems() {
  const levelItems = userDataService.getPlanningItems().map(progress => {
    const level = dataService.getById("niveis", progress.levelId);
    const competency = level ? dataService.getById("competencias", level.competencia_id) : null;
    if (!level || !competency) return null;
    return { kind: "competency", id: level.nivel_id, competencyId: competency.competencia_id, title: level.nome, subtitle: competency.nome, status: progress.status, priority: progress.priority, targetDate: progress.targetDate, notes: progress.notes, score: businessEngine.getLevelScore(level.nivel_id).percentage };
  }).filter(Boolean);
  const resources = dataService.getAll("recursos", { activeOnly: true });
  const resourceItems = userDataService.getCurrentUserData().resourceProgress.filter(progress => progress.status).map(progress => {
    const resource = resources.find(item => item.recurso_id === progress.resourceId);
    const level = resource ? dataService.getById("niveis", resource.nivel_id) : null;
    const competency = level ? dataService.getById("competencias", level.competencia_id) : null;
    if (!resource || !level || !competency) return null;
    return { kind: "resource", id: resource.recurso_id, competencyId: competency.competencia_id, title: resource.nome, subtitle: `${competency.nome} · ${level.nome}`, status: progress.status, url: resource.url_principal || "" };
  }).filter(Boolean);
  return [...levelItems, ...resourceItems];
}
function sortUnifiedPlanningItems(a, b) {
  const statusOrder = { estudando: 0, vou_estudar: 1, interesse: 2, concluido: 3 };
  const byStatus = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
  if (byStatus) return byStatus;
  if (a.kind !== b.kind) return a.kind === "competency" ? -1 : 1;
  return String(a.title).localeCompare(String(b.title), "pt-BR");
}

function safeNumber(value){const number=Number(value);return Number.isFinite(number)?number:0;}
function countResources(c){return c.niveis.reduce((s,l)=>s+l.recursos.length,0);} function categoryBar(c,p=0){return `<div class="category-progress"><div><strong>${escapeHtml(c.nome)}</strong><span>${p}%</span></div>${ui.progress(p,`${c.nome}: ${p}%`)}</div>`;} function planningOptions(selected=""){return [["interesse","Tenho interesse"],["vou_estudar","Vou estudar"],["estudando","Estudando"],["concluido","Concluído"]].map(([v,l])=>`<option value="${v}" ${v===selected?"selected":""}>${l}</option>`).join("");} function byOrder(a,b){return Number(a.ordem||0)-Number(b.ordem||0);}

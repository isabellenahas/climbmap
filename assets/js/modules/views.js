import { currentUser } from "../core/auth.js";
import { eventBus } from "../core/event-bus.js";
import { stateManager } from "../core/state-manager.js";
import { ui, escapeHtml, escapeAttribute } from "../components/ui.js";
import { exportTechnicalBackup, importTechnicalBackup } from "../services/backup-service.js";
import { configService } from "../services/config-service.js";
import { dataService } from "../services/data-service.js";
import { userDataService } from "../services/user-data-service.js?v=2.7.0";
import { businessEngine } from "../business/business-engine.js?v=2.7.0";

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
  const raw = businessEngine.getDashboard() ?? {};
  const generalPercentage = safeNumber(raw.general?.percentage);
  const assessedCompetencies = safeNumber(raw.assessedCompetencies);
  const totalCompetencies = safeNumber(raw.totalCompetencies);
  const planningItems = safeNumber(raw.planningItems);
  const studyingNow = safeNumber(raw.studyingNow);
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const highest = raw.highestCategory?.score ? raw.highestCategory : null;
  const selectedTrail = raw.selectedTrail ?? null;
  const inProgressCourses = Array.isArray(raw.inProgressCourses) ? raw.inProgressCourses : [];

  return `
    <section class="dashboard-hero-grid" aria-label="Indicadores principais">
      ${dashboardMetric("Nível geral", `${generalPercentage}%`, `${assessedCompetencies} de ${totalCompetencies} competências avaliadas`, "blue")}
      ${dashboardMetric("Categoria com maior nota", highest ? highest.nome : "Sem avaliações", highest ? `${safeNumber(highest.score.percentage)}% de domínio` : "Autoavalie competências para gerar este indicador", "purple")}
      <a class="dashboard-metric dashboard-metric-link tone-green" href="#/planejamento"><span>No planejamento</span><strong>${planningItems}</strong><small>Abrir planejamento →</small></a>
      ${dashboardMetric("Estudando agora", String(studyingNow), "Competências e recursos em andamento", "orange")}
    </section>
    ${ui.card(`<div class="section-heading dashboard-section-heading"><div><p class="eyebrow">MAPA DE CALOR</p><h3>Conhecimento por categoria</h3><p class="muted">A cor representa a nota consolidada das competências.</p></div></div><div class="category-heatmap">${categories.map(categoryHeatmapTile).join("") || '<div class="empty-state compact">Nenhuma categoria publicada.</div>'}</div>`, "dashboard-section heatmap-section")}
    ${ui.card(`<div class="section-heading dashboard-section-heading"><div><p class="eyebrow">RECURSOS EM ANDAMENTO</p><h3>Continue de onde parou</h3></div><a class="text-link" href="#/planejamento">Ver planejamento</a></div><div class="in-progress-course-list">${inProgressCourses.map(course => `<article class="in-progress-course-card"><span class="course-status-dot"></span><div><strong>${escapeHtml(course.nome)}</strong><small>${escapeHtml(course.competencyName || "Recurso")}</small></div>${course.url ? `<a class="button button-secondary" href="${escapeAttribute(course.url)}" target="_blank" rel="noopener noreferrer">Continuar</a>` : `<button class="button button-secondary competency-details-button" data-competency-id="${escapeAttribute(course.competencyId)}">Detalhes</button>`}</article>`).join("") || '<div class="empty-state compact">Nenhum recurso em andamento.</div>'}</div>`, "dashboard-section courses-section")}
    ${selectedTrail ? ui.card(`<p class="eyebrow">TRILHA ACOMPANHADA</p><h3>${escapeHtml(selectedTrail.trail.nome)}</h3>${ui.progress(safeNumber(selectedTrail.score?.percentage), `${selectedTrail.trail.nome}: ${safeNumber(selectedTrail.score?.percentage)}%`)}<a class="button button-secondary" href="#/trilhas">Ver trilha</a>`, "stack dashboard-section") : ""}`;
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
      <header class="section-heading catalog-category-header"><div><p class="eyebrow">CATEGORIA</p><h3>${escapeHtml(category.nome)}</h3><p class="muted">${escapeHtml(category.descricao || "")}</p></div>${ui.badge(`${category.dominios.length} domínio(s)`, "neutral")}</header>
      <div class="catalog-domain-list">${category.dominios.map(domain => `
        <details class="domain-details"><summary><span class="domain-summary-copy"><strong>${escapeHtml(domain.nome)}</strong><small>${escapeHtml(domain.descricao || "")}</small></span><span class="domain-summary-meta"><span>${domain.competencias.length} competência(s)</span><span class="disclosure-icon">⌄</span></span></summary>
          <div class="catalog-competency-list">${domain.competencias.map(comp => {
            const progress = userDataService.getCompetencyProgress(comp.competencia_id);
            const assessment = businessEngine.getCompetencyScore(comp.competencia_id);
            return `<article class="catalog-competency catalog-competency-clean ${progress?.status === "cancelado" ? "is-cancelled" : ""}">
              <div class="catalog-competency-main"><div class="catalog-competency-copy"><button class="catalog-competency-title competency-details-button" type="button" data-competency-id="${escapeAttribute(comp.competencia_id)}">${escapeHtml(comp.nome)}</button><p class="muted">${escapeHtml(comp.descricao || "")}</p><div class="catalog-level-chips">${comp.niveis.map(level => `<span>${escapeHtml(level.nome)}</span>`).join("") || '<span>Nenhum nível publicado</span>'}</div><small class="muted">Autoavaliação: ${escapeHtml(assessment.assessmentLabel)}${progress?.status === "cancelado" ? " · Cancelado" : ""}</small></div>
              <div class="catalog-competency-actions"><button class="button button-secondary competency-assess-button" type="button" data-competency-id="${escapeAttribute(comp.competencia_id)}">Autoavaliar</button><button class="button button-secondary competency-details-button" type="button" data-competency-id="${escapeAttribute(comp.competencia_id)}">Detalhes</button></div></div>
            </article>`;}).join("") || '<p class="muted">Nenhuma competência publicada.</p>'}</div>
        </details>`).join("")}</div>
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
  container.querySelectorAll(".competency-assess-button").forEach(button => button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openCompetencyAssessment(button.dataset.competencyId); }));

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

function openCompetencyAssessment(competencyId) {
  const competency = dataService.getById("competencias", competencyId);
  if (!competency) return;
  const progress = userDataService.getCompetencyProgress(competencyId);
  const dialog = document.createElement("dialog");
  dialog.className = "quick-assessment-dialog";
  dialog.innerHTML = `<article class="quick-assessment-card"><div class="competency-dialog-header"><div><p class="eyebrow">AUTOAVALIAÇÃO</p><h3>${escapeHtml(competency.nome)}</h3><p class="muted">Escolha a opção que melhor representa seu domínio atual.</p></div><button class="icon-button" data-close-dialog>×</button></div><div class="assessment-choice-grid">${businessEngine.getAssessmentScale().map(item => `<button class="assessment-choice ${item.autoavaliacao_id === progress?.assessmentId ? "is-selected" : ""}" data-assessment-id="${escapeAttribute(item.autoavaliacao_id)}"><strong>${escapeHtml(item.nome)}</strong><small>${escapeHtml(item.descricao || "")}</small></button>`).join("")}</div></article>`;
  document.body.appendChild(dialog);
  dialog.querySelectorAll(".assessment-choice").forEach(button => button.addEventListener("click", () => { userDataService.setCompetencyAssessment(competencyId, button.dataset.assessmentId); dialog.close(); }));
  dialog.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("close", () => dialog.remove()); dialog.showModal();
}

function openCompetencyDetails(competencyId) {
  const competency = dataService.getById("competencias", competencyId);
  if (!competency) return;
  const domain = dataService.getById("dominios", competency.dominio_id);
  const category = domain ? dataService.getById("categorias", domain.categoria_id) : null;
  const levels = dataService.getAll("niveis", { activeOnly: true }).filter(item => item.competencia_id === competencyId).sort(byOrder);
  const resources = dataService.getAll("recursos", { activeOnly: true });
  const resourceTypes = new Map(configService.getResourceTypes().map(item => [item.tipo_recurso_id, item.nome]));
  const score = businessEngine.getCompetencyScore(competencyId);
  const progress = userDataService.getCompetencyProgress(competencyId);
  const dialog = document.createElement("dialog");
  dialog.className = "competency-dialog";
  dialog.innerHTML = `<article class="competency-dialog-card"><header class="competency-dialog-header"><div><p class="eyebrow">${escapeHtml(category?.nome || "")} · ${escapeHtml(domain?.nome || "")}</p><h2>${escapeHtml(competency.nome)}</h2><p class="muted">${escapeHtml(competency.descricao || "")}</p></div><button class="icon-button" data-close-dialog>×</button></header>
    <section class="competency-overview-panel"><div><span class="muted">Nota consolidada</span><strong>${score.percentage}%</strong><small>${escapeHtml(score.assessmentLabel)}</small></div><div class="quick-actions"><button class="button button-primary competency-assess-dialog-button">Autoavaliar</button><button class="button button-secondary favorite-competency">${userDataService.isFavorite(competencyId) ? "Remover favorito" : "Favoritar"}</button></div></section>
    <section class="competency-planning-panel"><label class="assessment-field"><span>Status da competência</span><select class="competency-status-select">${competencyPlanningOptions(progress?.status || "")}</select></label><button class="button button-secondary competency-planning-details">Datas, prioridade e observações</button></section>
    <section class="levels-readonly"><h3>Níveis da competência</h3>${levels.map(level => `<article class="level-readonly-card"><div><strong>${escapeHtml(level.nome)}</strong><p class="muted">${escapeHtml(level.descricao || "")}</p></div><div class="resource-list resource-list-clean">${resources.filter(resource => resource.nivel_id === level.nivel_id).map(resource => renderResourceCard(resource, resourceTypes, competencyId)).join("") || '<div class="empty-state compact">Nenhum recurso publicado.</div>'}</div></article>`).join("")}</section></article>`;
  document.body.appendChild(dialog);
  dialog.querySelector(".competency-assess-dialog-button")?.addEventListener("click", () => { dialog.close(); openCompetencyAssessment(competencyId); });
  dialog.querySelector(".favorite-competency")?.addEventListener("click", event => { userDataService.toggleFavorite(competencyId); event.currentTarget.textContent = userDataService.isFavorite(competencyId) ? "Remover favorito" : "Favoritar"; });
  dialog.querySelector(".competency-status-select")?.addEventListener("change", event => userDataService.setCompetencyStatus(competencyId, event.currentTarget.value));
  dialog.querySelector(".competency-planning-details")?.addEventListener("click", () => openCompetencyPlanningDetails(competencyId));
  dialog.querySelectorAll(".resource-status-select").forEach(select => select.addEventListener("change", event => userDataService.setResourceStatus(event.currentTarget.dataset.resourceId, event.currentTarget.value, competencyId)));
  dialog.querySelectorAll(".resource-details-button").forEach(button => button.addEventListener("click", () => openResourceDetails(button.dataset.resourceId, competencyId)));
  dialog.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); }); dialog.addEventListener("close", () => dialog.remove()); dialog.showModal();
}

function renderResourceCard(resource, resourceTypes, competencyId) {
  const progress = userDataService.getResourceProgress(resource.recurso_id);
  return `<article class="resource-card resource-card-clean"><div class="resource-main-copy"><span class="resource-type">${escapeHtml(resourceTypes.get(resource.tipo_recurso_id) || "Recurso")}</span><h4>${escapeHtml(resource.nome)}</h4><p class="muted">${escapeHtml(resource.descricao || "")}</p>${progress?.targetDate ? `<small>Meta: ${formatDate(progress.targetDate)}</small>` : ""}</div><div class="resource-actions"><label class="filter-field"><span>Status</span><select class="resource-status-select" data-resource-id="${escapeAttribute(resource.recurso_id)}">${resourceStatusOptions(progress?.status || "")}</select></label><button class="button button-secondary resource-details-button" data-resource-id="${escapeAttribute(resource.recurso_id)}">Datas</button>${resource.url_principal ? `<a class="button button-secondary" href="${escapeAttribute(resource.url_principal)}" target="_blank" rel="noopener noreferrer">Abrir</a>` : ""}</div></article>`;
}

function openCompetencyPlanningDetails(competencyId) {
  const competency = dataService.getById("competencias", competencyId); const progress = userDataService.getCompetencyProgress(competencyId) || {};
  const dialog = document.createElement("dialog"); dialog.className="planning-details-dialog";
  dialog.innerHTML=`<article class="planning-details-card"><header class="competency-dialog-header"><div><p class="eyebrow">PLANEJAMENTO</p><h3>${escapeHtml(competency?.nome || "Competência")}</h3></div><button class="icon-button" data-close-dialog>×</button></header><form id="competency-plan-form" class="stack"><label class="filter-field"><span>Prioridade</span><select name="priority"><option value="0">Sem prioridade</option><option value="3" ${Number(progress.priority)===3?"selected":""}>Alta</option><option value="2" ${Number(progress.priority)===2?"selected":""}>Média</option><option value="1" ${Number(progress.priority)===1?"selected":""}>Baixa</option></select></label><label class="filter-field"><span>Data-meta</span><input name="targetDate" type="date" value="${escapeAttribute(progress.targetDate || "")}"></label><label class="planning-notes-field"><span>Observações</span><textarea name="notes" rows="5">${escapeHtml(progress.notes || "")}</textarea></label><button class="button button-primary">Salvar</button></form></article>`;
  document.body.appendChild(dialog); dialog.querySelector("#competency-plan-form").addEventListener("submit", event=>{event.preventDefault();const f=new FormData(event.currentTarget);userDataService.setCompetencyPlanningDetails(competencyId,{priority:f.get("priority"),targetDate:f.get("targetDate"),notes:f.get("notes")});dialog.close();}); dialog.querySelectorAll("[data-close-dialog]").forEach(b=>b.addEventListener("click",()=>dialog.close())); dialog.addEventListener("close",()=>dialog.remove()); dialog.showModal();
}

function openResourceDetails(resourceId, competencyId) {
  const resource=dataService.getById("recursos",resourceId); const progress=userDataService.getResourceProgress(resourceId)||{}; const dialog=document.createElement("dialog"); dialog.className="planning-details-dialog";
  dialog.innerHTML=`<article class="planning-details-card"><header class="competency-dialog-header"><div><p class="eyebrow">DATAS DO RECURSO</p><h3>${escapeHtml(resource?.nome || "Recurso")}</h3></div><button class="icon-button" data-close-dialog>×</button></header><form id="resource-plan-form" class="stack"><label class="filter-field"><span>Data de início</span><input name="startedAt" type="date" value="${escapeAttribute(String(progress.startedAt||"").slice(0,10))}"></label><label class="filter-field"><span>Data prevista</span><input name="targetDate" type="date" value="${escapeAttribute(progress.targetDate||"")}"></label><label class="filter-field"><span>Data de conclusão</span><input name="completedAt" type="date" value="${escapeAttribute(String(progress.completedAt||"").slice(0,10))}"></label><label class="filter-field"><span>Data de expiração</span><input name="expiresAt" type="date" value="${escapeAttribute(progress.expiresAt||"")}"></label><button class="button button-primary">Salvar</button></form></article>`;
  document.body.appendChild(dialog); dialog.querySelector("#resource-plan-form").addEventListener("submit",event=>{event.preventDefault();const f=new FormData(event.currentTarget);userDataService.setResourceDetails(resourceId,{startedAt:f.get("startedAt"),targetDate:f.get("targetDate"),completedAt:f.get("completedAt"),expiresAt:f.get("expiresAt")},competencyId);dialog.close();}); dialog.querySelectorAll("[data-close-dialog]").forEach(b=>b.addEventListener("click",()=>dialog.close())); dialog.addEventListener("close",()=>dialog.remove()); dialog.showModal();
}

function renderTrails() {
  const trails = dataService.getAll("trilhas", { activeOnly: true }).sort(sortTrails);
  const selected = userDataService.getSelectedTrailId();
  const personTrails = trails.filter(trail => trailKind(trail) === "pessoa");
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
    userDataService.setCompetencyStatus(button.dataset.competencyId, "em_aberto");
    button.textContent = "Adicionado ao planejamento";
    button.disabled = true;
    message.textContent = "Competência adicionada ao planejamento em Em aberto.";
  }));
  dialog.querySelectorAll(".trail-open-competency").forEach(button => button.addEventListener("click", () => openCompetencyDetails(button.dataset.competencyId)));
  dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function renderPlanning() {
  const items = getCompetencyPlanningItems();
  const categories = dataService.getAll("categorias", { activeOnly: true });
  const columns = [["stand_by","Stand by"],["em_aberto","Em aberto"],["em_andamento","Em andamento"],["concluido","Concluído"]];
  return `${ui.card(`<div class="catalog-toolbar planning-filters"><label class="filter-field"><span>Data até</span><input id="planning-date-filter" type="date"></label>${selectField("Categoria","planning-category-filter",categories,"categoria_id","")}<label class="filter-field"><span>Prioridade</span><select id="planning-priority-filter"><option value="">Todas</option><option value="3">Alta</option><option value="2">Média</option><option value="1">Baixa</option></select></label><button id="clear-planning-filters" class="button button-secondary">Limpar</button></div>`,"catalog-filter-card")}<div id="planning-board" class="planning-board">${columns.map(([status,label])=>`<section class="planning-column"><header><h3>${label}</h3><span>${items.filter(item=>item.status===status).length}</span></header><div class="planning-column-content" data-status="${status}">${items.filter(item=>item.status===status).sort(sortPlanningItems).map(planningCompetencyCard).join("")||'<div class="empty-state compact">Nenhuma competência.</div>'}</div></section>`).join("")}</div>`;
}

function planningCompetencyCard(item) {
  const visibleResources = item.status === "concluido" ? item.resources.filter(r=>r.status) : item.resources.filter(r=>["em_aberto","em_andamento"].includes(r.status));
  return `<article class="planning-card planning-card-competency" data-category-id="${escapeAttribute(item.categoryId||"")}" data-priority="${item.priority||0}" data-target-date="${escapeAttribute(item.targetDate||"")}"><div><span class="planning-kind-label">COMPETÊNCIA</span><h4>${escapeHtml(item.title)}</h4><p class="muted">${escapeHtml(item.subtitle)}</p></div><div class="planning-card-meta">${item.priority?ui.badge(priorityLabel(item.priority),"neutral"):""}${item.targetDate?`<span>Meta: ${formatDate(item.targetDate)}</span>`:""}<span>Autoavaliação: ${escapeHtml(item.assessmentLabel)}</span></div><select class="planning-status-select competency-planning-status" data-competency-id="${escapeAttribute(item.id)}">${competencyPlanningOptions(item.status)}</select>${visibleResources.length?`<div class="planning-resource-list"><strong>Recursos</strong>${visibleResources.map(resource=>`<div class="planning-resource-row"><span>${escapeHtml(resource.nome)}</span><small>${resourceStatusLabel(resource.status)}${resource.targetDate?` · ${formatDate(resource.targetDate)}`:""}</small></div>`).join("")}</div>`:""}<div class="quick-actions"><button class="button button-secondary planning-open-details" data-competency-id="${escapeAttribute(item.id)}">Detalhes</button><button class="button button-secondary planning-edit-details" data-competency-id="${escapeAttribute(item.id)}">Editar plano</button></div></article>`;
}

function bindPlanningActions(container) {
  container.querySelectorAll(".competency-planning-status").forEach(select=>select.addEventListener("change",event=>{userDataService.setCompetencyStatus(event.currentTarget.dataset.competencyId,event.currentTarget.value);renderRoute("planejamento",container);}));
  container.querySelectorAll(".planning-open-details").forEach(button=>button.addEventListener("click",()=>openCompetencyDetails(button.dataset.competencyId)));
  container.querySelectorAll(".planning-edit-details").forEach(button=>button.addEventListener("click",()=>openCompetencyPlanningDetails(button.dataset.competencyId)));
  const apply=()=>applyPlanningFilters(container); ["planning-date-filter","planning-category-filter","planning-priority-filter"].forEach(id=>container.querySelector(`#${id}`)?.addEventListener("change",apply)); container.querySelector("#clear-planning-filters")?.addEventListener("click",()=>renderRoute("planejamento",container));
}
function applyPlanningFilters(container){const date=container.querySelector("#planning-date-filter")?.value||"";const cat=container.querySelector("#planning-category-filter")?.value||"";const priority=container.querySelector("#planning-priority-filter")?.value||"";container.querySelectorAll(".planning-card").forEach(card=>{const okDate=!date||!card.dataset.targetDate||card.dataset.targetDate<=date;const okCat=!cat||card.dataset.categoryId===cat;const okPriority=!priority||card.dataset.priority===priority;card.hidden=!(okDate&&okCat&&okPriority);});}

function getCompetencyPlanningItems(){const user=userDataService.getCurrentUserData();const resources=dataService.getAll("recursos",{activeOnly:true});const levels=dataService.getAll("niveis",{activeOnly:true});return user.competencyProgress.filter(item=>item.status&&item.status!=="cancelado").map(progress=>{const competency=dataService.getById("competencias",progress.competencyId);const domain=competency?dataService.getById("dominios",competency.dominio_id):null;const category=domain?dataService.getById("categorias",domain.categoria_id):null;if(!competency)return null;const resourceItems=user.resourceProgress.filter(r=>r.competencyId===progress.competencyId&&r.status).map(r=>{const resource=resources.find(x=>x.recurso_id===r.resourceId);return resource?{...r,nome:resource.nome}:null}).filter(Boolean);return{id:competency.competencia_id,title:competency.nome,subtitle:`${category?.nome||""} · ${domain?.nome||""}`,categoryId:category?.categoria_id||"",status:progress.status,priority:progress.priority,targetDate:progress.targetDate,assessmentLabel:businessEngine.getCompetencyScore(competency.competencia_id).assessmentLabel,resources:resourceItems};}).filter(Boolean);}

function renderEvolution() {
  const year = new Date().getFullYear(); const timeline = businessEngine.getEvolutionTimeline(year); const months=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const row=(items,tone)=>`<div class="timeline-row timeline-${tone}"><div class="timeline-label">${tone==="done"?"Realizado":"Planejado"}</div><div class="timeline-months">${months.map((month,index)=>{const monthItems=items.filter(item=>new Date(`${item.date}T12:00:00`).getMonth()===index);return `<div class="timeline-month"><span>${month}</span><div class="timeline-markers">${monthItems.map(item=>`<button class="timeline-marker" title="${escapeAttribute(timelineTooltip(item))}"><span>${escapeHtml(item.title)}</span></button>`).join("")}</div></div>`;}).join("")}</div></div>`;
  return `<section class="evolution-header"><p class="eyebrow">EVOLUÇÃO</p><h2>Linha do tempo ${year}</h2><p class="muted">Concluído em linha escura e planejado em linha clara.</p></section>${ui.card(`<div class="dual-timeline">${row(timeline.completed,"done")}${row(timeline.planned,"planned")}</div>`,"evolution-card")}`;
}
function timelineTooltip(item){const resources=item.resources||[];return `${item.title} · ${formatDate(item.date)}${resources.length?` · Recursos: ${resources.map(r=>r.resource.nome).join(", ")}`:""}`;}

function renderAdministration() { const report = dataService.getHealthReport(); const datasets = Object.entries(report.datasets ?? {}); const errors = datasets.reduce((s,[,i]) => s+i.errors.length,0); const warnings = datasets.reduce((s,[,i]) => s+i.warnings.length,0); return `<div class="metric-grid">${ui.metric("Versão do esquema", report.schemaVersion ?? "-")}${ui.metric("Versão dos dados", report.dataVersion ?? "-")}${ui.metric("Erros", String(errors))}${ui.metric("Avisos", String(warnings))}</div><section class="admin-health-section">${ui.card(`<div><p class="eyebrow">PUBLICAÇÃO DE DADOS</p><h3>Saúde dos conjuntos de dados</h3><p class="muted">Confira disponibilidade, registros e validações de cada arquivo.</p></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Dataset</th><th>Estado</th><th>Registros</th><th>Arquivo</th><th>Mensagens</th></tr></thead><tbody>${datasets.map(([n,i]) => `<tr><td><strong>${escapeHtml(n)}</strong></td><td>${ui.badge(i.state,i.state)}</td><td>${i.count}</td><td><code>${escapeHtml(i.path || "-")}</code></td><td>${[...i.errors,...i.warnings].map(escapeHtml).join("<br>") || "OK"}</td></tr>`).join("")}</tbody></table></div>`, "stack")}</section>`; }
function renderProfile() { const user = currentUser(); return ui.card(`<div><p class="eyebrow">PERFIL LOCAL</p><h3>${escapeHtml(user?.name ?? "Perfil")}</h3><p class="muted">Permissão: ${escapeHtml(user?.role ?? "USER")}</p></div><div class="data-actions"><button id="export-backup" class="button button-primary">Exportar backup técnico</button><label class="button button-secondary" for="import-backup">Importar e substituir dados</label><input id="import-backup" class="hidden" type="file" accept="application/json,.json" /></div><p class="muted">A importação é substitutiva.</p><p id="backup-message" class="form-message"></p>`, "stack"); }
function bindProfileActions(container) { container.querySelector("#export-backup")?.addEventListener("click", exportTechnicalBackup); container.querySelector("#import-backup")?.addEventListener("change", async e => { const m=container.querySelector("#backup-message"); try { const [f]=e.target.files; if(!f)return; await importTechnicalBackup(f); m.textContent="Backup importado. A página será recarregada."; window.location.reload(); } catch(err){m.textContent=err.message;} }); }

function priorityLabel(value) { return ({ 3: "Alta", 2: "Média", 1: "Baixa" })[Number(value)] || ""; }
function sortPlanningItems(a, b) { return Number(b.priority || 0) - Number(a.priority || 0) || String(a.targetDate || "9999-12-31").localeCompare(String(b.targetDate || "9999-12-31")); }
function formatDate(value) { if (!value) return ""; const [year, month, day] = String(value).split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }

function filterHierarchy(hierarchy, filters) { const term=filters.search.trim().toLocaleLowerCase("pt-BR"); return hierarchy.map(c=>({...c,dominios:c.dominios.map(d=>({...d,competencias:d.competencias.filter(comp=>{const text=`${c.nome} ${d.nome} ${comp.nome} ${comp.descricao||""} ${comp.niveis.flatMap(l=>l.recursos).map(r=>r.nome).join(" ")}`.toLocaleLowerCase("pt-BR"); return(!filters.categoryId||c.categoria_id===filters.categoryId)&&(!filters.domainId||d.dominio_id===filters.domainId)&&(!filters.complexityId||comp.complexidade_id===filters.complexityId)&&(!term||text.includes(term));})})).filter(d=>d.competencias.length)})).filter(c=>c.dominios.length); }
function selectField(label,id,options,valueColumn,selected){return `<label class="filter-field"><span>${escapeHtml(label)}</span><select id="${id}"><option value="">Todos</option>${options.map(o=>`<option value="${escapeAttribute(o[valueColumn])}" ${o[valueColumn]===selected?"selected":""}>${escapeHtml(o.nome)}</option>`).join("")}</select></label>`;}

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
function competencyStatusLabel(status){return ({stand_by:"Stand by",em_aberto:"Em aberto",em_andamento:"Em andamento",concluido:"Concluído",cancelado:"Cancelado"})[status]||"Fora do planejamento";}
function resourceStatusLabel(status){return ({em_aberto:"Em aberto",em_andamento:"Em andamento",concluido:"Concluído",cancelado:"Cancelado"})[status]||"Sem status";}
function competencyPlanningOptions(selected=""){return [["","Fora do planejamento"],["stand_by","Stand by"],["em_aberto","Em aberto"],["em_andamento","Em andamento"],["concluido","Concluído"],["cancelado","Cancelado"]].map(([v,l])=>`<option value="${v}" ${v===selected?"selected":""}>${l}</option>`).join("");}
function resourceStatusOptions(selected=""){return [["","Sem status"],["em_aberto","Em aberto"],["em_andamento","Em andamento"],["concluido","Concluído"],["cancelado","Cancelado"]].map(([v,l])=>`<option value="${v}" ${v===selected?"selected":""}>${l}</option>`).join("");}
function safeNumber(value){const number=Number(value);return Number.isFinite(number)?number:0;}
function countResources(c){return c.niveis.reduce((s,l)=>s+l.recursos.length,0);} function categoryBar(c,p=0){return `<div class="category-progress"><div><strong>${escapeHtml(c.nome)}</strong><span>${p}%</span></div>${ui.progress(p,`${c.nome}: ${p}%`)}</div>`;} function byOrder(a,b){return Number(a.ordem||0)-Number(b.ordem||0);}

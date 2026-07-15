import { currentUser } from "../core/auth.js";
import { eventBus } from "../core/event-bus.js";
import { stateManager } from "../core/state-manager.js";
import { ui, escapeHtml, escapeAttribute } from "../components/ui.js";
import { exportTechnicalBackup, importTechnicalBackup } from "../services/backup-service.js";
import { configService } from "../services/config-service.js";
import { dataService } from "../services/data-service.js";
import { userDataService } from "../services/user-data-service.js?v=2.4.0";
import { businessEngine } from "../business/business-engine.js?v=2.4.0";

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
  const assessedLevels = safeNumber(raw.assessedLevels);
  const totalLevels = safeNumber(raw.totalLevels);
  const planningItems = safeNumber(raw.planningItems);
  const studyingLevels = safeNumber(raw.studyingLevels);
  const completedResources = safeNumber(raw.completedResources);
  const completedCertifications = safeNumber(raw.completedCertifications);
  const favorites = safeNumber(raw.favorites);
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const highest = raw.highestCategory?.score ? raw.highestCategory : null;
  const selectedTrail = raw.selectedTrail ?? null;

  return `
    <section class="dashboard-metrics" aria-label="Indicadores principais">
      ${ui.metric("Nível geral", `${generalPercentage}%`, `${assessedLevels} de ${totalLevels} níveis avaliados`)}
      ${ui.metric("Categoria com maior nota", highest ? `${highest.nome} · ${safeNumber(highest.score.percentage)}%` : "Sem avaliações", highest ? "Maior domínio atual" : "Avalie níveis para gerar este indicador")}
      <a class="card metric-card metric-card-link" href="#/planejamento" aria-label="Abrir planejamento">
        <span class="muted">No planejamento</span>
        <strong class="metric-value">${planningItems}</strong>
        <small class="muted">Abrir planejamento →</small>
      </a>
      ${ui.metric("Estudando agora", String(studyingLevels), "Níveis em andamento")}
    </section>

    <section class="dashboard-metrics dashboard-metrics-secondary" aria-label="Indicadores complementares">
      ${ui.metric("Recursos concluídos", String(completedResources))}
      ${ui.metric("Certificações concluídas", String(completedCertifications))}
      ${ui.metric("Favoritos", String(favorites))}
      ${ui.metric("Trilha acompanhada", selectedTrail ? `${selectedTrail.trail.nome} · ${safeNumber(selectedTrail.score?.percentage)}%` : "Nenhuma")}
    </section>

    ${ui.card(`
      <div class="section-heading dashboard-section-heading">
        <div><p class="eyebrow">PROGRESSO POR CATEGORIA</p><h3>Seu mapa atual</h3></div>
      </div>
      <div class="category-progress-list">
        ${categories.map(category => categoryBar(category, safeNumber(category.score?.percentage))).join("") || '<div class="empty-state compact">Nenhuma categoria publicada.</div>'}
      </div>`, "dashboard-section")}

    ${selectedTrail
      ? ui.card(`<p class="eyebrow">TRILHA ACOMPANHADA</p><h3>${escapeHtml(selectedTrail.trail.nome)}</h3><p class="muted">${safeNumber(selectedTrail.completed)} de ${safeNumber(selectedTrail.total)} requisitos atendidos.</p>${ui.progress(safeNumber(selectedTrail.score?.percentage), `${selectedTrail.trail.nome}: ${safeNumber(selectedTrail.score?.percentage)}%`)}<div class="quick-actions"><a class="button button-secondary" href="#/trilhas">Ver trilha</a></div>`, "stack dashboard-section")
      : ui.card(`<p class="eyebrow">TRILHAS</p><h3>Nenhuma trilha acompanhada</h3><p class="muted">Escolha uma trilha oficial para acompanhar seu progresso nesse recorte.</p><a class="button button-secondary" href="#/trilhas">Escolher trilha</a>`, "stack dashboard-section")}`;
}
function bindMapActions() {}

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
                <article class="catalog-competency" data-competency-row="${escapeAttribute(comp.competencia_id)}">
                  <div class="catalog-competency-header">
                    <button class="catalog-competency-toggle" type="button" data-toggle-competency="${escapeAttribute(comp.competencia_id)}" aria-expanded="false" aria-controls="preview-${escapeAttribute(comp.competencia_id)}">
                      <span class="disclosure-icon" aria-hidden="true">›</span>
                      <span class="sr-only">Expandir resumo de ${escapeHtml(comp.nome)}</span>
                    </button>
                    <div class="catalog-competency-copy">
                      <button class="catalog-competency-title competency-details-button" type="button" data-competency-id="${escapeAttribute(comp.competencia_id)}">${escapeHtml(comp.nome)}</button>
                      <small>${comp.niveis.length} nível(is) · ${countResources(comp)} recurso(s)</small>
                    </div>
                    <button class="button button-secondary competency-details-button" type="button" data-competency-id="${escapeAttribute(comp.competencia_id)}">Detalhes</button>
                  </div>
                  <div id="preview-${escapeAttribute(comp.competencia_id)}" class="catalog-competency-preview" hidden>
                    ${comp.niveis.map(level => `<div class="catalog-level-preview"><strong>${escapeHtml(level.nome)}</strong><span>${level.recursos.length} recurso(s)</span></div>`).join("") || '<p class="muted">Nenhum nível publicado.</p>'}
                  </div>
                </article>`).join("") || '<p class="muted">Nenhuma competência publicada.</p>'}
            </div>
          </details>`).join("")}
      </div>
    </article>`).join("");
}
function bindCatalogActions(container) {
  const bindDetails = root => root.querySelectorAll(".competency-details-button").forEach(button => button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); stateManager.set("selectedCompetencyId", button.dataset.competencyId); eventBus.emit("competency:selected", { competencyId: button.dataset.competencyId }); openCompetencyDetails(button.dataset.competencyId); }));
  const bindToggles = root => root.querySelectorAll("[data-toggle-competency]").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const preview = root.querySelector(`#preview-${CSS.escape(button.dataset.toggleCompetency)}`);
    if (!preview) return;
    const willOpen = preview.hidden;
    preview.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
    button.closest(".catalog-competency")?.classList.toggle("is-open", willOpen);
  }));
  bindDetails(container);
  bindToggles(container);
  const applyFilters = () => {
    stateManager.patch("catalogFilters", { search: container.querySelector("#catalog-search")?.value ?? "", categoryId: container.querySelector("#catalog-category-filter")?.value ?? "", domainId: container.querySelector("#catalog-domain-filter")?.value ?? "", complexityId: container.querySelector("#catalog-complexity-filter")?.value ?? "" });
    const results = container.querySelector("#catalog-results");
    results.innerHTML = renderCatalogResults(filterHierarchy(dataService.getHierarchy(), stateManager.get("catalogFilters")));
    bindDetails(results);
    bindToggles(results);
  };
  container.querySelector("#catalog-search")?.addEventListener("input", applyFilters);
  ["catalog-category-filter", "catalog-domain-filter", "catalog-complexity-filter"].forEach(id => container.querySelector(`#${id}`)?.addEventListener("change", applyFilters));
  container.querySelector("#clear-catalog-filters")?.addEventListener("click", () => { stateManager.set("catalogFilters", { search: "", categoryId: "", domainId: "", complexityId: "" }); renderRoute("catalogo", container); });
}

function openCompetencyDetails(competencyId) {
  const competency = dataService.getById("competencias", competencyId); if (!competency) return;
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
  const dialog = document.createElement("dialog"); dialog.id = "competency-dialog"; dialog.className = "competency-dialog";
  dialog.innerHTML = `<article class="competency-dialog-card stack"><header class="competency-dialog-header"><div><p class="eyebrow">${escapeHtml([category?.nome, domain?.nome].filter(Boolean).join(" · "))}</p><h2>${escapeHtml(competency.nome)}</h2><p class="muted">${escapeHtml(competency.descricao || "")}</p><div class="inline-badges">${complexity ? ui.badge(complexity.nome, "neutral") : ""}${competency.tempo_estimado_horas ? ui.badge(`${competency.tempo_estimado_horas}h estimadas`, "neutral") : ""}</div></div><button class="icon-button" type="button" data-close-dialog>×</button></header><section class="competency-summary-panel"><div><span class="muted">Nota consolidada da competência</span><strong class="metric-value compact-value" id="competency-score-value">${score.percentage}%</strong>${ui.progress(score.percentage, `${competency.nome}: ${score.percentage}%`)}</div><button id="favorite-competency" class="button button-secondary" type="button">${favorite ? "★ Remover favorito" : "☆ Favoritar"}</button></section><section class="stack"><div><h3>Níveis da competência</h3><p class="muted">Autoavaliação e planejamento são definidos separadamente em cada nível.</p></div>${levels.map(level => renderLevelDetails(level, resources, resourceTypes, assessments)).join("") || '<div class="empty-state">Nenhum nível publicado.</div>'}</section><p id="competency-save-message" class="form-message" role="status"></p></article>`;
  document.body.appendChild(dialog);
  const message = dialog.querySelector("#competency-save-message");
  const refresh = text => { const updated = businessEngine.getCompetencyScore(competencyId); dialog.querySelector("#competency-score-value").textContent = `${updated.percentage}%`; message.textContent = text || `Salvo. Nota atual: ${updated.percentage}%.`; };
  dialog.querySelector("#favorite-competency")?.addEventListener("click", event => { userDataService.toggleFavorite(competencyId); event.currentTarget.textContent = userDataService.isFavorite(competencyId) ? "★ Remover favorito" : "☆ Favoritar"; refresh("Favoritos atualizados."); });
  dialog.querySelectorAll(".level-assessment-select").forEach(select => select.addEventListener("change", event => { userDataService.setLevelAssessment(event.currentTarget.dataset.levelId, event.currentTarget.value); refresh(); }));
  dialog.querySelectorAll(".level-planning-select").forEach(select => select.addEventListener("change", event => { const id = event.currentTarget.dataset.levelId; event.currentTarget.value ? userDataService.setLevelPlanningStatus(id, event.currentTarget.value) : userDataService.removeLevelFromPlanning(id); refresh("Planejamento do nível atualizado."); }));
  dialog.querySelectorAll(".resource-status-select").forEach(select => select.addEventListener("change", event => {
    userDataService.setResourceStatus(event.currentTarget.dataset.resourceId, event.currentTarget.value);
    refresh("Status do recurso atualizado.");
  }));
  dialog.querySelectorAll(".resource-details-form").forEach(form => form.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    userDataService.setResourceDetails(event.currentTarget.dataset.resourceId, {
      evidenceUrl: formData.get("evidenceUrl"),
      expiresAt: formData.get("expiresAt"),
      notes: formData.get("notes")
    });
    refresh("Detalhes do recurso salvos.");
  }));
  dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close()); dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); }); dialog.addEventListener("close", () => dialog.remove()); dialog.showModal();
}

function renderLevelDetails(level, resources, resourceTypes, assessments) {
  const progress = userDataService.getLevelProgress(level.nivel_id);
  const score = businessEngine.getLevelScore(level.nivel_id);
  const levelResources = resources.filter(resource => resource.nivel_id === level.nivel_id).sort(byOrder);

  return `
    <details class="level-details">
      <summary>
        <span><strong>${escapeHtml(level.nome)}</strong><small>${escapeHtml(level.descricao || "")}</small></span>
        <span class="level-summary-score">${score.percentage}% · ${levelResources.length} recurso(s)</span>
      </summary>
      <div class="level-content">
        <div class="level-controls">
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
        <div class="resource-list">
          ${levelResources.map(resource => renderResourceCard(resource, resourceTypes)).join("") || '<div class="empty-state compact">Nenhum recurso publicado para este nível.</div>'}
        </div>
      </div>
    </details>`;
}

function renderResourceCard(resource, resourceTypes) {
  const progress = userDataService.getResourceProgress(resource.recurso_id);
  return `
    <article class="resource-card resource-card-detailed">
      <div class="resource-main-copy">
        <span class="resource-type">${escapeHtml(resourceTypes.get(resource.tipo_recurso_id) || "Recurso")}</span>
        <h4>${escapeHtml(resource.nome)}</h4>
        <p class="muted">${escapeHtml(resource.descricao || "")}</p>
      </div>
      <div class="resource-actions">
        <label class="compact-field">
          <span class="sr-only">Status do recurso</span>
          <select class="resource-status-select" data-resource-id="${escapeAttribute(resource.recurso_id)}">
            <option value="" ${!progress?.status ? "selected" : ""}>Sem status</option>
            <option value="interesse" ${progress?.status === "interesse" ? "selected" : ""}>Tenho interesse</option>
            <option value="estudando" ${progress?.status === "estudando" ? "selected" : ""}>Estou estudando</option>
            <option value="concluido" ${progress?.status === "concluido" ? "selected" : ""}>Concluído</option>
          </select>
        </label>
        ${resource.url_principal ? `<a class="button button-secondary" href="${escapeAttribute(resource.url_principal)}" target="_blank" rel="noopener noreferrer">Abrir recurso</a>` : ""}
      </div>
      <details class="resource-personal-details">
        <summary>Meus detalhes</summary>
        <form class="resource-details-form" data-resource-id="${escapeAttribute(resource.recurso_id)}">
          <label><span>Link da evidência</span><input name="evidenceUrl" type="url" value="${escapeAttribute(progress?.evidenceUrl || "")}" placeholder="https://..." /></label>
          <label><span>Validade / expiração</span><input name="expiresAt" type="date" value="${escapeAttribute(progress?.expiresAt || "")}" /></label>
          <label class="resource-notes-field"><span>Observações pessoais</span><textarea name="notes" rows="2" placeholder="Anotações sobre este recurso">${escapeHtml(progress?.notes || "")}</textarea></label>
          <button class="button button-secondary" type="submit">Salvar detalhes</button>
        </form>
      </details>
    </article>`;
}

function renderTrails() {
  const trails = dataService.getAll("trilhas", { activeOnly: true }).sort(byOrder); const selected = userDataService.getSelectedTrailId();
  return `<div class="section-heading trails-heading"><div><p class="eyebrow">TRILHAS OFICIAIS</p><h3>Escolha uma referência</h3><p class="muted">A trilha apresenta requisitos de conhecimento e níveis mínimos.</p></div></div><div class="trail-grid">${trails.map(trail => { const a = businessEngine.getTrailAnalysis(trail.trilha_id); const active = trail.trilha_id === selected; return ui.card(`<p class="eyebrow">${active ? "TRILHA ACOMPANHADA" : "TRILHA OFICIAL"}</p><h3>${escapeHtml(trail.nome)}</h3><p class="muted">${escapeHtml(trail.descricao || "")}</p>${ui.progress(a?.score.percentage || 0, `${trail.nome}: ${a?.score.percentage || 0}%`)}<div class="trail-card-footer"><span>${a?.total || 0} requisitos</span><div class="trail-card-actions"><button class="button button-secondary trail-details-button" data-trail-id="${trail.trilha_id}">Ver trilha</button><button class="button ${active ? "button-secondary" : "button-primary"} trail-select-button" data-trail-id="${trail.trilha_id}">${active ? "Deixar de acompanhar" : "Acompanhar"}</button></div></div>`, `trail-card ${active ? "trail-card-selected" : ""}`); }).join("")}</div>`;
}
function bindTrailActions(container) { container.querySelectorAll(".trail-details-button").forEach(b => b.addEventListener("click", () => openTrailDetails(b.dataset.trailId))); container.querySelectorAll(".trail-select-button").forEach(b => b.addEventListener("click", () => { userDataService.setSelectedTrail(userDataService.getSelectedTrailId() === b.dataset.trailId ? "" : b.dataset.trailId); renderRoute("trilhas", container); })); }
function openTrailDetails(trailId) {
  const a = businessEngine.getTrailAnalysis(trailId); if (!a) return; const selected = userDataService.getSelectedTrailId() === trailId;
  document.querySelector("#trail-dialog")?.remove(); const dialog = document.createElement("dialog"); dialog.id = "trail-dialog"; dialog.className = "competency-dialog";
  dialog.innerHTML = `<article class="competency-dialog-card stack"><header class="competency-dialog-header"><div><p class="eyebrow">TRILHA OFICIAL</p><h2>${escapeHtml(a.trail.nome)}</h2><p class="muted">${escapeHtml(a.trail.descricao || "")}</p></div><button class="icon-button" data-close-dialog>×</button></header><section class="trail-dialog-summary"><div><span class="muted">Progresso nos requisitos</span><strong class="metric-value compact-value">${a.score.percentage}%</strong>${ui.progress(a.score.percentage, `${a.trail.nome}: ${a.score.percentage}%`)}</div><div class="trail-summary-numbers"><span><strong>${a.completed}</strong> atendidos</span><span><strong>${a.total}</strong> requisitos</span></div></section><div class="quick-actions"><button id="trail-dialog-select" class="button ${selected ? "button-secondary" : "button-primary"}">${selected ? "Deixar de acompanhar" : "Acompanhar esta trilha"}</button></div><p id="trail-dialog-message" class="form-message"></p><section class="stack">${a.requirements.map(item => `<article class="trail-competency-row"><div><strong>${escapeHtml(item.competency.nome)}</strong><p class="muted">Nível mínimo: ${escapeHtml(item.minimumLevel.nome)}</p></div><div>${item.score.percentage}%${ui.progress(item.score.percentage, item.competency.nome)}</div><div class="trail-card-actions"><button class="button button-secondary trail-open-competency" data-competency-id="${item.competency.competencia_id}">Detalhes</button><button class="button button-secondary trail-plan-level" data-level-id="${item.minimumLevel.nivel_id}">Planejar nível mínimo</button></div></article>`).join("")}</section></article>`;
  document.body.appendChild(dialog); const msg = dialog.querySelector("#trail-dialog-message");
  dialog.querySelector("#trail-dialog-select")?.addEventListener("click", e => { const next = userDataService.getSelectedTrailId() === trailId ? "" : trailId; userDataService.setSelectedTrail(next); e.currentTarget.textContent = next ? "Deixar de acompanhar" : "Acompanhar esta trilha"; msg.textContent = next ? "Trilha acompanhada." : "Acompanhamento removido."; });
  dialog.querySelectorAll(".trail-plan-level").forEach(b => b.addEventListener("click", () => { userDataService.setLevelPlanningStatus(b.dataset.levelId, "interesse"); b.textContent = "Adicionado"; b.disabled = true; msg.textContent = "Nível adicionado ao planejamento."; }));
  dialog.querySelectorAll(".trail-open-competency").forEach(b => b.addEventListener("click", () => openCompetencyDetails(b.dataset.competencyId)));
  dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close()); dialog.addEventListener("close", () => dialog.remove()); dialog.showModal();
}

function renderPlanning() {
  const columns = [
    ["interesse", "Tenho interesse"],
    ["vou_estudar", "Vou estudar"],
    ["estudando", "Estudando"],
    ["concluido", "Concluído"]
  ];
  const items = userDataService.getPlanningItems().sort(sortPlanningItems);
  const withTargetDate = items.filter(item => item.targetDate).length;
  const highPriority = items.filter(item => Number(item.priority) === 3).length;

  return `
    <div class="section-heading planning-heading">
      <div>
        <p class="eyebrow">PLANEJAMENTO INDIVIDUAL</p>
        <h3>Planejamento por nível</h3>
        <p class="muted">Organize status, prioridade, meta e observações de cada nível.</p>
      </div>
      <div class="planning-summary">
        ${ui.badge(`${items.length} nível(is)`, "neutral")}
        ${ui.badge(`${withTargetDate} com meta`, "neutral")}
        ${ui.badge(`${highPriority} alta prioridade`, highPriority ? "warning" : "neutral")}
      </div>
    </div>
    <div class="planning-board">
      ${columns.map(([status, label]) => {
        const list = items.filter(item => item.status === status);
        return `<section class="planning-column"><header><strong>${label}</strong>${ui.badge(String(list.length), "neutral")}</header><div class="planning-column-content">${list.map(planningCard).join("") || '<div class="empty-state compact">Nenhum nível.</div>'}</div></section>`;
      }).join("")}
    </div>`;
}

function planningCard(item) {
  const level = dataService.getById("niveis", item.levelId);
  if (!level) return "";
  const competency = dataService.getById("competencias", level.competencia_id);
  const score = businessEngine.getLevelScore(level.nivel_id);
  const priority = priorityLabel(item.priority);

  return `
    <article class="planning-card">
      <div>
        <strong>${escapeHtml(competency?.nome || "Competência")}</strong>
        <p class="muted">${escapeHtml(level.nome)} · ${score.percentage}%</p>
      </div>
      ${ui.progress(score.percentage, level.nome)}
      <div class="planning-card-meta">
        ${priority ? ui.badge(priority, Number(item.priority) === 3 ? "warning" : "neutral") : ""}
        ${item.targetDate ? `<span>Meta: ${escapeHtml(formatDate(item.targetDate))}</span>` : '<span class="muted">Sem data-meta</span>'}
      </div>
      ${item.notes ? `<p class="planning-notes">${escapeHtml(item.notes)}</p>` : ""}
      <select class="planning-status-select" data-level-id="${escapeAttribute(level.nivel_id)}">
        ${planningOptions(item.status)}
        <option value="remover">Remover</option>
      </select>
      <div class="planning-card-actions">
        <button class="button button-secondary planning-edit-details" data-level-id="${escapeAttribute(level.nivel_id)}" type="button">Editar plano</button>
        <button class="button button-secondary planning-open-details" data-competency-id="${escapeAttribute(level.competencia_id)}" type="button">Abrir competência</button>
      </div>
    </article>`;
}

function bindPlanningActions(container) {
  container.querySelectorAll(".planning-status-select").forEach(select => select.addEventListener("change", event => {
    const levelId = event.currentTarget.dataset.levelId;
    event.currentTarget.value === "remover"
      ? userDataService.removeLevelFromPlanning(levelId)
      : userDataService.setLevelPlanningStatus(levelId, event.currentTarget.value);
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

function renderEvolution() { const d = businessEngine.getDashboard(); return `<div class="metric-grid">${ui.metric("Níveis avaliados", String(d.assessedLevels), `${d.totalLevels} disponíveis`)}${ui.metric("Recursos concluídos", String(d.completedResources))}${ui.metric("Certificações concluídas", String(d.completedCertifications))}${ui.metric("Níveis no planejamento", String(d.planningItems))}</div>${ui.card(`<h3>Retrato atual</h3><p class="muted">O histórico temporal será incluído futuramente. Neste momento, esta tela mostra o estado atual.</p>${ui.progress(d.general.percentage, `Nível geral: ${d.general.percentage}%`)}`, "evolution-card")}`; }
function renderAdministration() { const report = dataService.getHealthReport(); const datasets = Object.entries(report.datasets ?? {}); const errors = datasets.reduce((s,[,i]) => s+i.errors.length,0); const warnings = datasets.reduce((s,[,i]) => s+i.warnings.length,0); return `<div class="metric-grid">${ui.metric("Versão do esquema", report.schemaVersion ?? "-")}${ui.metric("Versão dos dados", report.dataVersion ?? "-")}${ui.metric("Erros", String(errors))}${ui.metric("Avisos", String(warnings))}</div><section class="admin-health-section">${ui.card(`<div><p class="eyebrow">PUBLICAÇÃO DE DADOS</p><h3>Saúde dos conjuntos de dados</h3><p class="muted">Confira disponibilidade, registros e validações de cada arquivo.</p></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Dataset</th><th>Estado</th><th>Registros</th><th>Arquivo</th><th>Mensagens</th></tr></thead><tbody>${datasets.map(([n,i]) => `<tr><td><strong>${escapeHtml(n)}</strong></td><td>${ui.badge(i.state,i.state)}</td><td>${i.count}</td><td><code>${escapeHtml(i.path || "-")}</code></td><td>${[...i.errors,...i.warnings].map(escapeHtml).join("<br>") || "OK"}</td></tr>`).join("")}</tbody></table></div>`, "stack")}</section>`; }
function renderProfile() { const user = currentUser(); return ui.card(`<div><p class="eyebrow">PERFIL LOCAL</p><h3>${escapeHtml(user?.name ?? "Perfil")}</h3><p class="muted">Permissão: ${escapeHtml(user?.role ?? "USER")}</p></div><div class="data-actions"><button id="export-backup" class="button button-primary">Exportar backup técnico</button><label class="button button-secondary" for="import-backup">Importar e substituir dados</label><input id="import-backup" class="hidden" type="file" accept="application/json,.json" /></div><p class="muted">A importação é substitutiva.</p><p id="backup-message" class="form-message"></p>`, "stack"); }
function bindProfileActions(container) { container.querySelector("#export-backup")?.addEventListener("click", exportTechnicalBackup); container.querySelector("#import-backup")?.addEventListener("change", async e => { const m=container.querySelector("#backup-message"); try { const [f]=e.target.files; if(!f)return; await importTechnicalBackup(f); m.textContent="Backup importado. A página será recarregada."; window.location.reload(); } catch(err){m.textContent=err.message;} }); }

function priorityLabel(value) { return ({ 3: "Alta", 2: "Média", 1: "Baixa" })[Number(value)] || ""; }
function sortPlanningItems(a, b) { return Number(b.priority || 0) - Number(a.priority || 0) || String(a.targetDate || "9999-12-31").localeCompare(String(b.targetDate || "9999-12-31")); }
function formatDate(value) { if (!value) return ""; const [year, month, day] = String(value).split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }

function filterHierarchy(hierarchy, filters) { const term=filters.search.trim().toLocaleLowerCase("pt-BR"); return hierarchy.map(c=>({...c,dominios:c.dominios.map(d=>({...d,competencias:d.competencias.filter(comp=>{const text=`${c.nome} ${d.nome} ${comp.nome} ${comp.descricao||""} ${comp.niveis.flatMap(l=>l.recursos).map(r=>r.nome).join(" ")}`.toLocaleLowerCase("pt-BR"); return(!filters.categoryId||c.categoria_id===filters.categoryId)&&(!filters.domainId||d.dominio_id===filters.domainId)&&(!filters.complexityId||comp.complexidade_id===filters.complexityId)&&(!term||text.includes(term));})})).filter(d=>d.competencias.length)})).filter(c=>c.dominios.length); }
function selectField(label,id,options,valueColumn,selected){return `<label class="filter-field"><span>${escapeHtml(label)}</span><select id="${id}"><option value="">Todos</option>${options.map(o=>`<option value="${escapeAttribute(o[valueColumn])}" ${o[valueColumn]===selected?"selected":""}>${escapeHtml(o.nome)}</option>`).join("")}</select></label>`;}
function safeNumber(value){const number=Number(value);return Number.isFinite(number)?number:0;}
function countResources(c){return c.niveis.reduce((s,l)=>s+l.recursos.length,0);} function categoryBar(c,p=0){return `<div class="category-progress"><div><strong>${escapeHtml(c.nome)}</strong><span>${p}%</span></div>${ui.progress(p,`${c.nome}: ${p}%`)}</div>`;} function planningOptions(selected=""){return [["interesse","Tenho interesse"],["vou_estudar","Vou estudar"],["estudando","Estudando"],["concluido","Concluído"]].map(([v,l])=>`<option value="${v}" ${v===selected?"selected":""}>${l}</option>`).join("");} function byOrder(a,b){return Number(a.ordem||0)-Number(b.ordem||0);}

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
  const d = businessEngine.getDashboard();
  const highest = d.highestCategory;
  return `
    <div class="metric-grid user-metric-grid">
      ${ui.metric("Nível geral", `${d.general.percentage}%`, `${d.assessedLevels} de ${d.totalLevels} níveis avaliados`)}
      ${ui.metric("Categoria com maior nota", highest ? `${highest.nome} · ${highest.score.percentage}%` : "Sem dados", "Maior domínio atual")}
      <a class="metric-card metric-card-link" href="#/planejamento"><span>No planejamento</span><strong>${d.planningItems}</strong><small>Abrir planejamento</small></a>
      ${ui.metric("Estudando agora", String(d.studyingLevels), "Níveis em andamento")}
    </div>
    <div class="metric-grid secondary-metrics">
      ${ui.metric("Recursos concluídos", String(d.completedResources))}
      ${ui.metric("Certificações concluídas", String(d.completedCertifications))}
      ${ui.metric("Favoritos", String(d.favorites))}
      ${ui.metric("Trilha acompanhada", d.selectedTrail ? `${d.selectedTrail.trail.nome} · ${d.selectedTrail.score.percentage}%` : "Nenhuma")}
    </div>
    ${ui.card(`<div class="section-heading"><div><p class="eyebrow">PROGRESSO POR CATEGORIA</p><h3>Seu mapa atual</h3></div></div><div class="stack">${d.categories.map(c => categoryBar(c, c.score.percentage)).join("") || '<div class="empty-state">Nenhuma categoria publicada.</div>'}</div>`, "stack")}
    ${d.selectedTrail ? ui.card(`<p class="eyebrow">TRILHA ACOMPANHADA</p><h3>${escapeHtml(d.selectedTrail.trail.nome)}</h3><p class="muted">${d.selectedTrail.completed} de ${d.selectedTrail.total} requisitos atendidos.</p>${ui.progress(d.selectedTrail.score.percentage, `${d.selectedTrail.trail.nome}: ${d.selectedTrail.score.percentage}%`)}<div class="quick-actions"><a class="button button-secondary" href="#/trilhas">Ver trilha</a></div>`, "stack") : ui.card(`<p class="eyebrow">TRILHAS</p><h3>Nenhuma trilha acompanhada</h3><p class="muted">Escolha uma trilha oficial para acompanhar seu progresso nesse recorte.</p><a class="button button-secondary" href="#/trilhas">Escolher trilha</a>`, "stack")}`;
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
  return hierarchy.map(category => `<article class="card stack"><div class="section-heading"><div><p class="eyebrow">CATEGORIA</p><h3>${escapeHtml(category.nome)}</h3><p class="muted">${escapeHtml(category.descricao || "")}</p></div>${ui.badge(`${category.dominios.length} domínio(s)`, "neutral")}</div>${category.dominios.map(domain => `<details class="domain-details" open><summary><span><strong>${escapeHtml(domain.nome)}</strong><small>${escapeHtml(domain.descricao || "")}</small></span><span>${domain.competencias.length} competências</span></summary><div class="stack catalog-indent">${domain.competencias.map(comp => `<details class="catalog-competency-details"><summary><span><button class="catalog-competency-title competency-details-button" type="button" data-competency-id="${escapeAttribute(comp.competencia_id)}">${escapeHtml(comp.nome)}</button><small>${comp.niveis.length} níveis · ${countResources(comp)} recursos</small></span><button class="button button-secondary competency-details-button" type="button" data-competency-id="${escapeAttribute(comp.competencia_id)}">Ver detalhes</button></summary><div class="catalog-competency-preview">${comp.niveis.map(level => `<div><strong>${escapeHtml(level.nome)}</strong><span>${level.recursos.length} recurso(s)</span></div>`).join("") || '<p class="muted">Nenhum nível publicado.</p>'}</div></details>`).join("") || '<p class="muted">Nenhuma competência publicada.</p>'}</div></details>`).join("")}</article>`).join("");
}

function bindCatalogActions(container) {
  const bindDetails = root => root.querySelectorAll(".competency-details-button").forEach(button => button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); stateManager.set("selectedCompetencyId", button.dataset.competencyId); eventBus.emit("competency:selected", { competencyId: button.dataset.competencyId }); openCompetencyDetails(button.dataset.competencyId); }));
  bindDetails(container);
  const applyFilters = () => {
    stateManager.patch("catalogFilters", { search: container.querySelector("#catalog-search")?.value ?? "", categoryId: container.querySelector("#catalog-category-filter")?.value ?? "", domainId: container.querySelector("#catalog-domain-filter")?.value ?? "", complexityId: container.querySelector("#catalog-complexity-filter")?.value ?? "" });
    const results = container.querySelector("#catalog-results");
    results.innerHTML = renderCatalogResults(filterHierarchy(dataService.getHierarchy(), stateManager.get("catalogFilters")));
    bindDetails(results);
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
  dialog.querySelectorAll(".resource-status-select").forEach(select => select.addEventListener("change", event => { userDataService.setResourceStatus(event.currentTarget.dataset.resourceId, event.currentTarget.value); refresh(); }));
  dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close()); dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); }); dialog.addEventListener("close", () => dialog.remove()); dialog.showModal();
}

function renderLevelDetails(level, resources, resourceTypes, assessments) {
  const progress = userDataService.getLevelProgress(level.nivel_id);
  const score = businessEngine.getLevelScore(level.nivel_id);
  const levelResources = resources.filter(r => r.nivel_id === level.nivel_id).sort(byOrder);
  return `<details class="level-details"><summary><span><strong>${escapeHtml(level.nome)}</strong><small>${escapeHtml(level.descricao || "")}</small></span><span class="level-summary-score">${score.percentage}% · ${levelResources.length} recurso(s)</span></summary><div class="level-content"><div class="level-controls"><label class="assessment-field"><span>Minha autoavaliação</span><select class="level-assessment-select" data-level-id="${escapeAttribute(level.nivel_id)}">${assessments.map(item => `<option value="${escapeAttribute(item.autoavaliacao_id)}" ${item.autoavaliacao_id === progress?.assessmentId ? "selected" : ""}>${escapeHtml(item.nome)}</option>`).join("")}</select></label><label class="assessment-field"><span>Status no planejamento</span><select class="level-planning-select" data-level-id="${escapeAttribute(level.nivel_id)}"><option value="">Fora do planejamento</option>${planningOptions(progress?.status || "")}</select></label></div><div class="resource-list">${levelResources.map(resource => { const rp = userDataService.getResourceProgress(resource.recurso_id); return `<article class="resource-card"><div><span class="resource-type">${escapeHtml(resourceTypes.get(resource.tipo_recurso_id) || "Recurso")}</span><h4>${escapeHtml(resource.nome)}</h4><p class="muted">${escapeHtml(resource.descricao || "")}</p></div><div class="resource-actions"><select class="resource-status-select" data-resource-id="${escapeAttribute(resource.recurso_id)}"><option value="" ${!rp?.status ? "selected" : ""}>Sem status</option><option value="interesse" ${rp?.status === "interesse" ? "selected" : ""}>Tenho interesse</option><option value="estudando" ${rp?.status === "estudando" ? "selected" : ""}>Estou estudando</option><option value="concluido" ${rp?.status === "concluido" ? "selected" : ""}>Concluído</option></select>${resource.url_principal ? `<a class="button button-secondary" href="${escapeAttribute(resource.url_principal)}" target="_blank" rel="noopener noreferrer">Abrir recurso</a>` : ""}</div></article>`; }).join("") || '<div class="empty-state compact">Nenhum recurso publicado para este nível.</div>'}</div></div></details>`;
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
  const columns = [["interesse", "Tenho interesse"], ["vou_estudar", "Vou estudar"], ["estudando", "Estudando"], ["concluido", "Concluído"]]; const items = userDataService.getPlanningItems();
  return `<div class="section-heading"><div><p class="eyebrow">PLANEJAMENTO INDIVIDUAL</p><h3>Planejamento por nível</h3><p class="muted">Cada card representa um nível específico de uma competência.</p></div></div><div class="planning-board">${columns.map(([status, label]) => { const list = items.filter(i => i.status === status); return `<section class="planning-column"><header><strong>${label}</strong>${ui.badge(String(list.length), "neutral")}</header><div class="planning-column-content">${list.map(planningCard).join("") || '<div class="empty-state compact">Nenhum nível.</div>'}</div></section>`; }).join("")}</div>`;
}
function planningCard(item) { const level = dataService.getById("niveis", item.levelId); if (!level) return ""; const comp = dataService.getById("competencias", level.competencia_id); const score = businessEngine.getLevelScore(level.nivel_id); return `<article class="planning-card"><div><strong>${escapeHtml(comp?.nome || "Competência")}</strong><p class="muted">${escapeHtml(level.nome)} · ${score.percentage}%</p></div>${ui.progress(score.percentage, level.nome)}<select class="planning-status-select" data-level-id="${level.nivel_id}">${planningOptions(item.status)}<option value="remover">Remover</option></select><button class="button button-secondary planning-open-details" data-competency-id="${level.competencia_id}">Abrir competência</button></article>`; }
function bindPlanningActions(container) { container.querySelectorAll(".planning-status-select").forEach(s => s.addEventListener("change", e => { const id = e.currentTarget.dataset.levelId; e.currentTarget.value === "remover" ? userDataService.removeLevelFromPlanning(id) : userDataService.setLevelPlanningStatus(id, e.currentTarget.value); renderRoute("planejamento", container); })); container.querySelectorAll(".planning-open-details").forEach(b => b.addEventListener("click", () => openCompetencyDetails(b.dataset.competencyId))); }

function renderEvolution() { const d = businessEngine.getDashboard(); return `<div class="metric-grid">${ui.metric("Níveis avaliados", String(d.assessedLevels), `${d.totalLevels} disponíveis`)}${ui.metric("Recursos concluídos", String(d.completedResources))}${ui.metric("Certificações concluídas", String(d.completedCertifications))}${ui.metric("Níveis no planejamento", String(d.planningItems))}</div>${ui.card(`<h3>Retrato atual</h3><p class="muted">O histórico temporal será incluído futuramente. Neste momento, esta tela mostra o estado atual.</p>${ui.progress(d.general.percentage, `Nível geral: ${d.general.percentage}%`)}`, "evolution-card")}`; }
function renderAdministration() { const report = dataService.getHealthReport(); const datasets = Object.entries(report.datasets ?? {}); const errors = datasets.reduce((s,[,i]) => s+i.errors.length,0); const warnings = datasets.reduce((s,[,i]) => s+i.warnings.length,0); return `<div class="metric-grid">${ui.metric("Versão do esquema", report.schemaVersion ?? "-")}${ui.metric("Versão dos dados", report.dataVersion ?? "-")}${ui.metric("Erros", String(errors))}${ui.metric("Avisos", String(warnings))}</div><section class="admin-health-section">${ui.card(`<div><p class="eyebrow">PUBLICAÇÃO DE DADOS</p><h3>Saúde dos conjuntos de dados</h3><p class="muted">Confira disponibilidade, registros e validações de cada arquivo.</p></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Dataset</th><th>Estado</th><th>Registros</th><th>Arquivo</th><th>Mensagens</th></tr></thead><tbody>${datasets.map(([n,i]) => `<tr><td><strong>${escapeHtml(n)}</strong></td><td>${ui.badge(i.state,i.state)}</td><td>${i.count}</td><td><code>${escapeHtml(i.path || "-")}</code></td><td>${[...i.errors,...i.warnings].map(escapeHtml).join("<br>") || "OK"}</td></tr>`).join("")}</tbody></table></div>`, "stack")}</section>`; }
function renderProfile() { const user = currentUser(); return ui.card(`<div><p class="eyebrow">PERFIL LOCAL</p><h3>${escapeHtml(user?.name ?? "Perfil")}</h3><p class="muted">Permissão: ${escapeHtml(user?.role ?? "USER")}</p></div><div class="data-actions"><button id="export-backup" class="button button-primary">Exportar backup técnico</button><label class="button button-secondary" for="import-backup">Importar e substituir dados</label><input id="import-backup" class="hidden" type="file" accept="application/json,.json" /></div><p class="muted">A importação é substitutiva.</p><p id="backup-message" class="form-message"></p>`, "stack"); }
function bindProfileActions(container) { container.querySelector("#export-backup")?.addEventListener("click", exportTechnicalBackup); container.querySelector("#import-backup")?.addEventListener("change", async e => { const m=container.querySelector("#backup-message"); try { const [f]=e.target.files; if(!f)return; await importTechnicalBackup(f); m.textContent="Backup importado. A página será recarregada."; window.location.reload(); } catch(err){m.textContent=err.message;} }); }

function filterHierarchy(hierarchy, filters) { const term=filters.search.trim().toLocaleLowerCase("pt-BR"); return hierarchy.map(c=>({...c,dominios:c.dominios.map(d=>({...d,competencias:d.competencias.filter(comp=>{const text=`${c.nome} ${d.nome} ${comp.nome} ${comp.descricao||""} ${comp.niveis.flatMap(l=>l.recursos).map(r=>r.nome).join(" ")}`.toLocaleLowerCase("pt-BR"); return(!filters.categoryId||c.categoria_id===filters.categoryId)&&(!filters.domainId||d.dominio_id===filters.domainId)&&(!filters.complexityId||comp.complexidade_id===filters.complexityId)&&(!term||text.includes(term));})})).filter(d=>d.competencias.length)})).filter(c=>c.dominios.length); }
function selectField(label,id,options,valueColumn,selected){return `<label class="filter-field"><span>${escapeHtml(label)}</span><select id="${id}"><option value="">Todos</option>${options.map(o=>`<option value="${escapeAttribute(o[valueColumn])}" ${o[valueColumn]===selected?"selected":""}>${escapeHtml(o.nome)}</option>`).join("")}</select></label>`;}
function countResources(c){return c.niveis.reduce((s,l)=>s+l.recursos.length,0);} function categoryBar(c,p=0){return `<div class="category-progress"><div><strong>${escapeHtml(c.nome)}</strong><span>${p}%</span></div>${ui.progress(p,`${c.nome}: ${p}%`)}</div>`;} function planningOptions(selected=""){return [["interesse","Tenho interesse"],["vou_estudar","Vou estudar"],["estudando","Estudando"],["concluido","Concluído"]].map(([v,l])=>`<option value="${v}" ${v===selected?"selected":""}>${l}</option>`).join("");} function byOrder(a,b){return Number(a.ordem||0)-Number(b.ordem||0);}

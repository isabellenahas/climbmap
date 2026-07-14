import { currentUser } from "../core/auth.js";
import { eventBus } from "../core/event-bus.js";
import { stateManager } from "../core/state-manager.js";
import { ui, escapeHtml, escapeAttribute } from "../components/ui.js";
import { exportTechnicalBackup, importTechnicalBackup } from "../services/backup-service.js";
import { configService } from "../services/config-service.js";
import { dataService } from "../services/data-service.js";

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
}

function renderMap() {
  const categories = dataService.getAll("categorias", { activeOnly: true });
  const competencies = dataService.getAll("competencias", { activeOnly: true });
  const resources = dataService.getAll("recursos", { activeOnly: true });
  const trails = dataService.getAll("trilhas", { activeOnly: true });

  return `
    <div class="metric-grid">
      ${ui.metric("Nível geral", "0%", "Aguardando autoavaliação")}
      ${ui.metric("Competências", String(competencies.length), "Publicadas no catálogo")}
      ${ui.metric("Recursos", String(resources.length), "Cursos, certificados e materiais")}
      ${ui.metric("Trilhas oficiais", String(trails.length), "Definidas pelo administrador")}
    </div>
    <div class="section-grid">
      ${ui.card(`
        <div class="section-heading"><div><p class="eyebrow">VISÃO GERAL</p><h3>Mapa macro</h3></div></div>
        ${categories.length ? categories.map(categoryBar).join("") : '<div class="empty-state">Nenhuma categoria publicada.</div>'}
      `)}
      ${ui.card(`
        <div class="section-heading"><div><p class="eyebrow">PRÓXIMOS PASSOS</p><h3>Lacunas prioritárias</h3></div></div>
        <p class="muted">As lacunas serão calculadas quando as autoavaliações forem habilitadas na próxima entrega.</p>
        <div class="empty-state compact">Nenhuma lacuna calculada.</div>
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
  const resourceTypes = new Map(configService.getResourceTypes().map(type => [type.tipo_recurso_id, type.nome]));

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
          <p class="muted">${escapeHtml(competency.descricao || "Sem descrição publicada.")}</p>
          <div class="inline-badges">
            ${complexity ? ui.badge(complexity.nome, "neutral") : ""}
            ${competency.tempo_estimado_horas ? ui.badge(`${competency.tempo_estimado_horas}h estimadas`, "neutral") : ""}
          </div>
        </div>
        <button class="icon-button" type="button" data-close-dialog aria-label="Fechar detalhes">×</button>
      </header>
      <section class="stack">
        <div><h3>Níveis da competência</h3><p class="muted">Recursos agrupados pelo nível ao qual pertencem.</p></div>
        ${levels.length ? levels.map(level => {
          const levelResources = resources.filter(resource => resource.nivel_id === level.nivel_id).sort(byOrder);
          return `
            <details class="level-details" open>
              <summary><span><strong>${escapeHtml(level.nome)}</strong><small>${escapeHtml(level.descricao || "")}</small></span>${ui.badge(`${levelResources.length} recurso(s)`, "ready")}</summary>
              <div class="resource-list">
                ${levelResources.length ? levelResources.map(resource => `
                  <article class="resource-card">
                    <div>
                      <span class="resource-type">${escapeHtml(resourceTypes.get(resource.tipo_recurso_id) || "Recurso")}</span>
                      <h4>${escapeHtml(resource.nome)}</h4>
                      <p class="muted">${escapeHtml(resource.descricao || "")}</p>
                    </div>
                    ${resource.url_principal ? `<a class="button button-secondary" href="${escapeAttribute(resource.url_principal)}" target="_blank" rel="noopener noreferrer">Abrir recurso</a>` : ""}
                  </article>`).join("") : '<div class="empty-state compact">Nenhum recurso publicado para este nível.</div>'}
              </div>
            </details>`;
        }).join("") : '<div class="empty-state">Nenhum nível publicado.</div>'}
      </section>
    </article>`;

  document.body.appendChild(dialog);
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
  return `${ui.card(`<p class="eyebrow">PLANEJAMENTO INDIVIDUAL</p><h3>Seus planos de desenvolvimento</h3><p class="muted">A estrutura está pronta para receber planos pessoais e itens selecionados do catálogo.</p><div class="empty-state compact">Nenhum plano criado.</div>`)}`;
}

function renderEvolution() {
  return `<div class="metric-grid">${ui.metric("Competências avaliadas", "0")}${ui.metric("Recursos concluídos", "0")}${ui.metric("Certificações", "0")}${ui.metric("Planos ativos", "0")}</div>${ui.card(`<h3>Retrato atual</h3><p class="muted">A evolução temporal será habilitada quando o usuário começar a registrar seu progresso.</p><div class="empty-state compact">Ainda não há dados individuais.</div>`, "evolution-card")}`;
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

function categoryBar(category) {
  return `<div class="category-progress"><div><strong>${escapeHtml(category.nome)}</strong><span>0%</span></div>${ui.progress(0, `${category.nome}: 0%`)}</div>`;
}

function byOrder(a, b) {
  return Number(a.ordem || 0) - Number(b.ordem || 0);
}

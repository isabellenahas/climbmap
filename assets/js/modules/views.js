import { currentUser } from "../core/auth.js";
import { exportTechnicalBackup, importTechnicalBackup } from "../services/backup-service.js";
import { dataService } from "../services/data-service.js";

export function renderRoute(route, container) {
  const renderers = {
    mapa: renderMap,
    catalogo: renderCatalog,
    trilhas: renderTrails,
    planejamento: () => renderEmpty("O usuário poderá criar planos e adicionar competências por meio do botão “+”."),
    evolucao: () => renderEmpty("Esta primeira versão não guarda histórico temporal; a tela exibirá o retrato atual e indicadores derivados."),
    perfil: renderProfile,
    administracao: renderAdministration
  };

  container.innerHTML = renderers[route]?.() ?? renderEmpty("Tela não encontrada.");
  if (route === "perfil") bindProfileActions();
  if (route === "catalogo") bindCatalogActions();
}

function renderMap() {
  const categorias = dataService.getAll("categorias", { activeOnly: true });
  const competencias = dataService.getAll("competencias", { activeOnly: true });
  const recursos = dataService.getAll("recursos", { activeOnly: true });

  return `
    <div class="metric-grid">
      ${metric("Nível geral", "0%")}
      ${metric("Competências publicadas", String(competencias.length))}
      ${metric("Recursos publicados", String(recursos.length))}
      ${metric("Categorias", String(categorias.length))}
    </div>
    <div class="section-grid">
      <article class="card">
        <h3>Mapa macro</h3>
        ${categorias.length ? categorias.map(categoryBar).join("") : '<div class="empty-state">Nenhuma categoria publicada.</div>'}
      </article>
      <article class="card">
        <h3>Lacunas prioritárias</h3>
        <p class="muted">Serão calculadas quando o usuário começar a preencher suas autoavaliações.</p>
        <div class="empty-state">Nenhuma lacuna calculada.</div>
      </article>
    </div>`;
}

function renderCatalog() {
  const hierarchy = dataService.getHierarchy();
  if (!hierarchy.length) return renderEmpty("O Data Service está funcionando, mas categorias.csv ainda não possui registros.");

  return `<div class="stack">
    ${hierarchy.map(category => `
      <article class="card stack">
        <div><p class="eyebrow">CATEGORIA</p><h3>${escapeHtml(category.nome)}</h3><p class="muted">${escapeHtml(category.descricao || "")}</p></div>
        ${category.dominios.map(domain => `
          <details>
            <summary><strong>${escapeHtml(domain.nome)}</strong> · ${domain.competencias.length} competências</summary>
            <div class="stack catalog-indent">
              ${domain.competencias.map(competency => `
                <div class="catalog-row">
                  <div><strong>${escapeHtml(competency.nome)}</strong><p class="muted">${competency.niveis.length} níveis</p></div>
                  <button class="button button-secondary competency-details-button" type="button" data-competency-id="${escapeHtml(competency.competencia_id)}">Detalhes</button>
                </div>`).join("") || '<p class="muted">Nenhuma competência publicada.</p>'}
            </div>
          </details>`).join("") || '<p class="muted">Nenhum domínio publicado.</p>'}
      </article>`).join("")}
  </div>`;
}

function bindCatalogActions() {
  document.querySelectorAll(".competency-details-button").forEach(button => {
    button.addEventListener("click", () => openCompetencyDetails(button.dataset.competencyId));
  });
}

function openCompetencyDetails(competencyId) {
  const competency = dataService.getById("competencias", competencyId);
  if (!competency) return;

  const domain = dataService.getById("dominios", competency.dominio_id);
  const category = domain ? dataService.getById("categorias", domain.categoria_id) : null;
  const levels = dataService
    .getAll("niveis", { activeOnly: true })
    .filter(level => level.competencia_id === competencyId)
    .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
  const resources = dataService.getAll("recursos", { activeOnly: true });
  const resourceTypes = new Map(
    dataService.getAll("tiposRecursos", { activeOnly: true })
      .map(type => [type.tipo_recurso_id, type.nome])
  );

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
        </div>
        <button class="icon-button" type="button" data-close-dialog aria-label="Fechar detalhes">×</button>
      </header>

      <section class="stack">
        <div>
          <h3>Níveis da competência</h3>
          <p class="muted">Os recursos aparecem agrupados pelo nível ao qual pertencem.</p>
        </div>
        ${levels.length ? levels.map(level => {
          const levelResources = resources
            .filter(resource => resource.nivel_id === level.nivel_id)
            .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
          return `
            <details class="level-details" open>
              <summary>
                <span><strong>${escapeHtml(level.nome)}</strong><small>${escapeHtml(level.descricao || "")}</small></span>
                <span class="status-badge status-ready">${levelResources.length} recurso(s)</span>
              </summary>
              <div class="resource-list">
                ${levelResources.length ? levelResources.map(resource => `
                  <article class="resource-card">
                    <div>
                      <span class="resource-type">${escapeHtml(resourceTypes.get(resource.tipo_recurso_id) || "Recurso")}</span>
                      <h4>${escapeHtml(resource.nome)}</h4>
                      <p class="muted">${escapeHtml(resource.descricao || "")}</p>
                    </div>
                    ${resource.url_principal ? `<a class="button button-secondary" href="${escapeAttribute(resource.url_principal)}" target="_blank" rel="noopener noreferrer">Abrir recurso</a>` : ""}
                  </article>`).join("") : '<div class="empty-state">Nenhum recurso publicado para este nível.</div>'}
              </div>
            </details>`;
        }).join("") : '<div class="empty-state">Nenhum nível publicado para esta competência.</div>'}
      </section>
    </article>`;

  document.body.appendChild(dialog);
  dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function renderTrails() {
  const trails = dataService.getAll("trilhas", { activeOnly: true });
  if (!trails.length) return renderEmpty("Nenhuma trilha oficial publicada.");
  return `<div class="metric-grid">${trails.map(trail => metric(trail.nome, "0%" )).join("")}</div>`;
}

function renderAdministration() {
  const report = dataService.getHealthReport();
  const datasets = Object.entries(report.datasets ?? {});
  const errors = datasets.reduce((sum, [, item]) => sum + item.errors.length, 0);
  const warnings = datasets.reduce((sum, [, item]) => sum + item.warnings.length, 0);

  return `
    <div class="metric-grid">
      ${metric("Versão do esquema", report.schemaVersion ?? "-")}
      ${metric("Versão dos dados", report.dataVersion ?? "-")}
      ${metric("Erros", String(errors))}
      ${metric("Avisos", String(warnings))}
    </div>
    <article class="card stack">
      <div><h3>Saúde da publicação de dados</h3><p class="muted">Cada linha representa um CSV declarado em data/manifest.json.</p></div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Dataset</th><th>Estado</th><th>Registros</th><th>Arquivo</th><th>Mensagens</th></tr></thead>
          <tbody>
            ${datasets.map(([name, item]) => `
              <tr>
                <td><strong>${escapeHtml(name)}</strong></td>
                <td><span class="status-badge status-${item.state}">${escapeHtml(item.state)}</span></td>
                <td>${item.count}</td>
                <td><code>${escapeHtml(item.path || "-")}</code></td>
                <td>${[...item.errors, ...item.warnings].map(escapeHtml).join("<br>") || "OK"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </article>`;
}

function renderProfile() {
  const user = currentUser();
  return `
    <article class="card stack">
      <div>
        <h3>${escapeHtml(user?.name ?? "Perfil")}</h3>
        <p class="muted">Perfil local: ${escapeHtml(user?.role ?? "USER")}</p>
      </div>
      <div class="data-actions">
        <button id="export-backup" class="button button-primary">Exportar backup técnico</button>
        <label class="button button-secondary" for="import-backup">Importar e substituir dados</label>
        <input id="import-backup" class="hidden" type="file" accept="application/json,.json" />
      </div>
      <p class="muted">A importação é substitutiva: apenas um backup completo deve ser importado por vez.</p>
      <p id="backup-message" class="form-message"></p>
    </article>`;
}

function bindProfileActions() {
  document.querySelector("#export-backup")?.addEventListener("click", exportTechnicalBackup);
  document.querySelector("#import-backup")?.addEventListener("change", async event => {
    const message = document.querySelector("#backup-message");
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

function categoryBar(category) {
  return `<div class="category-progress"><div><strong>${escapeHtml(category.nome)}</strong><span>0%</span></div><div class="progress-track"><span style="width:0%"></span></div></div>`;
}
function metric(label, value) {
  return `<article class="card"><span class="muted">${escapeHtml(label)}</span><strong class="metric-value">${escapeHtml(value)}</strong></article>`;
}
function renderEmpty(text) { return `<article class="card empty-state">${escapeHtml(text)}</article>`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char])); }
function escapeAttribute(value) { return escapeHtml(value); }

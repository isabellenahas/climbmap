import { currentUser } from "../core/auth.js";
import { exportTechnicalBackup, importTechnicalBackup } from "../services/backup-service.js";

export function renderRoute(route, container) {
  const renderers = {
    mapa: renderMap,
    catalogo: () => renderEmpty("O catálogo será alimentado pelas planilhas de Categoria, Domínio, Competência, Nível e Recurso."),
    trilhas: () => renderEmpty("As trilhas oficiais aparecerão aqui após a integração com a base administrativa."),
    planejamento: () => renderEmpty("O usuário poderá criar planos e adicionar competências por meio do botão “+”."),
    evolucao: () => renderEmpty("Esta primeira versão não guarda histórico temporal; a tela exibirá o retrato atual e indicadores derivados."),
    perfil: renderProfile,
    administracao: () => renderEmpty("A administração será preparada para importar a publicação manual das planilhas do Google Sheets.")
  };

  container.innerHTML = renderers[route]?.() ?? renderEmpty("Tela não encontrada.");
  if (route === "perfil") bindProfileActions();
}

function renderMap() {
  return `
    <div class="metric-grid">
      ${metric("Nível geral", "0%")}
      ${metric("Competências dominadas", "0")}
      ${metric("Recursos concluídos", "0")}
      ${metric("Em andamento", "0")}
    </div>
    <div class="section-grid">
      <article class="card">
        <h3>Mapa macro</h3>
        <p class="muted">As categorias aparecerão aqui quando a fonte administrativa for conectada.</p>
        <div class="empty-state">Nenhuma categoria publicada.</div>
      </article>
      <article class="card">
        <h3>Lacunas prioritárias</h3>
        <p class="muted">Serão calculadas a partir das menores notas nas trilhas e planejamentos selecionados.</p>
        <div class="empty-state">Nenhuma lacuna calculada.</div>
      </article>
    </div>`;
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

function metric(label, value) {
  return `<article class="card"><span class="muted">${label}</span><strong class="metric-value">${value}</strong></article>`;
}
function renderEmpty(text) { return `<article class="card empty-state">${text}</article>`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char])); }

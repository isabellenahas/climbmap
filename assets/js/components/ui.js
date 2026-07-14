/**
 * Componentes HTML reutilizáveis.
 * Mantém padrões de marcação em um único arquivo para facilitar o redesign futuro.
 */
export const ui = {
  card(content, className = "") {
    return `<article class="card ${escapeAttribute(className)}">${content}</article>`;
  },

  metric(label, value, helper = "") {
    return this.card(`
      <span class="muted">${escapeHtml(label)}</span>
      <strong class="metric-value">${escapeHtml(value)}</strong>
      ${helper ? `<small class="muted">${escapeHtml(helper)}</small>` : ""}
    `, "metric-card");
  },

  badge(text, variant = "neutral") {
    return `<span class="status-badge status-${escapeAttribute(variant)}">${escapeHtml(text)}</span>`;
  },

  progress(value, label = "") {
    const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
    return `
      <div class="progress-component" aria-label="${escapeAttribute(label || `${safeValue}%`)}">
        <div class="progress-track"><span style="width:${safeValue}%"></span></div>
        <span>${safeValue}%</span>
      </div>`;
  },

  empty(text) {
    return this.card(`<div class="empty-state">${escapeHtml(text)}</div>`);
  }
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

export function escapeAttribute(value) {
  return escapeHtml(value);
}

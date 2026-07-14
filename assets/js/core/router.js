import { eventBus } from "./event-bus.js";
import { stateManager } from "./state-manager.js";

/** Roteador por hash: permite voltar/avançar no navegador sem recarregar a aplicação. */
const titles = {
  mapa: "Meu Mapa",
  catalogo: "Catálogo",
  trilhas: "Trilhas",
  planejamento: "Planejamento",
  evolucao: "Evolução",
  perfil: "Meu Perfil",
  administracao: "Administração"
};

const allowedRoutes = new Set(Object.keys(titles));
let renderer = null;

export function initRouter(renderRoute) {
  renderer = renderRoute;

  document.querySelectorAll("[data-route]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.route));
  });

  window.addEventListener("hashchange", renderCurrentRoute);
  renderCurrentRoute();
}

export function navigate(route) {
  const safeRoute = allowedRoutes.has(route) ? route : "mapa";
  if (window.location.hash === `#/${safeRoute}`) renderCurrentRoute();
  else window.location.hash = `/${safeRoute}`;
}

function renderCurrentRoute() {
  const routeFromHash = window.location.hash.replace(/^#\/?/, "");
  const route = allowedRoutes.has(routeFromHash) ? routeFromHash : "mapa";

  stateManager.set("route", route);
  document.querySelectorAll("[data-route]").forEach(button => {
    const isActive = button.dataset.route === route;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  document.querySelector("#page-title").textContent = titles[route];
  renderer?.(route);
  eventBus.emit("route:changed", { route });
}

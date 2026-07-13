/** Roteador simples: troca a tela sem recarregar a página. */
const titles = {
  mapa: "Meu Mapa",
  catalogo: "Catálogo",
  trilhas: "Trilhas",
  planejamento: "Planejamento",
  evolucao: "Evolução",
  perfil: "Meu Perfil",
  administracao: "Administração"
};

export function initRouter(renderRoute) {
  document.querySelectorAll("[data-route]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.route, renderRoute));
  });
  navigate("mapa", renderRoute);
}

export function navigate(route, renderRoute) {
  document.querySelectorAll("[data-route]").forEach(button => button.classList.toggle("active", button.dataset.route === route));
  document.querySelector("#page-title").textContent = titles[route] ?? "Climb Map";
  renderRoute(route);
}

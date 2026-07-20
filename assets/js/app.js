import { enterProfile, currentUser, logout } from "./core/auth.js";
import { logger } from "./core/logger.js";
import { loadState, saveState } from "./core/storage.js";
import { initRouter } from "./core/router.js";
import { renderRoute } from "./modules/views.js?v=2.7.2";
import { configService } from "./services/config-service.js";
import { dataService } from "./services/data-service.js";

const entryScreen = document.querySelector("#entry-screen");
const appShell = document.querySelector("#app-shell");
const content = document.querySelector("#page-content");

initialize();

async function initialize() {
  applyTheme(loadState().preferences.theme);
  bindGlobalActions();

  const health = await dataService.initialize();
  configService.initialize();
  logger.info("Camada de dados inicializada.", health);

  const user = currentUser();
  user ? openApplication(user) : openEntry();
}

function bindGlobalActions() {
  document.querySelector("#entry-form").addEventListener("submit", event => {
    event.preventDefault();
    const message = document.querySelector("#entry-message");
    try {
      const name = document.querySelector("#profile-name").value;
      const pin = document.querySelector("#profile-pin").value;
      if (!/^\d{4,12}$/.test(pin)) throw new Error("O PIN deve conter de 4 a 12 números.");
      openApplication(enterProfile(name, pin));
    } catch (error) {
      logger.warn("Não foi possível entrar no perfil.", error);
      message.textContent = error.message;
    }
  });

  document.querySelector("#logout-button").addEventListener("click", () => { logout(); window.location.reload(); });
  document.querySelector("#theme-toggle").addEventListener("click", toggleTheme);
}

function openEntry() {
  entryScreen.classList.remove("hidden");
  appShell.classList.add("hidden");
}

function openApplication(user) {
  entryScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  document.querySelector("#current-user-name").textContent = user.name;
  document.querySelectorAll(".admin-only").forEach(item => item.classList.toggle("hidden", user.role !== "ADMIN"));
  initRouter(route => renderRoute(route, content));
}

function toggleTheme() {
  const state = loadState();
  state.preferences.theme = state.preferences.theme === "dark" ? "light" : "dark";
  saveState(state);
  applyTheme(state.preferences.theme);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

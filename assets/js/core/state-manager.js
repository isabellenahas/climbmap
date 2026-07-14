import { eventBus } from "./event-bus.js";

/**
 * Estado transitório da interface.
 * Não substitui o localStorage: guarda apenas navegação, filtros e seleções da sessão atual.
 */
class StateManager {
  constructor() {
    this.state = {
      route: "mapa",
      selectedCompetencyId: null,
      selectedTrailId: null,
      catalogFilters: {
        search: "",
        categoryId: "",
        domainId: "",
        complexityId: ""
      }
    };
  }

  get(path) {
    return path.split(".").reduce((value, key) => value?.[key], this.state);
  }

  set(path, value) {
    const keys = path.split(".");
    const lastKey = keys.pop();
    const target = keys.reduce((object, key) => {
      if (!object[key]) object[key] = {};
      return object[key];
    }, this.state);

    const previousValue = target[lastKey];
    target[lastKey] = value;
    eventBus.emit("state:changed", { path, value, previousValue });
  }

  patch(path, partialValue) {
    const currentValue = this.get(path) ?? {};
    this.set(path, { ...currentValue, ...partialValue });
  }

  snapshot() {
    return structuredClone(this.state);
  }
}

export const stateManager = new StateManager();

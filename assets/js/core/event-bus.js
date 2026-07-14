/**
 * Barramento de eventos da aplicação.
 * Módulos publicam eventos sem precisar conhecer quem irá reagir a eles.
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName).add(callback);
    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    this.listeners.get(eventName)?.delete(callback);
  }

  emit(eventName, detail = {}) {
    this.listeners.get(eventName)?.forEach(callback => callback(detail));
  }
}

export const eventBus = new EventBus();

/**
 * Logger central da aplicação.
 * Mantém as mensagens técnicas em um único lugar e permite desligá-las em produção.
 */
class Logger {
  constructor() {
    this.enabled = true;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  info(message, context) {
    if (this.enabled) console.info(`[Climb Map] ${message}`, context ?? "");
  }

  warn(message, context) {
    if (this.enabled) console.warn(`[Climb Map] ${message}`, context ?? "");
  }

  error(message, error) {
    console.error(`[Climb Map] ${message}`, error ?? "");
  }
}

export const logger = new Logger();

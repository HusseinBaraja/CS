import type { BotLogger } from './runtime';

export const createBaileysLogger = (botLogger: BotLogger) => {
  const activeLogger = typeof botLogger.child === "function"
    ? botLogger.child({ runtime: "baileys" })
    : botLogger;
  const info = activeLogger.info.bind(activeLogger);
  const error = activeLogger.error.bind(activeLogger);
  const warn = activeLogger.warn?.bind(activeLogger) ?? info;
  const debug = activeLogger.debug?.bind(activeLogger) ?? info;
  const toLogRecord = (payload: unknown): Record<string, unknown> =>
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : { value: payload };

  return {
    level: "info",
    child: () => createBaileysLogger(botLogger),
    trace: (payload: unknown, message?: string) => debug(toLogRecord(payload), message ?? "baileys trace"),
    debug: (payload: unknown, message?: string) => debug(toLogRecord(payload), message ?? "baileys debug"),
    info: (payload: unknown, message?: string) => info(toLogRecord(payload), message ?? "baileys info"),
    warn: (payload: unknown, message?: string) => warn(toLogRecord(payload), message ?? "baileys warning"),
    error: (payload: unknown, message?: string) => error(toLogRecord(payload), message ?? "baileys error"),
  };
};

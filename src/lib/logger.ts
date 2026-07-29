/**
 * Structured client logger. In production only warnings and errors are emitted,
 * and every record is shaped so it can be forwarded to an external sink
 * (Sentry, Logflare, a custom endpoint) by setting VITE_LOG_ENDPOINT.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: LogLevel = import.meta.env.DEV ? "debug" : "warn";
const LOG_ENDPOINT = import.meta.env.VITE_LOG_ENDPOINT as string | undefined;
const APP_ENV = (import.meta.env.VITE_APP_ENV as string | undefined) ?? "development";

export type LogContext = Record<string, unknown>;

type LogRecord = {
  level: LogLevel;
  message: string;
  timestamp: string;
  environment: string;
  context?: LogContext;
  error?: { name: string; message: string; stack?: string };
};

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (error === undefined || error === null) return undefined;
  return { name: "UnknownError", message: String(error) };
}

function shouldLog(level: LogLevel) {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[MIN_LEVEL];
}

function forward(record: LogRecord) {
  if (!LOG_ENDPOINT || record.level === "debug") return;
  try {
    const body = JSON.stringify(record);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(LOG_ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(LOG_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Never let logging break the app.
  }
}

function emit(level: LogLevel, message: string, error?: unknown, context?: LogContext) {
  if (!shouldLog(level)) return;

  const record: LogRecord = {
    level,
    message,
    timestamp: new Date().toISOString(),
    environment: APP_ENV,
    context,
    error: serializeError(error),
  };

  const consoleMethod = level === "debug" ? "log" : level;
  console[consoleMethod](`[${level}] ${message}`, record.context ?? "", record.error ?? "");
  forward(record);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, undefined, context),
  info: (message: string, context?: LogContext) => emit("info", message, undefined, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, undefined, context),
  error: (message: string, error?: unknown, context?: LogContext) => emit("error", message, error, context),
};

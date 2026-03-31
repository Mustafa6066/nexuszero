import { AsyncLocalStorage } from 'node:async_hooks';

// ---------------------------------------------------------------------------
// Lightweight structured logger backed by JSON output.
// Uses the native console API + JSON.stringify to avoid adding a heavy
// dependency like pino while still producing structured, machine-parseable logs.
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

interface LogContext {
  tenantId?: string;
  requestId?: string;
  traceId?: string;
  service?: string;
  [key: string]: unknown;
}

const contextStore = new AsyncLocalStorage<LogContext>();

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[currentLevel];
}

function formatLog(level: LogLevel, msg: string, data?: Record<string, unknown>): string {
  const ctx = contextStore.getStore() ?? {};
  const entry: Record<string, unknown> = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...(ctx.service && { service: ctx.service }),
    ...(ctx.tenantId && { tenantId: ctx.tenantId }),
    ...(ctx.requestId && { requestId: ctx.requestId }),
    ...(ctx.traceId && { traceId: ctx.traceId }),
    ...data,
  };
  return JSON.stringify(entry);
}

/** Create a logger with a fixed service name */
export function createLogger(service: string) {
  return {
    debug(msg: string, data?: Record<string, unknown>) {
      if (shouldLog('debug')) console.debug(formatLog('debug', msg, { service, ...data }));
    },
    info(msg: string, data?: Record<string, unknown>) {
      if (shouldLog('info')) console.info(formatLog('info', msg, { service, ...data }));
    },
    warn(msg: string, data?: Record<string, unknown>) {
      if (shouldLog('warn')) console.warn(formatLog('warn', msg, { service, ...data }));
    },
    error(msg: string, data?: Record<string, unknown>) {
      if (shouldLog('error')) console.error(formatLog('error', msg, { service, ...data }));
    },
    fatal(msg: string, data?: Record<string, unknown>) {
      if (shouldLog('fatal')) console.error(formatLog('fatal', msg, { service, ...data }));
    },
    /** Run a callback with additional log context (tenantId, requestId, etc.) */
    withContext<T>(ctx: LogContext, fn: () => T): T {
      const parentCtx = contextStore.getStore() ?? {};
      return contextStore.run({ ...parentCtx, service, ...ctx }, fn);
    },
  };
}

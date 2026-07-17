// Phase 31 · Structured logging with correlation IDs.
//
// Pure formatting helpers plus a lightweight logger that emits JSON lines
// through a pluggable sink (defaults to console). Correlation IDs let a
// single request thread be reconstructed across server functions.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  correlationId?: string;
  requestId?: string;
  errorId?: string;
  auditId?: string;
  userId?: string;
  route?: string;
};

export type LogEntry = {
  level: LogLevel;
  message: string;
  at: string;
  context: LogContext;
  data?: Record<string, unknown>;
};

export type LogSink = (entry: LogEntry) => void;

let counter = 0;

/** Deterministic-ish ID generator (crypto-random when available). */
export function newId(prefix: string, rand: () => number = Math.random): string {
  counter = (counter + 1) & 0xffff;
  const r = Math.floor(rand() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `${prefix}_${Date.now().toString(36)}${counter.toString(16)}${r}`;
}

export function newCorrelationId(rand?: () => number): string {
  return newId("cid", rand);
}
export function newRequestId(rand?: () => number): string {
  return newId("req", rand);
}
export function newErrorId(rand?: () => number): string {
  return newId("err", rand);
}
export function newAuditId(rand?: () => number): string {
  return newId("aud", rand);
}

export function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

export class StructuredLogger {
  constructor(
    private readonly baseContext: LogContext = {},
    private readonly sink: LogSink = defaultConsoleSink,
  ) {}

  child(extra: LogContext): StructuredLogger {
    return new StructuredLogger({ ...this.baseContext, ...extra }, this.sink);
  }

  log(level: LogLevel, message: string, data?: Record<string, unknown>, ctx?: LogContext): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      at: new Date().toISOString(),
      context: { ...this.baseContext, ...ctx },
      data,
    };
    this.sink(entry);
    return entry;
  }

  debug(m: string, d?: Record<string, unknown>, c?: LogContext) { return this.log("debug", m, d, c); }
  info(m: string, d?: Record<string, unknown>, c?: LogContext) { return this.log("info", m, d, c); }
  warn(m: string, d?: Record<string, unknown>, c?: LogContext) { return this.log("warn", m, d, c); }
  error(m: string, d?: Record<string, unknown>, c?: LogContext) { return this.log("error", m, d, c); }
}

function defaultConsoleSink(entry: LogEntry): void {
  const line = formatEntry(entry);
  // eslint-disable-next-line no-console
  (entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : console.log)(line);
}
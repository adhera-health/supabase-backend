/**
 * Structured JSON logger for Supabase Edge Functions (Deno).
 * Every log line is a single JSON object — easy to search in Supabase logs.
 */

import { getRequestCorrelationId } from "./correlation-context.ts";
import { isProductionEnvironment } from "./environment.ts";

export type LogLevel =
  | "debug"
  | "info"
  | "warn"
  | "error";

export type LogContext =
  Record<string, unknown>;

export interface LoggerOptions {
  /** Edge Function or module name */
  service: string;

  /** Request tracing */
  correlationId?: string;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  service: string;
  timestamp: string;
  correlationId?: string;
  context?: LogContext;
}

const LEVEL_PRIORITY: Record<
  LogLevel,
  number
> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Resolve minimum level once.
 */
function getMinLevel(): LogLevel {
  const env =
    Deno.env
      .get("LOG_LEVEL")
      ?.toLowerCase();

  if (
    env === "debug" ||
    env === "info" ||
    env === "warn" ||
    env === "error"
  ) {
    return env;
  }

  return (
    isProductionEnvironment()
      ? "info"
      : "debug"
  );
}

const MIN_LEVEL =
  getMinLevel();

function shouldLog(
  level: LogLevel,
): boolean {
  return (
    LEVEL_PRIORITY[level] >=
    LEVEL_PRIORITY[MIN_LEVEL]
  );
}

/**
 * Serialize Error objects safely.
 */
function serialize(
  value: unknown,
): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause:
        value.cause,
    };
  }

  return value;
}

/**
 * Prevent circular
 * JSON.stringify crashes.
 */
function safeStringify(
  value: unknown,
): string {
  const seen =
    new WeakSet();

  return JSON.stringify(
    value,
    (_key, val) => {
      const parsed =
        serialize(val);

      if (
        parsed &&
        typeof parsed ===
          "object"
      ) {
        if (
          seen.has(
            parsed,
          )
        ) {
          return "[Circular]";
        }

        seen.add(
          parsed,
        );
      }

      return parsed;
    },
  );
}

function write(
  entry: LogEntry,
): void {
  const line =
    safeStringify(
      entry,
    );

  switch (
    entry.level
  ) {
    case "error":
      console.error(
        line,
      );
      break;

    case "warn":
      console.warn(
        line,
      );
      break;

    default:
      console.log(
        line,
      );
  }
}

export class Logger {
  private readonly service: string;

  private readonly correlationId?: string;

  constructor(
    options: LoggerOptions,
  ) {
    this.service =
      options.service;

    this.correlationId =
      options.correlationId;

    Object.freeze(
      this,
    );
  }

  /**
   * Create child logger
   * with same service.
   */
  withCorrelation(
    correlationId: string,
  ): Logger {
    return new Logger({
      service:
        this.service,
      correlationId,
    });
  }

  debug(
    message: string,
    context?: LogContext,
  ): void {
    this.log(
      "debug",
      message,
      context,
    );
  }

  info(
    message: string,
    context?: LogContext,
  ): void {
    this.log(
      "info",
      message,
      context,
    );
  }

  warn(
    message: string,
    context?: LogContext,
  ): void {
    this.log(
      "warn",
      message,
      context,
    );
  }

  error(
    message: string,
    context?: LogContext,
  ): void {
    this.log(
      "error",
      message,
      context,
    );
  }

  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): void {
    if (
      !shouldLog(
        level,
      )
    ) {
      return;
    }

    write({
      level,
      message,
      service:
        this.service,
      timestamp:
        new Date().toISOString(),
      correlationId:
        this
          .correlationId,
      ...(context &&
      Object.keys(
        context,
      ).length > 0
        ? {
            context,
          }
        : {}),
    });
  }
}

/**
 * Convenience factory.
 * Uses explicit correlationId, else the current request context (see correlation-context.ts).
 */
export function createLogger(
  service: string,
  correlationId?: string,
): Logger {
  return new Logger({
    service,
    correlationId: correlationId ?? getRequestCorrelationId(),
  });
}
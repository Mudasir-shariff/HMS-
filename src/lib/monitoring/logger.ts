/* ──────────────────────────────────────────────────────────────
   Structured Logger & Observability
   ────────────────────────────────────────────────────────────── */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  userId?: string;
  role?: string;
  action?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

class Logger {
  private formatLog(level: LogLevel, message: string, context?: LogContext) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      environment: process.env.NODE_ENV || 'development',
      ...context,
    });
  }

  info(message: string, context?: LogContext) {
    console.info(this.formatLog('info', message, context));
  }

  warn(message: string, context?: LogContext) {
    console.warn(this.formatLog('warn', message, context));
  }

  error(message: string, error?: unknown, context?: LogContext) {
    const errorDetails = error instanceof Error
      ? { errorMessage: error.message, errorStack: error.stack }
      : { errorMessage: String(error) };

    console.error(this.formatLog('error', message, { ...context, ...errorDetails }));
  }

  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.formatLog('debug', message, context));
    }
  }
}

export const logger = new Logger();


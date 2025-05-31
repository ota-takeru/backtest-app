/**
 * 統一ログシステム
 * Worker内でのログ出力を管理し、一貫したフォーマットを提供
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  details?: any;
}

export class WorkerLogger {
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];

  constructor(
    private context: string = "Worker",
    level: LogLevel = LogLevel.INFO
  ) {
    this.logLevel = level;
  }

  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private log(level: LogLevel, message: string, details?: any): void {
    if (level < this.logLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      details,
    };

    this.logs.push(entry);

    // コンソール出力
    const formattedMessage = `[${this.context}] ${message}`;
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage, details || "");
        break;
      case LogLevel.INFO:
        console.log(formattedMessage, details || "");
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage, details || "");
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage, details || "");
        break;
    }
  }

  debug(message: string, details?: any): void {
    this.log(LogLevel.DEBUG, message, details);
  }

  info(message: string, details?: any): void {
    this.log(LogLevel.INFO, message, details);
  }

  warn(message: string, details?: any): void {
    this.log(LogLevel.WARN, message, details);
  }

  error(message: string, details?: any): void {
    this.log(LogLevel.ERROR, message, details);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  createChildLogger(context: string): WorkerLogger {
    return new WorkerLogger(`${this.context}:${context}`, this.logLevel);
  }
}

// デフォルトロガーインスタンス
export const defaultLogger = new WorkerLogger();

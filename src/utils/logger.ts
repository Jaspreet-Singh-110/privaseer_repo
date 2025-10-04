type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  error?: string;
  stack?: string;
}

interface LogStorage {
  logs: LogEntry[];
  lastCleanup: number;
}

const MAX_LOGS = 500;
const MAX_LOG_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'privaseer_logs';

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private logBuffer: LogEntry[] = [];
  private flushTimer: number | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadLogs();
      await this.cleanup();
      this.initialized = true;
      this.info('Logger', 'Logger initialized successfully');
    } catch (error) {
      console.error('[Logger] Failed to initialize:', error);
    }
  }

  private async loadLogs(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored: LogStorage = result[STORAGE_KEY];

      if (stored?.logs) {
        this.logBuffer = stored.logs.slice(-MAX_LOGS);
      }
    } catch (error) {
      console.error('[Logger] Failed to load logs:', error);
    }
  }

  private async saveLogs(): Promise<void> {
    try {
      const storage: LogStorage = {
        logs: this.logBuffer.slice(-MAX_LOGS),
        lastCleanup: Date.now(),
      };

      await chrome.storage.local.set({ [STORAGE_KEY]: storage });
    } catch (error) {
      console.error('[Logger] Failed to save logs:', error);
    }
  }

  private async cleanup(): Promise<void> {
    const cutoff = Date.now() - MAX_LOG_AGE_MS;
    this.logBuffer = this.logBuffer.filter(log => log.timestamp > cutoff);
    await this.saveLogs();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = window.setTimeout(() => {
      this.saveLogs();
      this.flushTimer = null;
    }, 5000);
  }

  private createLogEntry(
    level: LogLevel,
    category: string,
    message: string,
    data?: any,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
    };

    if (data !== undefined) {
      entry.data = data;
    }

    if (error instanceof Error) {
      entry.error = error.message;
      entry.stack = error.stack;
    }

    return entry;
  }

  private writeLog(entry: LogEntry): void {
    this.logBuffer.push(entry);

    if (this.logBuffer.length > MAX_LOGS) {
      this.logBuffer.shift();
    }

    this.scheduleFlush();

    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[Privaseer ${entry.level.toUpperCase()}] [${entry.category}] ${timestamp}`;

    switch (entry.level) {
      case 'debug':
        if (this.isDevelopment) {
          console.debug(prefix, entry.message, entry.data || '');
        }
        break;
      case 'info':
        console.log(prefix, entry.message, entry.data || '');
        break;
      case 'warn':
        console.warn(prefix, entry.message, entry.data || '');
        break;
      case 'error':
        console.error(prefix, entry.message, entry.error || '', entry.stack || '');
        break;
    }
  }

  debug(category: string, message: string, data?: any): void {
    const entry = this.createLogEntry('debug', category, message, data);
    this.writeLog(entry);
  }

  info(category: string, message: string, data?: any): void {
    const entry = this.createLogEntry('info', category, message, data);
    this.writeLog(entry);
  }

  warn(category: string, message: string, data?: any): void {
    const entry = this.createLogEntry('warn', category, message, data);
    this.writeLog(entry);
  }

  error(category: string, message: string, error?: Error | unknown, data?: any): void {
    const errorObj = error instanceof Error ? error : undefined;
    const entry = this.createLogEntry('error', category, message, data, errorObj);
    this.writeLog(entry);
  }

  async getLogs(level?: LogLevel, category?: string, limit = 100): Promise<LogEntry[]> {
    let logs = [...this.logBuffer];

    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    if (category) {
      logs = logs.filter(log => log.category === category);
    }

    return logs.slice(-limit).reverse();
  }

  async clearLogs(): Promise<void> {
    this.logBuffer = [];
    await this.saveLogs();
    this.info('Logger', 'Logs cleared');
  }

  async exportLogs(): Promise<string> {
    return JSON.stringify({
      exportDate: new Date().toISOString(),
      version: '2.0.0',
      logs: this.logBuffer,
    }, null, 2);
  }

  getStats(): { total: number; byLevel: Record<LogLevel, number> } {
    const stats = {
      total: this.logBuffer.length,
      byLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
      } as Record<LogLevel, number>,
    };

    for (const log of this.logBuffer) {
      stats.byLevel[log.level]++;
    }

    return stats;
  }
}

export const logger = new Logger();

export type { LogLevel, LogEntry };

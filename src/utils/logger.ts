type LogLevel = 'info' | 'warn' | 'error';

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.isDevelopment && level === 'info') return;

    const timestamp = new Date().toISOString();
    const prefix = `[Privaseer ${timestamp}]`;

    switch (level) {
      case 'info':
        console.log(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'error':
        console.error(prefix, message, ...args);
        break;
    }
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, error?: Error | unknown, ...args: any[]): void {
    if (error instanceof Error) {
      this.log('error', message, error.message, error.stack, ...args);
    } else {
      this.log('error', message, error, ...args);
    }
  }
}

export const logger = new Logger();

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
const threshold = LEVELS[configured] ?? LEVELS.info;

function emit(level: Level, message: string, meta?: unknown): void {
  if (LEVELS[level] < threshold) return;
  const stamp = new Date().toISOString();
  const prefix = `${stamp} [${level.toUpperCase().padEnd(5)}]`;
  if (meta === undefined) {
    console.log(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`, meta);
  }
}

export const log = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};

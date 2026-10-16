import fs from 'node:fs';
import path from 'node:path';

/**
 * Log fields must never contain user content (titles, notes, profile names, file paths
 * chosen by the user). Use IDs, counts, and error codes instead.
 */
export type LogFields = Record<string, string | number | boolean | null>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, error?: unknown, fields?: LogFields): void;
}

export const nullLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface FileLoggerOptions {
  maxBytes?: number;
  maxFiles?: number;
  clock?: () => Date;
}

/**
 * Error messages can embed user content (e.g. values in a constraint message), so only the
 * error name, code, and stack frames are logged. The cause chain is followed one level.
 */
function describeError(error: unknown): LogFields {
  if (!(error instanceof Error)) return { errorName: typeof error };
  const code = 'code' in error && typeof error.code === 'string' ? error.code : null;
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
    .join('\n');
  const fields: LogFields = { errorName: error.name, errorCode: code, errorStack: frames || null };
  if (error.cause instanceof Error) {
    const causeCode =
      'code' in error.cause && typeof error.cause.code === 'string' ? error.cause.code : null;
    fields['causeName'] = error.cause.name;
    fields['causeCode'] = causeCode;
  }
  return fields;
}

/** Appends JSON lines to `<dir>/main.log`, rotating to main.1.log … main.N.log by size. */
export function createFileLogger(dir: string, options: FileLoggerOptions = {}): Logger {
  const maxBytes = options.maxBytes ?? 1_000_000;
  const maxFiles = options.maxFiles ?? 3;
  const clock = options.clock ?? (() => new Date());
  const file = path.join(dir, 'main.log');
  fs.mkdirSync(dir, { recursive: true });

  const rotateIfNeeded = () => {
    let size: number;
    try {
      size = fs.statSync(file).size;
    } catch {
      return;
    }
    if (size < maxBytes) return;
    for (let i = maxFiles - 1; i >= 1; i--) {
      const from = path.join(dir, `main.${i}.log`);
      if (fs.existsSync(from)) fs.renameSync(from, path.join(dir, `main.${i + 1}.log`));
    }
    fs.renameSync(file, path.join(dir, 'main.1.log'));
    const overflow = path.join(dir, `main.${maxFiles + 1}.log`);
    if (fs.existsSync(overflow)) fs.rmSync(overflow);
  };

  const write = (level: string, event: string, fields: LogFields) => {
    try {
      rotateIfNeeded();
      const line = JSON.stringify({ ts: clock().toISOString(), level, event, ...fields });
      fs.appendFileSync(file, line + '\n', 'utf8');
    } catch (error) {
      // Logging must never crash the app; surface the failure on stderr instead.
      console.error('Failed to write log entry', error);
    }
  };

  return {
    info: (event, fields = {}) => write('info', event, fields),
    warn: (event, fields = {}) => write('warn', event, fields),
    error: (event, error, fields = {}) =>
      write('error', event, { ...fields, ...(error === undefined ? {} : describeError(error)) }),
  };
}

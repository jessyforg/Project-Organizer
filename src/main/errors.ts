import type { AppErrorCode } from '@shared/result';

/** An expected failure whose message is safe to show to the user. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { details?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.details = options?.details;
  }
}

/** SQLite errors carry a string code such as `SQLITE_CONSTRAINT_UNIQUE`. */
export function sqliteErrorCode(error: unknown): string | undefined {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

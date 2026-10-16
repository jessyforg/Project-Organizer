export const APP_ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'DEPENDENCY_CYCLE',
  'FORBIDDEN_SENDER',
  'DB_INTEGRITY',
  'DB_NEWER_VERSION',
  'MIGRATION_FAILED',
  'IO_ERROR',
  'UNEXPECTED',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export interface AppErrorInfo {
  code: AppErrorCode;
  message: string;
  details?: unknown;
}

/** Every IPC call resolves to a Result; IPC handlers never reject. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppErrorInfo };

import type { Db } from '../db/connection';
import { localIsoDate } from '../domain/dates';
import { AppError, sqliteErrorCode } from '../errors';

/** Everything a profile service needs; the clock and ID source are injectable for tests. */
export interface ServiceContext {
  db: Db;
  clock: () => Date;
  newId: () => string;
}

export function nowIso(ctx: ServiceContext): string {
  return ctx.clock().toISOString();
}

export function today(ctx: ServiceContext): string {
  return localIsoDate(ctx.clock());
}

export function notFound(what: string): AppError {
  return new AppError('NOT_FOUND', `${what} not found.`);
}

/** Runs a write and converts a unique-constraint failure into a user-facing conflict. */
export function withUniqueName<T>(message: string, write: () => T): T {
  try {
    return write();
  } catch (error) {
    if (sqliteErrorCode(error) === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new AppError('CONFLICT', message, { cause: error });
    }
    throw error;
  }
}

/** `?, ?, ?` for an IN (...) list. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

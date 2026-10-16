import Database from 'better-sqlite3-multiple-ciphers';
import { AppError, sqliteErrorCode } from '../errors';

export type Db = Database.Database;

const UNREADABLE_CODES = new Set(['SQLITE_NOTADB', 'SQLITE_CORRUPT', 'SQLITE_CANTOPEN']);

/**
 * Converts a copy made with the backup API (which inherits WAL mode) into a single
 * self-contained file, so snapshots and backups never depend on -wal/-shm side files.
 */
export function makeStandalone(file: string): void {
  const db = new Database(file, { fileMustExist: true });
  try {
    db.pragma('journal_mode = DELETE');
  } finally {
    db.close();
  }
}

/**
 * Opens a database with the project's required pragmas and verifies its integrity.
 * A damaged file is reported, never replaced or reset.
 */
export function openDatabase(file: string, options: { readonly?: boolean } = {}): Db {
  const readonly = options.readonly ?? false;
  let db: Db;
  try {
    db = new Database(file, { readonly, fileMustExist: readonly });
  } catch (error) {
    throw new AppError('IO_ERROR', 'The database file could not be opened.', { cause: error });
  }

  try {
    if (!readonly) {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL');
    }
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new AppError('DB_INTEGRITY', 'Foreign key enforcement could not be enabled.');
    }
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new AppError('DB_INTEGRITY', 'The database failed its integrity check.');
    }
    const violations = db.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new AppError('DB_INTEGRITY', 'The database contains broken references.', {
        details: { violations: violations.length },
      });
    }
    return db;
  } catch (error) {
    db.close();
    if (error instanceof AppError) throw error;
    const code = sqliteErrorCode(error);
    if (code !== undefined && UNREADABLE_CODES.has(code)) {
      throw new AppError('DB_INTEGRITY', 'The database file is damaged or is not a database.', {
        cause: error,
      });
    }
    throw error;
  }
}

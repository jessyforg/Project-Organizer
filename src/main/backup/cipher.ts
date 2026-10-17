import Database from 'better-sqlite3-multiple-ciphers';
import type { Db } from '../db/connection';
import { AppError, sqliteErrorCode } from '../errors';

/**
 * SQLCipher v4-compatible settings (ADR-0006). Only constant strings go into pragmas;
 * passwords are passed as bytes through the driver's key()/rekey() methods, never as SQL text.
 */
function useSqlCipher(db: Db): void {
  db.pragma("cipher = 'sqlcipher'");
  db.pragma('legacy = 4');
}

const toKey = (password: string) => Buffer.from(password, 'utf8');

/** Opens an encrypted database. A wrong password and a damaged file look the same by design. */
export function openEncrypted(file: string, password: string): Db {
  const db = new Database(file, { fileMustExist: true });
  try {
    useSqlCipher(db);
    db.key(toKey(password));
    db.prepare('SELECT count(*) FROM sqlite_master').get();
    return db;
  } catch (error) {
    db.close();
    const code = sqliteErrorCode(error);
    if (code === 'SQLITE_NOTADB' || code === 'SQLITE_CORRUPT') {
      throw new AppError(
        'BACKUP_WRONG_PASSWORD_OR_DAMAGED',
        'The password is wrong or the backup file is damaged.',
        { cause: error },
      );
    }
    throw error;
  }
}

/** Encrypts a plain, self-contained database file in place. */
export function encryptInPlace(file: string, password: string): void {
  const db = new Database(file, { fileMustExist: true });
  try {
    useSqlCipher(db);
    db.rekey(toKey(password));
  } finally {
    db.close();
  }
}

/** Removes encryption from a database file in place. */
export function decryptInPlace(file: string, password: string): void {
  const db = openEncrypted(file, password);
  try {
    db.rekey(Buffer.alloc(0));
  } finally {
    db.close();
  }
}

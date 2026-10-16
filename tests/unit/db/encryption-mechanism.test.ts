import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { describe, expect, it } from 'vitest';
import { makeStandalone, openDatabase } from '../../../src/main/db/connection';
import { tempDir } from '../helpers';

/**
 * Guards the mechanism ADR-0006 depends on (SQLCipher v4 via SQLite3MultipleCiphers).
 * The real backup service arrives in Phase 5; this test fails early if a driver
 * upgrade changes the behaviour.
 */
const MARKER = 'PLAINTEXT_MARKER_7f3a';
const PASSWORD = 'correct horse battery';

function keyed(file: string, password: string) {
  const db = new Database(file, { fileMustExist: true });
  db.pragma(`cipher='sqlcipher'`);
  db.pragma('legacy=4');
  db.pragma(`key='${password}'`);
  return db;
}

async function encryptedCopy(): Promise<string> {
  const dir = tempDir();
  const live = openDatabase(path.join(dir, 'live.db'));
  live.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT) STRICT');
  const insert = live.prepare('INSERT INTO t (body) VALUES (?)');
  live.transaction(() => {
    for (let i = 0; i < 500; i++) insert.run(`${MARKER} ${i}`);
  })();
  const staged = path.join(dir, 'staged.db');
  await live.backup(staged);
  live.close();

  makeStandalone(staged);
  const db = new Database(staged, { fileMustExist: true });
  db.pragma(`cipher='sqlcipher'`);
  db.pragma('legacy=4');
  db.pragma(`rekey='${PASSWORD}'`);
  db.close();
  return staged;
}

describe('backup encryption mechanism (ADR-0006)', () => {
  it('produces a file with no plaintext and no SQLite header', async () => {
    const raw = fs.readFileSync(await encryptedCopy());
    expect(raw.includes(Buffer.from(MARKER))).toBe(false);
    expect(raw.subarray(0, 15).toString()).not.toBe('SQLite format 3');
  });

  it('reopens with the password, passes integrity check, and uses SQLCipher v4 key derivation', async () => {
    const db = keyed(await encryptedCopy(), PASSWORD);
    try {
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(db.prepare('SELECT count(*) AS n FROM t').get()).toEqual({ n: 500 });
      expect(String(db.pragma('kdf_iter', { simple: true }))).toBe('256000');
    } finally {
      db.close();
    }
  });

  it('rejects a wrong password', async () => {
    const db = keyed(await encryptedCopy(), 'wrong password');
    try {
      expect(() => db.prepare('SELECT count(*) FROM t').get()).toThrow(
        expect.objectContaining({ code: 'SQLITE_NOTADB' }),
      );
    } finally {
      db.close();
    }
  });

  it('rejects a truncated file', async () => {
    const file = await encryptedCopy();
    const raw = fs.readFileSync(file);
    fs.writeFileSync(file, raw.subarray(0, Math.floor(raw.length / 2)));
    const db = keyed(file, PASSWORD);
    try {
      expect(() => db.pragma('integrity_check', { simple: true })).toThrow(
        expect.objectContaining({ code: 'SQLITE_CORRUPT' }),
      );
    } finally {
      db.close();
    }
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/db/connection';
import { AppError } from '../../../src/main/errors';
import { tempDir } from '../helpers';

describe('openDatabase', () => {
  it('enables foreign keys, WAL, and full synchronous mode', () => {
    const db = openDatabase(path.join(tempDir(), 'a.db'));
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('synchronous', { simple: true })).toBe(2);
    db.close();
  });

  it('enforces foreign keys', () => {
    const db = openDatabase(path.join(tempDir(), 'a.db'));
    db.exec(`CREATE TABLE parent (id INTEGER PRIMARY KEY);
             CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));`);
    expect(() => db.prepare('INSERT INTO child (parent_id) VALUES (99)').run()).toThrow(
      /FOREIGN KEY/,
    );
    db.close();
  });

  it('reports a non-database file as damaged and leaves it untouched', () => {
    const file = path.join(tempDir(), 'garbage.db');
    const garbage = Buffer.alloc(8192, 7);
    fs.writeFileSync(file, garbage);
    expect(() => openDatabase(file)).toThrow(AppError);
    try {
      openDatabase(file);
    } catch (error) {
      expect((error as AppError).code).toBe('DB_INTEGRITY');
    }
    expect(fs.readFileSync(file).equals(garbage)).toBe(true);
  });

  it('reports existing broken references', () => {
    const file = path.join(tempDir(), 'broken.db');
    const setup = openDatabase(file);
    setup.exec(`CREATE TABLE parent (id INTEGER PRIMARY KEY);
                CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));`);
    setup.pragma('foreign_keys = OFF');
    setup.prepare('INSERT INTO child (parent_id) VALUES (42)').run();
    setup.close();
    expect(() => openDatabase(file)).toThrow(/broken references/);
  });
});

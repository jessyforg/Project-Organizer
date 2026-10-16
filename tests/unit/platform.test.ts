import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileLogger } from '../../src/main/platform/logger';
import { createAppPaths, resolveDataRoot } from '../../src/main/platform/paths';
import { tempDir } from './helpers';

describe('resolveDataRoot', () => {
  const base = { appDataDir: 'C:\\Users\\u\\AppData\\Roaming', productName: 'ProjectForge' };

  it('uses a separate folder for development builds', () => {
    expect(resolveDataRoot({ ...base, isPackaged: true })).toBe(
      path.join(base.appDataDir, 'ProjectForge'),
    );
    expect(resolveDataRoot({ ...base, isPackaged: false })).toBe(
      path.join(base.appDataDir, 'ProjectForge-dev'),
    );
  });

  it('ignores the override in packaged builds', () => {
    expect(resolveDataRoot({ ...base, isPackaged: true, overrideDir: 'D:\\elsewhere' })).toBe(
      path.join(base.appDataDir, 'ProjectForge'),
    );
  });
});

describe('createAppPaths', () => {
  it('rejects profile IDs that could escape the profiles directory', () => {
    const paths = createAppPaths('/data');
    expect(() => paths.profileDir('../../Windows')).toThrow();
    expect(() => paths.profileDir('6f1c2a7e-4b8d-4c1e-9a3f-2d5e6b7c8d9e')).not.toThrow();
  });
});

describe('createFileLogger', () => {
  it('writes JSON lines and rotates by size', () => {
    const dir = tempDir();
    const logger = createFileLogger(dir, { maxBytes: 200, maxFiles: 2 });
    for (let i = 0; i < 20; i++) logger.info('test.event', { i });
    const files = fs.readdirSync(dir).sort();
    expect(files).toEqual(['main.1.log', 'main.2.log', 'main.log']);
    const first = fs.readFileSync(path.join(dir, 'main.log'), 'utf8').trim().split('\n')[0]!;
    expect(JSON.parse(first)).toMatchObject({ level: 'info', event: 'test.event' });
  });

  it('records error type and code but not the error message', () => {
    const dir = tempDir();
    const logger = createFileLogger(dir);
    const cause = Object.assign(new Error('UNIQUE failed: "My Secret Project"'), {
      code: 'SQLITE_X',
    });
    const error = new Error('wrapper with "Secret Note"', { cause });
    logger.error('op.failed', error);
    const entry = JSON.parse(fs.readFileSync(path.join(dir, 'main.log'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(entry).toMatchObject({ errorName: 'Error', causeCode: 'SQLITE_X' });
    expect(entry['errorStack']).toMatch(/^\s+at /);
    expect(JSON.stringify(entry)).not.toMatch(/Secret/);
  });
});

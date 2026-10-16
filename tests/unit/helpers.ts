import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

const created: string[] = [];

/** A fresh temporary directory, removed after each test. Never the real data folder. */
export function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-test-'));
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A controllable clock that advances one second per call. */
export function fakeClock(start = '2026-01-01T00:00:00.000Z'): () => Date {
  let t = new Date(start).getTime();
  return () => {
    const now = new Date(t);
    t += 1000;
    return now;
  };
}

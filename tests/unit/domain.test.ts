import { describe, expect, it } from 'vitest';
import { addDays, localIsoDate } from '../../src/main/domain/dates';
import { toFtsQuery } from '../../src/main/domain/fts';
import { computeProgress, type ProgressTask } from '../../src/main/domain/progress';
import { evenlySpacedKeys, keyAfter, keyBetween } from '../../src/main/domain/sort-keys';
import { nameKey } from '../../src/main/domain/text';
import { isoDateSchema } from '../../src/shared/schemas';

const t = (id: string, category: ProgressTask['category'], parentTaskId: string | null = null) => ({
  id,
  parentTaskId,
  category,
});

describe('computeProgress', () => {
  it('is undefined (null) with no tasks, not 0% or 100%', () => {
    expect(computeProgress([])).toEqual({ done: 0, total: 0, ratio: null });
  });

  it('is undefined when every task is cancelled', () => {
    expect(computeProgress([t('a', 'cancelled'), t('b', 'cancelled')]).ratio).toBeNull();
  });

  it('counts done over non-cancelled leaves', () => {
    expect(
      computeProgress([t('a', 'done'), t('b', 'todo'), t('c', 'cancelled'), t('d', 'in_progress')]),
    ).toEqual({
      done: 1,
      total: 3,
      ratio: 1 / 3,
    });
  });

  it('replaces a parent with its subtasks and ignores the parent status', () => {
    const tasks = [
      t('parent', 'done'),
      t('s1', 'done', 'parent'),
      t('s2', 'todo', 'parent'),
      t('other', 'todo'),
    ];
    expect(computeProgress(tasks)).toEqual({ done: 1, total: 3, ratio: 1 / 3 });
  });

  it('never double-counts a parent and its subtasks', () => {
    const tasks = [t('p', 'done'), t('s', 'done', 'p')];
    expect(computeProgress(tasks)).toEqual({ done: 1, total: 1, ratio: 1 });
  });

  it('counts a parent whose subtasks are all cancelled as nothing', () => {
    expect(computeProgress([t('p', 'todo'), t('s', 'cancelled', 'p')]).ratio).toBeNull();
  });

  it('is deterministic regardless of input order', () => {
    const tasks = [t('s', 'done', 'p'), t('p', 'todo'), t('x', 'todo')];
    expect(computeProgress(tasks)).toEqual(computeProgress([...tasks].reverse()));
  });
});

describe('toFtsQuery', () => {
  it('quotes every word as a prefix term', () => {
    expect(toFtsQuery('fix login')).toBe('"fix"* "login"*');
  });

  it.each(['"', '   ', ''])('returns null for %j', (input) => {
    expect(toFtsQuery(input)).toBeNull();
  });

  it('neutralises FTS operators and quotes', () => {
    expect(toFtsQuery('a" OR b* NEAR(c) -d')).toBe('"a"* "OR"* "b*"* "NEAR(c)"* "-d"*');
  });

  it('caps the number of terms', () => {
    expect(
      toFtsQuery(Array.from({ length: 30 }, (_, i) => `w${i}`).join(' '))?.split(' '),
    ).toHaveLength(10);
  });
});

describe('sort keys', () => {
  it('appends with a gap and finds a midpoint', () => {
    expect(keyAfter(null)).toBe(1024);
    expect(keyAfter(2048)).toBe(3072);
    expect(keyBetween(1024, 2048)).toBe(1536);
    expect(keyBetween(null, 1024)).toBe(512);
  });

  it('reports no room between adjacent keys', () => {
    expect(keyBetween(5, 6)).toBeNull();
    expect(keyBetween(null, 1)).toBeNull();
  });

  it('spaces keys evenly', () => {
    expect(evenlySpacedKeys(3)).toEqual([1024, 2048, 3072]);
  });
});

describe('dates', () => {
  it('formats the local calendar date', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('adds days across month, year, and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-08', 7)).toBe('2026-03-15');
  });

  it.each(['2026-02-30', '2026-13-01', '26-01-01', '2026-1-1', '2026-01-01T00:00'])(
    'rejects invalid date %s',
    (value) => {
      expect(isoDateSchema.safeParse(value).success).toBe(false);
    },
  );

  it('accepts a leap day', () => {
    expect(isoDateSchema.safeParse('2028-02-29').success).toBe(true);
  });
});

describe('nameKey', () => {
  it('folds case including non-ASCII letters and trims', () => {
    expect(nameKey('  Ñora ')).toBe(nameKey('ñORA'));
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCENTS, SURFACES } from '../../src/shared/domain';
import { paletteTokens, type Mode } from '../../src/shared/palettes';

const TOKENS_CSS = fs.readFileSync(
  path.resolve(__dirname, '../../src/renderer/styles/tokens.css'),
  'utf8',
);

/** The custom properties declared in the first CSS block that starts with `selector`. */
function block(selector: string): Record<string, string> {
  const start = TOKENS_CSS.indexOf(`${selector} {`);
  const body = TOKENS_CSS.slice(start, TOKENS_CSS.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

const BASE: Record<Mode, Record<string, string>> = {
  light: block(':root'),
  dark: block(":root[data-theme='dark']"),
};

/** WCAG 2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) =>
    [0, 2, 4]
      .map((i) => Number.parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACE_TOKENS = [
  '--bg',
  '--surface',
  '--surface-raised',
  '--surface-hover',
  '--surface-sunken',
];
const INK_TOKENS = ['--ink', '--ink-muted', '--ink-faint'];

describe('Colour palettes (ADR-0015)', () => {
  it.each(['light', 'dark'] as const)(
    'blue and cool repeat the %s defaults in tokens.css',
    (mode) => {
      for (const [name, value] of Object.entries(paletteTokens('blue', 'cool', mode))) {
        expect([name, BASE[mode][name]]).toEqual([name, value]);
      }
    },
  );

  const combinations = (['light', 'dark'] as const).flatMap((mode) =>
    ACCENTS.flatMap((accent) => SURFACES.map((surface) => [mode, accent, surface] as const)),
  );

  it.each(combinations)('%s, %s, %s: all text reaches 4.5:1', (mode, accent, surface) => {
    const t = { ...BASE[mode], ...paletteTokens(accent, surface, mode) };
    const failures: string[] = [];
    const check = (fg: string, bg: string) => {
      const ratio = contrast(t[fg]!, t[bg]!);
      if (ratio < 4.5) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
    };
    for (const bg of [...SURFACE_TOKENS, '--accent-soft']) {
      for (const fg of [...INK_TOKENS, '--accent-text']) check(fg, bg);
    }
    check('--accent-ink', '--accent');
    check('--accent-ink', '--accent-hover');
    expect(failures).toEqual([]);
  });
});

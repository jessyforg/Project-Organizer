import type { Accent, Surface } from './domain';

/**
 * Colour palettes (ADR-0015). The primary colour sets the accent tokens; the secondary colour
 * sets the tone of backgrounds and surfaces. Blue and cool repeat the defaults in tokens.css (a
 * test keeps them equal), and every combination is checked for WCAG contrast in light and dark.
 */
export type Mode = 'light' | 'dark';
type Tokens = Record<string, string>;

/** `focus-ring` is built from the accent, so it is derived rather than listed. */
interface AccentPalette {
  accent: string;
  hover: string;
  ink: string;
  soft: string;
  text: string;
}

export const ACCENT_PALETTES: Record<Accent, Record<Mode, AccentPalette>> = {
  blue: {
    light: {
      accent: '#2a5aa6',
      hover: '#234d8f',
      ink: '#ffffff',
      soft: '#e7eefa',
      text: '#24508f',
    },
    dark: { accent: '#7ea4e6', hover: '#9ab8ee', ink: '#0f1622', soft: '#22304a', text: '#a9c3f0' },
  },
  teal: {
    light: {
      accent: '#0e7068',
      hover: '#0b5c55',
      ink: '#ffffff',
      soft: '#e1f2ef',
      text: '#0b5f58',
    },
    dark: { accent: '#5cc4b8', hover: '#7ad3c9', ink: '#071a18', soft: '#163632', text: '#8fdcd2' },
  },
  green: {
    light: {
      accent: '#2e7340',
      hover: '#255f34',
      ink: '#ffffff',
      soft: '#e4f2e7',
      text: '#26633a',
    },
    dark: { accent: '#79c58f', hover: '#96d3a8', ink: '#0b1a10', soft: '#1b3524', text: '#a4dab3' },
  },
  violet: {
    light: {
      accent: '#6a42c2',
      hover: '#5935a8',
      ink: '#ffffff',
      soft: '#eee9fa',
      text: '#5b38a8',
    },
    dark: { accent: '#ab92ec', hover: '#bfaaf1', ink: '#160f27', soft: '#2c2447', text: '#c6b5f4' },
  },
  rose: {
    light: {
      accent: '#b42a55',
      hover: '#982246',
      ink: '#ffffff',
      soft: '#fbe8ee',
      text: '#9c2449',
    },
    dark: { accent: '#ee8aa6', hover: '#f3a5bb', ink: '#250f17', soft: '#3d1f2a', text: '#f5b4c6' },
  },
  amber: {
    light: {
      accent: '#9a5a06',
      hover: '#824c05',
      ink: '#ffffff',
      soft: '#fbefdb',
      text: '#85500a',
    },
    dark: { accent: '#e2ad5b', hover: '#ebc07d', ink: '#221605', soft: '#3a2c14', text: '#efc98d' },
  },
};

export const SURFACE_PALETTES: Record<Surface, Record<Mode, Tokens>> = {
  cool: {
    light: {
      '--bg': '#f4f5f7',
      '--surface': '#ffffff',
      '--surface-raised': '#ffffff',
      '--surface-hover': '#f0f2f5',
      '--surface-sunken': '#e9ecf0',
      '--track': '#e3e7ec',
      '--line': '#e1e4e9',
      '--line-strong': '#c6ccd5',
    },
    dark: {
      '--bg': '#14171c',
      '--surface': '#1b1f26',
      '--surface-raised': '#222731',
      '--surface-hover': '#252b35',
      '--surface-sunken': '#11141a',
      '--track': '#313845',
      '--line': '#2c323c',
      '--line-strong': '#434b58',
    },
  },
  neutral: {
    light: {
      '--bg': '#f5f5f5',
      '--surface': '#ffffff',
      '--surface-raised': '#ffffff',
      '--surface-hover': '#f0f0f0',
      '--surface-sunken': '#ebebeb',
      '--track': '#e4e4e4',
      '--line': '#e2e2e2',
      '--line-strong': '#c8c8c8',
    },
    dark: {
      '--bg': '#161616',
      '--surface': '#1d1d1d',
      '--surface-raised': '#242424',
      '--surface-hover': '#282828',
      '--surface-sunken': '#121212',
      '--track': '#363636',
      '--line': '#2f2f2f',
      '--line-strong': '#474747',
    },
  },
  warm: {
    light: {
      '--bg': '#f6f4f0',
      '--surface': '#fffdfa',
      '--surface-raised': '#fffdfa',
      '--surface-hover': '#f3efe9',
      '--surface-sunken': '#ece7df',
      '--track': '#e6e0d6',
      '--line': '#e5dfd6',
      '--line-strong': '#cdc4b6',
    },
    dark: {
      '--bg': '#191613',
      '--surface': '#201c18',
      '--surface-raised': '#28231e',
      '--surface-hover': '#2b2621',
      '--surface-sunken': '#14110e',
      '--track': '#3a332b',
      '--line': '#332d27',
      '--line-strong': '#4b433a',
    },
  },
};

/** "#2a5aa6" → "42 90 166", for rgb() with an alpha. */
function channels(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
}

/** Every custom property the palettes set, for one mode. */
export function paletteTokens(accent: Accent, surface: Surface, mode: Mode): Tokens {
  const a = ACCENT_PALETTES[accent][mode];
  return {
    ...SURFACE_PALETTES[surface][mode],
    '--accent': a.accent,
    '--accent-hover': a.hover,
    '--accent-ink': a.ink,
    '--accent-soft': a.soft,
    '--accent-text': a.text,
    // Focus matches the defaults in tokens.css: the accent in light, its lighter hover in dark.
    '--focus': mode === 'light' ? a.accent : a.hover,
    '--focus-ring': `0 0 0 3px rgb(${channels(a.accent)} / ${mode === 'light' ? 22 : 28}%)`,
  };
}

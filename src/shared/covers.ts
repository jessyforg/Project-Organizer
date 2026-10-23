import type { ColorToken } from './domain';

/**
 * Cover presets (ADR-0019): one plain colour per colour token, and gradients of two tokens.
 * Stored as `preset:<name>`; an image cover is `image:<attachment id>`.
 */
export const COVER_GRADIENTS = {
  dawn: ['pink', 'orange'],
  ocean: ['blue', 'teal'],
  forest: ['green', 'teal'],
  dusk: ['indigo', 'violet'],
  ember: ['red', 'amber'],
  sky: ['slate', 'blue'],
} as const satisfies Record<string, readonly [ColorToken, ColorToken]>;

const PLAIN = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'violet',
  'pink',
] as const satisfies readonly ColorToken[];

export type CoverPreset = (typeof PLAIN)[number] | keyof typeof COVER_GRADIENTS;

export const COVER_PRESETS: readonly CoverPreset[] = [
  ...PLAIN,
  ...(Object.keys(COVER_GRADIENTS) as (keyof typeof COVER_GRADIENTS)[]),
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Cover =
  { kind: 'preset'; preset: CoverPreset } | { kind: 'image'; attachmentId: string };

/** What a stored cover means, or null when it is not a valid cover. */
export function parseCover(value: string | null): Cover | null {
  if (value === null) return null;
  if (value.startsWith('preset:')) {
    const preset = value.slice('preset:'.length) as CoverPreset;
    return COVER_PRESETS.includes(preset) ? { kind: 'preset', preset } : null;
  }
  if (value.startsWith('image:')) {
    const id = value.slice('image:'.length);
    return UUID.test(id) ? { kind: 'image', attachmentId: id.toLowerCase() } : null;
  }
  return null;
}

export function coverValue(cover: Cover): string {
  return cover.kind === 'preset' ? `preset:${cover.preset}` : `image:${cover.attachmentId}`;
}

/** The two colours a preset is drawn with (plain colours use one twice). */
export function coverColors(preset: CoverPreset): readonly [ColorToken, ColorToken] {
  return preset in COVER_GRADIENTS
    ? COVER_GRADIENTS[preset as keyof typeof COVER_GRADIENTS]
    : [preset as ColorToken, preset as ColorToken];
}

export const COVER_LABEL: Record<CoverPreset, string> = {
  slate: 'Slate',
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  indigo: 'Indigo',
  violet: 'Violet',
  pink: 'Pink',
  dawn: 'Dawn gradient',
  ocean: 'Ocean gradient',
  forest: 'Forest gradient',
  dusk: 'Dusk gradient',
  ember: 'Ember gradient',
  sky: 'Sky gradient',
};

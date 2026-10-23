/**
 * The built-in icons for projects and notes (ADR-0019): 30 emoji and 30 lucide icons, stored as
 * `emoji:<character>` or `lucide:<name>`. Nothing is fetched; anything else is refused.
 */
export const EMOJI_ICONS = [
  ['📌', 'Pin'],
  ['⭐', 'Star'],
  ['🚀', 'Rocket'],
  ['🎯', 'Target'],
  ['💡', 'Idea'],
  ['📚', 'Books'],
  ['📝', 'Memo'],
  ['📅', 'Calendar'],
  ['📊', 'Bar chart'],
  ['📈', 'Growth'],
  ['🧪', 'Experiment'],
  ['🛠️', 'Tools'],
  ['🐛', 'Bug'],
  ['🎨', 'Art'],
  ['🎵', 'Music'],
  ['🏠', 'Home'],
  ['💼', 'Work'],
  ['💰', 'Money'],
  ['🛒', 'Shopping'],
  ['✈️', 'Travel'],
  ['🌱', 'Seedling'],
  ['🔥', 'Fire'],
  ['⚡', 'Lightning'],
  ['❤️', 'Heart'],
  ['✅', 'Done'],
  ['🔒', 'Private'],
  ['🌍', 'World'],
  ['🍀', 'Luck'],
  ['🎓', 'Study'],
  ['🏃', 'Exercise'],
] as const;

/** lucide-react component names; the renderer maps each to its component. */
export const LUCIDE_ICONS = [
  ['Folder', 'Folder'],
  ['Book', 'Book'],
  ['Bookmark', 'Bookmark'],
  ['Briefcase', 'Briefcase'],
  ['Calendar', 'Calendar'],
  ['Camera', 'Camera'],
  ['ChartColumn', 'Chart'],
  ['CircleCheck', 'Check'],
  ['Clipboard', 'Clipboard'],
  ['Code', 'Code'],
  ['Coffee', 'Coffee'],
  ['Compass', 'Compass'],
  ['Cpu', 'Chip'],
  ['Database', 'Database'],
  ['FileText', 'Document'],
  ['Flag', 'Flag'],
  ['Gift', 'Gift'],
  ['Globe', 'Globe'],
  ['House', 'House'],
  ['Key', 'Key'],
  ['Layers', 'Layers'],
  ['Lightbulb', 'Light bulb'],
  ['Map', 'Map'],
  ['Megaphone', 'Megaphone'],
  ['Package', 'Package'],
  ['Palette', 'Palette'],
  ['Plane', 'Plane'],
  ['Shield', 'Shield'],
  ['Users', 'People'],
  ['Wrench', 'Wrench'],
] as const;

export const ICONS = [
  ...EMOJI_ICONS.map(([char, label]) => ({ value: `emoji:${char}`, label })),
  ...LUCIDE_ICONS.map(([name, label]) => ({ value: `lucide:${name}`, label })),
];

export const ICON_VALUES = ICONS.map((icon) => icon.value) as [string, ...string[]];

export type LucideIconName = (typeof LUCIDE_ICONS)[number][0];

/** What a stored icon value means, or null when it is not one of the built-in icons. */
export function parseIcon(
  value: string | null,
): { kind: 'emoji'; char: string } | { kind: 'lucide'; name: LucideIconName } | null {
  if (value === null || !ICON_VALUES.includes(value)) return null;
  const [kind, rest] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)];
  return kind === 'emoji'
    ? { kind: 'emoji', char: rest }
    : { kind: 'lucide', name: rest as LucideIconName };
}

export function iconLabel(value: string): string {
  return ICONS.find((icon) => icon.value === value)?.label ?? 'Icon';
}

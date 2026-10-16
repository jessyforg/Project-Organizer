/**
 * Case-insensitive uniqueness key for user-visible names. SQLite's NOCASE folds only
 * ASCII, so names such as "Ñora" and "ñora" are compared through this key instead.
 */
export function nameKey(name: string): string {
  return name.trim().normalize('NFC').toLowerCase();
}

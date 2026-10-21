import type { Accent, Surface } from '@shared/domain';
import { paletteTokens, type Mode } from '@shared/palettes';

/**
 * Applies the palette as inline custom properties on the root element, which override
 * tokens.css. Setting properties through the CSSOM is allowed by the Content Security Policy,
 * unlike a <style> element.
 */
export function applyPalette(accent: Accent, surface: Surface, mode: Mode): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(paletteTokens(accent, surface, mode))) {
    root.style.setProperty(name, value);
  }
  root.dataset['accent'] = accent;
  root.dataset['surface'] = surface;
}

/**
 * Removes the palette, so tokens.css applies again (blue and cool, following the theme). Used
 * where no profile is open: a palette left from a profile could otherwise be for the other mode,
 * putting light text on light surfaces.
 */
export function resetPalette(): void {
  const root = document.documentElement;
  for (const name of Object.keys(paletteTokens('blue', 'cool', 'light'))) {
    root.style.removeProperty(name);
  }
  delete root.dataset['accent'];
  delete root.dataset['surface'];
}

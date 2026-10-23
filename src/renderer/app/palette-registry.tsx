import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { MenuItem } from '../components/ui';

/** Actions a screen adds to the command palette while it is shown (ADR-0018). */
export interface PaletteSource {
  /** The section heading, such as "Note: Roadmap". Sources with the same group are merged. */
  group: string;
  /** Read when the palette opens, so the items match what is on screen. */
  items: () => MenuItem[];
}

interface Registry {
  register: (source: { readonly current: PaletteSource }) => () => void;
  sources: () => PaletteSource[];
}

const RegistryContext = createContext<Registry | null>(null);

export function PaletteRegistryProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Set<{ readonly current: PaletteSource }>());
  const registry = useMemo<Registry>(
    () => ({
      register: (source) => {
        entries.current.add(source);
        return () => entries.current.delete(source);
      },
      sources: () => [...entries.current].map((source) => source.current),
    }),
    [],
  );
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

/** The registered sources, read when the palette opens. Empty outside the provider. */
export function usePaletteSources(): () => PaletteSource[] {
  const registry = useContext(RegistryContext);
  return registry?.sources ?? noSources;
}

const noSources = () => [];

/**
 * Adds this screen's actions to the command palette. Pass the same items the screen's buttons
 * and menus use, so an action from the palette runs exactly the same code (ADR-0018).
 */
export function usePaletteActions(group: string, items: () => MenuItem[]): void {
  const registry = useContext(RegistryContext);
  const latest = useRef<PaletteSource>({ group, items });
  useEffect(() => {
    latest.current = { group, items };
  });
  useEffect(() => registry?.register(latest), [registry]);
}

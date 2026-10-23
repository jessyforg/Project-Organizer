import { createContext, useEffect, useState } from 'react';
import type { AppLinkTarget } from '@shared/app-links';
import type { AppLinkInfo, Note } from '@shared/domain';
import { useDataVersion, useInvalidate } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { CATEGORY_LABEL } from '../../lib/format';
import type { LinkResolver } from '../editor/app-link';

/** How many items the [[ and @ pickers list. */
export const PICKER_LIMIT = 8;
const BATCH = 500;
const SEARCH_LIMIT = 50;

interface Actions {
  open: (target: AppLinkTarget, info: AppLinkInfo | undefined, focus: boolean) => void;
  searchNotes: (query: string) => Promise<AppLinkInfo[]>;
  searchMentions: (query: string) => Promise<AppLinkInfo[]>;
  createNote: (title: string) => Promise<AppLinkInfo | null>;
}

/** Title matches first (starting with the query, then containing it), then the rest. */
function byTitleMatch<T extends { label: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  const rank = (item: T) => {
    const title = item.label.toLowerCase();
    return title.startsWith(q) ? 0 : title.includes(q) ? 1 : 2;
  };
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

const key = (t: AppLinkTarget) => `${t.kind}/${t.id}`;

/**
 * Looks up the current titles of linked items for a note's editor and preview (ADR-0017):
 * requests are batched into one call, and everything known is looked up again after any change
 * to data, so renamed or trashed items show correctly.
 */
export function createLinkResolver(): LinkResolver & {
  refresh: () => void;
  setActions: (actions: Actions) => void;
} {
  const known = new Map<string, AppLinkInfo>();
  const pending = new Map<string, AppLinkTarget>();
  const listeners = new Set<() => void>();
  let version = 0;
  let scheduled = false;
  let actions: Actions = {
    open: () => undefined,
    searchNotes: () => Promise.resolve([]),
    searchMentions: () => Promise.resolve([]),
    createNote: () => Promise.resolve(null),
  };

  const flush = async () => {
    scheduled = false;
    const targets = [...pending.values()];
    pending.clear();
    for (let i = 0; i < targets.length; i += BATCH) {
      const result = await window.api.links.resolve({ targets: targets.slice(i, i + BATCH) });
      if (!result.ok) continue;
      for (const info of result.data) known.set(key(info), info);
    }
    version += 1;
    listeners.forEach((listener) => listener());
  };
  const schedule = () => {
    if (scheduled || pending.size === 0) return;
    scheduled = true;
    queueMicrotask(() => void flush());
  };

  return {
    info: (target) => known.get(key(target)),
    request: (target) => {
      if (known.has(key(target))) return;
      pending.set(key(target), target);
      schedule();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    version: () => version,
    open: (target, { focus }) => actions.open(target, known.get(key(target)), focus),
    searchNotes: (query) => actions.searchNotes(query),
    searchMentions: (query) => actions.searchMentions(query),
    createNote: (title) => actions.createNote(title),
    refresh: () => {
      for (const info of known.values()) pending.set(key(info), { kind: info.kind, id: info.id });
      schedule();
    },
    setActions: (next) => {
      actions = next;
    },
  };
}

/** The resolver of the note on screen, for the Markdown preview. */
export const LinkResolverContext = createContext<LinkResolver | null>(null);

/** A link resolver for `note`: opens links with the app's navigation and searches its notes. */
export function useLinkResolver(note: Pick<Note, 'id' | 'projectId' | 'folderId'>): LinkResolver {
  const [resolver] = useState(createLinkResolver);
  const version = useDataVersion();
  const { navigate, openTask } = useNavigation();
  const invalidate = useInvalidate();
  const toast = useToast();

  useEffect(() => resolver.refresh(), [resolver, version]);

  useEffect(() => {
    resolver.setActions({
      open: (target, info, focus) => {
        if (target.kind === 'note') navigate({ name: 'notes', noteId: target.id, focus });
        else if (target.kind === 'project') navigate({ name: 'project', id: target.id });
        else if (info) openTask(target.id);
      },
      searchNotes: async (query) => {
        const text = query.trim();
        const result = await window.api.notes.list({
          ...(text ? { text } : {}),
          archived: 'include',
          includeArchived: true,
          // More than are shown, so title matches can be ranked first.
          limit: SEARCH_LIMIT,
        });
        if (!result.ok) return [];
        // The search covers bodies too; notes whose title matches come first.
        const notes = result.data
          .filter((n) => n.id !== note.id)
          .map((n) => ({
            kind: 'note' as const,
            id: n.id,
            label: n.title,
            missing: false,
            archived: n.archivedAt !== null,
            projectId: n.projectId,
          }));
        return byTitleMatch(notes, text).slice(0, PICKER_LIMIT);
      },
      searchMentions: async (query) => {
        const text = query.trim();
        if (!text) return [];
        const result = await window.api.search.query({ text });
        if (!result.ok) return [];
        const tasks: AppLinkInfo[] = result.data.tasks.map((t) => ({
          kind: 'task',
          id: t.id,
          label: t.title,
          missing: false,
          archived: false,
          projectId: t.projectId,
          dueDate: t.dueDate,
          status: { name: CATEGORY_LABEL[t.statusCategory], category: t.statusCategory },
        }));
        const projects: AppLinkInfo[] = result.data.projects.map((p) => ({
          kind: 'project',
          id: p.id,
          label: p.name,
          missing: false,
          archived: p.archivedAt !== null,
          projectId: null,
        }));
        return byTitleMatch([...tasks, ...projects], text).slice(0, PICKER_LIMIT);
      },
      createNote: async (title) => {
        // A new note goes beside the current one: same project and folder.
        const result = await window.api.notes.create({
          title,
          projectId: note.projectId,
          folderId: note.folderId,
        });
        if (!result.ok) {
          toast({ message: `The note was not created. ${result.error.message}`, tone: 'error' });
          return null;
        }
        invalidate();
        toast({ message: `Created “${result.data.title}”.` });
        return {
          kind: 'note',
          id: result.data.id,
          label: result.data.title,
          missing: false,
          archived: false,
          projectId: result.data.projectId,
        };
      },
    });
  });

  return resolver;
}
